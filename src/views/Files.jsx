import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import { supabase } from '../lib/supabase.js'
import { cx, colorFor, fileToDataURL, fmtDateTime, uid } from '../lib/utils.js'

export default function Files() {
  const { state, add, remove, update, showToast, account } = useApp()
  const inputRef = useRef(null)
  const [filter, setFilter] = useState('all')
  const [uploading, setUploading] = useState(false)
  const [signedUrls, setSignedUrls] = useState({})
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
