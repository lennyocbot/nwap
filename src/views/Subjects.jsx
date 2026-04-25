import { useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import Modal from '../components/Modal.jsx'
import { cx, colorFor, subjectColors } from '../lib/utils.js'

export default function Subjects() {
  const { state, add, update, remove, navigate } = useApp()
  const [edit, setEdit] = useState(null)

  const create = () => {
    const s = add('subjects', { name: 'New subject', teacher: '', room: '', color: 'brand', emoji: 'S', target: 85 })
    setEdit(s)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="text-sm text-ink-500">{state.subjects.length} subjects</div>
        <div className="flex-1" />
        <button className="btn-primary" onClick={create}><Icon.plus className="w-4 h-4" /> Add subject</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {state.subjects.map((s) => {
          const c = colorFor(s.color)
          const count = {
            notes: state.notes.filter((n) => n.subjectId === s.id).length,
            assignments: state.assignments.filter((a) => a.subjectId === s.id && a.status !== 'done').length,
            decks: state.decks.filter((d) => d.subjectId === s.id).length,
            grades: state.grades.filter((g) => g.subjectId === s.id),
          }
          const avg = count.grades.length ? Math.round(count.grades.reduce((a, g) => a + g.score / g.outOf * 100, 0) / count.grades.length) : null
          return (
            <div key={s.id} className="card p-4">
              <div className="flex items-center gap-3">
                <div className={cx('w-12 h-12 rounded-2xl flex items-center justify-center text-white text-2xl', c.bg)}>{s.emoji || 'S'}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-semibold truncate">{s.name}</div>
                  <div className="text-xs text-ink-500 truncate">{s.teacher} {s.room && `- ${s.room}`}</div>
                </div>
                <button className="btn-ghost" onClick={() => setEdit(s)}><Icon.dots className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-4 gap-1 mt-4 text-center">
                <Stat label="Notes" value={count.notes} onClick={() => navigate('notes', { subject: s.id })} />
                <Stat label="Open" value={count.assignments} onClick={() => navigate('assignments')} />
                <Stat label="Decks" value={count.decks} onClick={() => navigate('revision')} />
                <Stat label="Avg" value={avg != null ? `${avg}%` : '-'} onClick={() => navigate('grades')} />
              </div>
              {s.target && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-ink-500 mb-1">
                    <span>Target {s.target}%</span>
                    <span>{avg != null ? `${avg}%` : '-'}</span>
                  </div>
                  <div className="h-2 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden">
                    <div className={cx('h-full', c.bg)} style={{ width: `${Math.min(100, (avg || 0))}%` }} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title="Subject"
        footer={
          <>
            <button className="btn-ghost text-rose-600" onClick={() => { remove('subjects', edit.id); setEdit(null) }}>
              <Icon.trash className="w-4 h-4" /> Delete
            </button>
            <button className="btn-primary" onClick={() => setEdit(null)}>Done</button>
          </>
        }>
        {edit && (
          <div className="space-y-3">
            <div className="grid grid-cols-[auto_1fr] gap-3 items-center">
              <input className="input text-2xl w-16 text-center" maxLength={3} value={edit.emoji}
                onChange={(e) => { update('subjects', { id: edit.id, emoji: e.target.value }); setEdit({ ...edit, emoji: e.target.value }) }} />
              <input className="input text-lg font-semibold" value={edit.name}
                onChange={(e) => { update('subjects', { id: edit.id, name: e.target.value }); setEdit({ ...edit, name: e.target.value }) }} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="Teacher" value={edit.teacher}
                onChange={(e) => { update('subjects', { id: edit.id, teacher: e.target.value }); setEdit({ ...edit, teacher: e.target.value }) }} />
              <input className="input" placeholder="Room" value={edit.room}
                onChange={(e) => { update('subjects', { id: edit.id, room: e.target.value }); setEdit({ ...edit, room: e.target.value }) }} />
            </div>
            <div>
              <div className="text-xs text-ink-500 mb-1">Target grade (%)</div>
              <input type="number" className="input" value={edit.target || 0} min={0} max={100}
                onChange={(e) => { update('subjects', { id: edit.id, target: Number(e.target.value) }); setEdit({ ...edit, target: Number(e.target.value) }) }} />
            </div>
            <div>
              <div className="text-xs text-ink-500 mb-2">Color</div>
              <div className="flex flex-wrap gap-2">
                {subjectColors.map((c) => (
                  <button key={c.name} onClick={() => { update('subjects', { id: edit.id, color: c.name }); setEdit({ ...edit, color: c.name }) }}
                    className={cx('w-8 h-8 rounded-xl', c.bg, edit.color === c.name && 'ring-2 ring-offset-2 ring-brand-400')} />
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Stat({ label, value, onClick }) {
  return (
    <button onClick={onClick} className="p-2 rounded-xl hover:bg-ink-50 dark:hover:bg-ink-800 transition">
      <div className="text-base font-display font-semibold">{value}</div>
      <div className="text-[10px] text-ink-500 uppercase tracking-wider">{label}</div>
    </button>
  )
}
