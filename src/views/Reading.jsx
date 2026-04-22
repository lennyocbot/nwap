import { useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import Modal from '../components/Modal.jsx'
import { cx } from '../lib/utils.js'

const statuses = ['queued', 'reading', 'done']

export default function Reading() {
  const { state, add, update, remove } = useApp()
  const [edit, setEdit] = useState(null)

  const create = () => {
    const r = add('reading', { title: 'New book', author: '', url: '', status: 'queued', notes: '', rating: 0, progress: 0 })
    setEdit(r)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <div className="text-sm text-ink-500">{state.reading.length} items</div>
        <div className="flex-1" />
        <button className="btn-primary" onClick={create}><Icon.plus className="w-4 h-4" /> Add book</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {statuses.map((col) => (
          <div key={col} className="card p-3">
            <div className="font-display font-semibold capitalize px-2 py-1">{col}</div>
            <ul className="space-y-2 mt-2">
              {state.reading.filter((r) => r.status === col).map((r) => (
                <li key={r.id} className="p-3 rounded-2xl bg-ink-50 dark:bg-ink-800 cursor-pointer" onClick={() => setEdit(r)}>
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-ink-500">{r.author || '—'}</div>
                  {r.status === 'reading' && (
                    <div className="mt-2 h-1.5 rounded-full bg-ink-200 dark:bg-ink-700 overflow-hidden">
                      <div className="h-full bg-brand-500" style={{ width: `${r.progress || 0}%` }} />
                    </div>
                  )}
                  {r.status === 'done' && (
                    <div className="mt-1 text-xs">{'★'.repeat(r.rating || 0).padEnd(5, '☆')}</div>
                  )}
                </li>
              ))}
              {state.reading.filter((r) => r.status === col).length === 0 && <li className="text-center text-xs text-ink-500 py-3">Empty</li>}
            </ul>
          </div>
        ))}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title="Reading item"
        footer={
          <>
            <button className="btn-ghost text-rose-600" onClick={() => { remove('reading', edit.id); setEdit(null) }}><Icon.trash className="w-4 h-4" /> Delete</button>
            <button className="btn-primary" onClick={() => setEdit(null)}>Done</button>
          </>
        }>
        {edit && (
          <div className="space-y-3">
            <input className="input text-lg" value={edit.title}
              onChange={(e) => { update('reading', { id: edit.id, title: e.target.value }); setEdit({ ...edit, title: e.target.value }) }} />
            <input className="input" placeholder="Author" value={edit.author || ''}
              onChange={(e) => { update('reading', { id: edit.id, author: e.target.value }); setEdit({ ...edit, author: e.target.value }) }} />
            <input className="input" placeholder="URL (optional)" value={edit.url || ''}
              onChange={(e) => { update('reading', { id: edit.id, url: e.target.value }); setEdit({ ...edit, url: e.target.value }) }} />
            <div className="grid grid-cols-2 gap-2">
              <select className="input" value={edit.status} onChange={(e) => { update('reading', { id: edit.id, status: e.target.value }); setEdit({ ...edit, status: e.target.value }) }}>
                {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input type="number" min={0} max={100} className="input" value={edit.progress || 0}
                onChange={(e) => { update('reading', { id: edit.id, progress: Number(e.target.value) }); setEdit({ ...edit, progress: Number(e.target.value) }) }}
                placeholder="Progress %" />
            </div>
            <div className="flex items-center gap-1 text-2xl">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => { update('reading', { id: edit.id, rating: n }); setEdit({ ...edit, rating: n }) }}
                  className={cx(n <= (edit.rating || 0) ? 'text-amber-400' : 'text-ink-300')}>★</button>
              ))}
            </div>
            <textarea className="input min-h-[100px]" placeholder="Notes & quotes" value={edit.notes || ''}
              onChange={(e) => { update('reading', { id: edit.id, notes: e.target.value }); setEdit({ ...edit, notes: e.target.value }) }} />
          </div>
        )}
      </Modal>
    </div>
  )
}
