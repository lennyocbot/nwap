import { useRef, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import { cx, colorFor, fileToDataURL, fmtDateTime } from '../lib/utils.js'

export default function Files() {
  const { state, add, remove, showToast } = useApp()
  const inputRef = useRef(null)
  const [filter, setFilter] = useState('all')

  const onPick = async (ev) => {
    const files = Array.from(ev.target.files || [])
    for (const f of files) {
      if (f.size > 5 * 1024 * 1024) { showToast(`Skipped ${f.name} (>5 MB)`, 'error'); continue }
      try {
        const data = await fileToDataURL(f)
        add('files', {
          name: f.name, size: f.size, type: f.type,
          subjectId: null, data, createdAt: Date.now(),
        })
      } catch { showToast(`Failed ${f.name}`, 'error') }
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  const list = state.files.filter((f) => filter === 'all' || f.subjectId === filter)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input max-w-[220px]" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All subjects</option>
          {state.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="text-sm text-ink-500">{state.files.length} files · stored locally on device</div>
        <div className="flex-1" />
        <input ref={inputRef} type="file" multiple hidden onChange={onPick} />
        <button className="btn-primary" onClick={() => inputRef.current?.click()}><Icon.upload className="w-4 h-4" /> Upload</button>
      </div>

      {list.length === 0 ? (
        <div className="card p-10 text-center text-ink-500">
          <div className="text-5xl mb-2">📎</div>
          No files yet — upload PDFs, images, or study docs.
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
                  {isImg ? <img src={f.data} alt={f.name} className="w-full h-full object-cover" />
                    : <div className="text-4xl">{fileEmoji(f.type)}</div>}
                </div>
                <div className="text-sm font-medium truncate">{f.name}</div>
                <div className="text-xs text-ink-500">{fmtSize(f.size)} · {fmtDateTime(f.createdAt)}</div>
                <div className="mt-2 flex gap-1">
                  <a className="btn-soft flex-1" href={f.data} download={f.name}><Icon.download className="w-4 h-4" /> Open</a>
                  <button className="btn-ghost text-rose-600" onClick={() => remove('files', f.id)}><Icon.trash className="w-4 h-4" /></button>
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
  if (type.startsWith('image/')) return '🖼️'
  if (type.startsWith('video/')) return '🎬'
  if (type.startsWith('audio/')) return '🎧'
  if (type.includes('pdf')) return '📄'
  if (type.includes('zip')) return '🗜️'
  if (type.includes('text') || type.includes('markdown')) return '📝'
  return '📁'
}
