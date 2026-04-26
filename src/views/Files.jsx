import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import { supabase } from '../lib/supabase.js'
import { cx, colorFor, fileToDataURL, fmtDateTime, uid } from '../lib/utils.js'
import { aiGenerateFlashcards, buildSystemPrompt, callAI } from '../lib/ai.js'
import { normalizeAIText } from '../lib/text.js'

export default function Files() {
  const { state, add, remove, update, showToast, account } = useApp()
  const inputRef = useRef(null)
  const [filter, setFilter] = useState('all')
  const [uploading, setUploading] = useState(false)
  const [signedUrls, setSignedUrls] = useState({})
  const [aiBusy, setAiBusy] = useState(null)
  const cloudFilesEnabled = Boolean(supabase && account.user)

  const onPick = async (ev) => {
    const files = Array.from(ev.target.files || [])
    setUploading(true)
    for (const f of files) {
      if (f.size > 10 * 1024 * 1024) { showToast(`Skipped ${f.name} (>10 MB)`, 'error'); continue }
      try {
        if (cloudFilesEnabled) await uploadCloudFile(f)
        else await uploadLocalFile(f)
      } catch (error) {
        showToast(error?.message || `Failed ${f.name}`, 'error')
      }
    }
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const list = state.files.filter((f) => filter === 'all' || f.subjectId === filter)

  useEffect(() => {
    if (!cloudFilesEnabled) return
    const targets = list.filter((f) => f.storagePath && f.type?.startsWith('image/') && !signedUrls[f.id])
    if (!targets.length) return

    let cancelled = false
    const loadUrls = async () => {
      const entries = await Promise.all(targets.map(async (file) => {
        const { data, error } = await supabase.storage.from('user-files').createSignedUrl(file.storagePath, 60 * 60)
        if (error || !data?.signedUrl) return null
        return [file.id, data.signedUrl]
      }))
      if (cancelled) return
      setSignedUrls((current) => ({
        ...current,
        ...Object.fromEntries(entries.filter(Boolean)),
      }))
    }
    loadUrls()
    return () => { cancelled = true }
  }, [cloudFilesEnabled, list, signedUrls])

  const uploadCloudFile = async (file) => {
    const fileId = uid()
    const storagePath = `${account.user.id}/${fileId}/${safeFileName(file.name)}`
    const { error } = await supabase.storage.from('user-files').upload(storagePath, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
    if (error) throw error

    add('files', {
      id: fileId,
      name: file.name,
      size: file.size,
      type: file.type,
      subjectId: null,
      storagePath,
      createdAt: Date.now(),
    })
    showToast(`Uploaded ${file.name} to cloud`, 'success')
  }

  const uploadLocalFile = async (file) => {
    const data = await fileToDataURL(file)
    add('files', {
      name: file.name,
      size: file.size,
      type: file.type,
      subjectId: null,
      data,
      createdAt: Date.now(),
    })
    showToast(`Added ${file.name} locally`, 'success')
  }

  const openFile = async (file) => {
    let url = file.data || signedUrls[file.id]
    if (file.storagePath && cloudFilesEnabled) {
      const { data, error } = await supabase.storage.from('user-files').createSignedUrl(file.storagePath, 60 * 10)
      if (error) {
        showToast(error.message, 'error')
        return
      }
      url = data?.signedUrl
      if (url && file.type?.startsWith('image/')) setSignedUrls((current) => ({ ...current, [file.id]: url }))
    }
    if (!url) {
      showToast('File is not available in this workspace', 'error')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const deleteFile = async (file) => {
    if (file.storagePath && cloudFilesEnabled) {
      const { error } = await supabase.storage.from('user-files').remove([file.storagePath])
      if (error) {
        showToast(error.message, 'error')
        return
      }
    }
    remove('files', file.id)
    setSignedUrls((current) => {
      const next = { ...current }
      delete next[file.id]
      return next
    })
    showToast('File removed', 'success')
  }

  const fileSourceText = async (file) => {
    if (isPdfLike(file.type, file.name)) return pdfTextFromBytes(await fileBytes(file))
    if (!isTextLike(file.type, file.name)) return ''
    if (file.data) return dataUrlText(file.data)
    if (file.storagePath && cloudFilesEnabled) {
      const { data, error } = await supabase.storage.from('user-files').createSignedUrl(file.storagePath, 60 * 5)
      if (error) throw error
      const res = await fetch(data.signedUrl)
      if (!res.ok) throw new Error(`Could not read file text (${res.status})`)
      return res.text()
    }
    return ''
  }

  const summarizeFile = async (file) => {
    setAiBusy(file.id)
    try {
      const text = await fileSourceText(file)
      if (!text.trim()) {
        showToast('AI file tools support text, markdown, and readable PDFs', 'info')
        return
      }
      const subject = state.subjects.find((s) => s.id === file.subjectId)?.name || 'General'
      const summary = await callAI({
        settings: state.settings,
        system: buildSystemPrompt(state, `Summarizing an uploaded study file for ${subject}.`),
        messages: [{
          role: 'user',
          content: `Summarize this uploaded file for revision. Include key ideas, formulas/definitions, likely exam questions, and next actions.\n\nFile: ${file.name}\n\n${text.slice(0, 12000)}`
        }],
      })
      const note = add('notes', {
        title: `${file.name} summary`,
        content: normalizeAIText(summary),
        subjectId: file.subjectId || null,
        tags: ['file', 'summary'],
        pinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      showToast(`Created note "${note.title}"`, 'success')
    } catch (error) {
      showToast(error.message || 'AI file summary failed', 'error')
    } finally {
      setAiBusy(null)
    }
  }

  const flashcardsFromFile = async (file) => {
    setAiBusy(file.id)
    try {
      const text = await fileSourceText(file)
      if (!text.trim()) {
        showToast('AI file tools support text, markdown, and readable PDFs', 'info')
        return
      }
      const cards = await aiGenerateFlashcards({ settings: state.settings, state, source: text.slice(0, 12000), n: 10 })
      const deck = add('decks', { name: `${file.name} cards`, subjectId: file.subjectId || null, color: 'brand' })
      cards.forEach((card) => add('flashcards', {
        deckId: deck.id,
        front: normalizeAIText(card.front),
        back: normalizeAIText(card.back),
        ease: 2.5,
        interval: 1,
        due: Date.now(),
        reviews: 0,
      }))
      showToast(`Created ${cards.length} flashcards`, 'success')
    } catch (error) {
      showToast(error.message || 'AI flashcards failed', 'error')
    } finally {
      setAiBusy(null)
    }
  }

  const mindMapFromFile = async (file) => {
    setAiBusy(file.id)
    try {
      const text = await fileSourceText(file)
      if (!text.trim()) {
        showToast('AI file tools support text, markdown, and readable PDFs', 'info')
        return
      }
      const data = await callAI({
        settings: state.settings,
        system: buildSystemPrompt(state, 'Generating a mind map from an uploaded file.'),
        json: true,
        messages: [{
          role: 'user',
          content: `Create a concise study mind map from this uploaded file. Return JSON only: {"title":"...","root":{"label":"...","children":[{"label":"...","children":[{"label":"..."}]}]}}.\n\nFile: ${file.name}\n\n${text.slice(0, 12000)}`
        }],
      })
      const root = normalizeTree(data?.root || { label: file.name })
      add('mindmaps', { title: data?.title || `${file.name} mind map`, root, positions: {} })
      showToast('Created file mind map', 'success')
    } catch (error) {
      showToast(error.message || 'AI mind map failed', 'error')
    } finally {
      setAiBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input max-w-[220px]" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All subjects</option>
          {state.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="text-sm text-ink-500">
          {state.files.length} files - {cloudFilesEnabled ? 'private cloud storage' : 'local demo only'}
        </div>
        <div className="flex-1" />
        <input ref={inputRef} type="file" multiple hidden onChange={onPick} />
        <button className="btn-primary" onClick={() => inputRef.current?.click()} disabled={uploading}>
          <Icon.upload className="w-4 h-4" /> {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </div>

      {list.length === 0 ? (
        <div className="card p-10 text-center text-ink-500">
          <Icon.files className="w-12 h-12 mx-auto mb-3 text-ink-300" />
          No files yet - upload PDFs, images, or study docs.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {list.map((f) => {
            const s = state.subjects.find((x) => x.id === f.subjectId)
            const c = colorFor(s?.color || 'brand')
            const isImg = f.type?.startsWith('image/')
            return (
              <div key={f.id} className="card p-3 group">
                <div className={cx('aspect-[4/3] rounded-2xl flex items-center justify-center overflow-hidden mb-2', c.soft)}>
                  {isImg && (f.data || signedUrls[f.id]) ? <img src={f.data || signedUrls[f.id]} alt={f.name} className="w-full h-full object-cover" />
                    : <div className="text-4xl">{fileEmoji(f.type)}</div>}
                </div>
                <div className="text-sm font-medium truncate">{f.name}</div>
                <div className="text-xs text-ink-500">{fmtSize(f.size)} - {fmtDateTime(f.createdAt)}</div>
                <select
                  className="input mt-2 text-xs py-1"
                  value={f.subjectId || ''}
                  onChange={(e) => update('files', { ...f, subjectId: e.target.value || null })}
                >
                  <option value="">No subject</option>
                  {state.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <div className="mt-2 flex gap-1">
                  <button className="btn-soft flex-1" onClick={() => openFile(f)}><Icon.download className="w-4 h-4" /> Open</button>
                  <button className="btn-ghost text-rose-600" onClick={() => deleteFile(f)}><Icon.trash className="w-4 h-4" /></button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1">
                  <button className="btn-soft !px-2 text-xs" onClick={() => summarizeFile(f)} disabled={aiBusy === f.id}>
                    <Icon.sparkle className="w-3 h-3" /> Note
                  </button>
                  <button className="btn-soft !px-2 text-xs" onClick={() => flashcardsFromFile(f)} disabled={aiBusy === f.id}>
                    <Icon.cards className="w-3 h-3" /> Cards
                  </button>
                  <button className="btn-soft !px-2 text-xs" onClick={() => mindMapFromFile(f)} disabled={aiBusy === f.id}>
                    <Icon.mindmap className="w-3 h-3" /> Map
                  </button>
                </div>
                {aiBusy === f.id && <div className="mt-2 text-xs text-ink-500 animate-pulse-soft">AI working...</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function fmtSize(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
function fileEmoji(type = '') {
  if (type.startsWith('image/')) return 'IMG'
  if (type.startsWith('video/')) return 'VID'
  if (type.startsWith('audio/')) return 'AUD'
  if (type.includes('pdf')) return 'PDF'
  if (type.includes('zip')) return 'ZIP'
  if (type.includes('text') || type.includes('markdown')) return 'TXT'
  return 'FILE'
}

function safeFileName(name = 'upload') {
  return name.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'upload'
}

function isTextLike(type = '', name = '') {
  return type.startsWith('text/')
    || type.includes('json')
    || type.includes('markdown')
    || /\.(txt|md|csv|json|tex)$/i.test(name)
}

function isPdfLike(type = '', name = '') {
  return type.includes('pdf') || /\.pdf$/i.test(name)
}

function dataUrlText(dataUrl) {
  const [, meta = '', payload = ''] = dataUrl.match(/^data:([^,]*),(.*)$/) || []
  if (!payload) return ''
  const decoded = meta.includes(';base64') ? atob(payload) : decodeURIComponent(payload)
  try {
    return new TextDecoder().decode(Uint8Array.from(decoded, (char) => char.charCodeAt(0)))
  } catch {
    return decoded
  }
}

async function fileBytes(file) {
  if (file.data) return dataUrlBytes(file.data)
  if (file.storagePath && supabase) {
    const { data, error } = await supabase.storage.from('user-files').createSignedUrl(file.storagePath, 60 * 5)
    if (error) throw error
    const res = await fetch(data.signedUrl)
    if (!res.ok) throw new Error(`Could not read file (${res.status})`)
    return new Uint8Array(await res.arrayBuffer())
  }
  return new Uint8Array()
}

function dataUrlBytes(dataUrl) {
  const [, meta = '', payload = ''] = dataUrl.match(/^data:([^,]*),(.*)$/) || []
  if (!payload) return new Uint8Array()
  if (!meta.includes(';base64')) return new TextEncoder().encode(decodeURIComponent(payload))
  const raw = atob(payload)
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

async function pdfTextFromBytes(bytes) {
  if (!bytes?.length) return ''
  const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.mjs?url'),
  ])
  GlobalWorkerOptions.workerSrc = worker.default
  const pdf = await getDocument({ data: bytes }).promise
  const pages = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = content.items.map((item) => item.str || '').join(' ').replace(/\s+/g, ' ').trim()
    if (text) pages.push(`Page ${pageNumber}\n${text}`)
  }
  return pages.join('\n\n')
}

function normalizeTree(node) {
  return {
    id: uid(),
    label: String(node?.label || 'Mind map').slice(0, 80),
    children: (node?.children || []).slice(0, 8).map(normalizeTree),
  }
}
