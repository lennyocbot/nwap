import { useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import Modal from '../components/Modal.jsx'
import { cx, colorFor, fmtTime } from '../lib/utils.js'

const days = [
  { n: 1, label: 'Mon' }, { n: 2, label: 'Tue' }, { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' }, { n: 5, label: 'Fri' }, { n: 6, label: 'Sat' }, { n: 7, label: 'Sun' },
]

const hours = Array.from({ length: 14 }, (_, i) => i + 7) // 7am–8pm

export default function Timetable() {
  const { state, add, update, remove } = useApp()
  const [edit, setEdit] = useState(null)
  const todayN = (() => { const d = new Date().getDay(); return d === 0 ? 7 : d })()

  const addSlot = (day) => {
    const slot = add('timetable', {
      day, start: '09:00', end: '10:00',
      subjectId: state.subjects[0]?.id || null, room: '',
    })
    setEdit(slot)
  }

  const rowFor = (start, end) => {
    const [h1, m1] = start.split(':').map(Number)
    const [h2, m2] = end.split(':').map(Number)
    const from = (h1 - 7) * 60 + m1
    const to = (h2 - 7) * 60 + m2
    return { top: (from / 60) * 56, height: Math.max(28, ((to - from) / 60) * 56) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="text-sm text-ink-500">Weekly schedule</div>
        <div className="flex-1" />
        <button className="btn-primary" onClick={() => addSlot(todayN)}><Icon.plus className="w-4 h-4" /> New slot</button>
      </div>

      <div className="card p-3 overflow-x-auto">
        <div className="grid" style={{ gridTemplateColumns: '56px repeat(7, minmax(120px,1fr))' }}>
          <div />
          {days.map((d) => (
            <div key={d.n} className={cx('text-center text-xs font-semibold py-2', d.n === todayN && 'text-brand-600')}>{d.label}</div>
          ))}
          {/* time column */}
          <div className="relative border-r border-ink-100 dark:border-ink-800">
            {hours.map((h) => (
              <div key={h} className="h-14 text-[10px] text-ink-400 pr-2 text-right pt-1">{h}:00</div>
            ))}
          </div>
          {days.map((d) => (
            <div key={d.n} className="relative border-l border-ink-100 dark:border-ink-800" style={{ minHeight: hours.length * 56 }}>
              {hours.map((h) => <div key={h} className="h-14 border-b border-ink-100 dark:border-ink-800" />)}
              {state.timetable.filter((t) => t.day === d.n).map((t) => {
                const s = state.subjects.find((x) => x.id === t.subjectId)
                const c = colorFor(s?.color)
                const pos = rowFor(t.start, t.end)
                return (
                  <button key={t.id} onClick={() => setEdit(t)}
                    className={cx('absolute left-1 right-1 rounded-xl text-left text-xs p-2 shadow-sm hover:shadow-pop transition text-white', c.bg)}
                    style={{ top: pos.top, height: pos.height }}>
                    <div className="font-semibold truncate">{s?.emoji} {s?.name || 'Subject'}</div>
                    <div className="opacity-80 truncate">{fmtTime(t.start)}–{fmtTime(t.end)} · {t.room}</div>
                  </button>
                )
              })}
              <button onClick={() => addSlot(d.n)} className="absolute bottom-1 left-1 right-1 text-[10px] text-ink-400 hover:text-brand-600">+ add</button>
            </div>
          ))}
        </div>
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title="Edit class"
        footer={
          <>
            <button className="btn-ghost text-rose-600" onClick={() => { remove('timetable', edit.id); setEdit(null) }}>
              <Icon.trash className="w-4 h-4" /> Delete
            </button>
            <button className="btn-primary" onClick={() => setEdit(null)}>Done</button>
          </>
        }>
        {edit && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-ink-500 mb-1">Day</div>
                <select className="input" value={edit.day} onChange={(e) => { const v = Number(e.target.value); update('timetable', { id: edit.id, day: v }); setEdit({ ...edit, day: v }) }}>
                  {days.map((d) => <option key={d.n} value={d.n}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-ink-500 mb-1">Subject</div>
                <select className="input" value={edit.subjectId || ''}
                  onChange={(e) => { const v = e.target.value || null; update('timetable', { id: edit.id, subjectId: v }); setEdit({ ...edit, subjectId: v }) }}>
                  <option value="">None</option>
                  {state.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-ink-500 mb-1">Start</div>
                <input type="time" className="input" value={edit.start}
                  onChange={(e) => { update('timetable', { id: edit.id, start: e.target.value }); setEdit({ ...edit, start: e.target.value }) }} />
              </div>
              <div>
                <div className="text-xs text-ink-500 mb-1">End</div>
                <input type="time" className="input" value={edit.end}
                  onChange={(e) => { update('timetable', { id: edit.id, end: e.target.value }); setEdit({ ...edit, end: e.target.value }) }} />
              </div>
              <div className="col-span-2">
                <div className="text-xs text-ink-500 mb-1">Room</div>
                <input className="input" value={edit.room || ''}
                  onChange={(e) => { update('timetable', { id: edit.id, room: e.target.value }); setEdit({ ...edit, room: e.target.value }) }} />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
