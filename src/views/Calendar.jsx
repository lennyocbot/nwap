import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import Modal from '../components/Modal.jsx'
import { cx, colorFor, daysUntil, fmtTime } from '../lib/utils.js'

export default function Calendar() {
  const { state, add, update, remove, navigate } = useApp()
  const [cursor, setCursor] = useState(() => {
    const d = new Date(); d.setDate(1); return d
  })
  const [edit, setEdit] = useState(null)

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const cells = useMemo(() => buildMonth(cursor, state.settings.weekStart), [cursor, state.settings.weekStart])

  const eventsByDay = useMemo(() => {
    const map = {}
    // one-off events
    state.events.forEach((e) => {
      const k = new Date(e.date).toDateString()
      ;(map[k] = map[k] || []).push({ ...e, kind: 'event' })
    })
    // assignments
    state.assignments.filter((a) => a.status !== 'done').forEach((a) => {
      const k = new Date(a.due).toDateString()
      ;(map[k] = map[k] || []).push({ ...a, kind: 'assignment' })
    })
    // recurring timetable
    cells.forEach((c) => {
      if (!c.inMonth) return
      const dow = (c.date.getDay() === 0 ? 7 : c.date.getDay())
      state.timetable.filter((t) => t.day === dow).forEach((t) => {
        const k = c.date.toDateString()
        ;(map[k] = map[k] || []).push({ ...t, kind: 'class' })
      })
    })
    return map
  }, [state.events, state.assignments, state.timetable, cells])

  const month = cursor.getMonth()
  const year = cursor.getFullYear()
  const shift = (n) => { const d = new Date(cursor); d.setMonth(d.getMonth() + n); setCursor(d) }

  const createEvent = (date) => {
    const d = new Date(date); d.setHours(9, 0, 0, 0)
    const e = add('events', { title: 'New event', date: d.toISOString(), color: 'brand', notes: '' })
    setEdit(e)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button className="btn-ghost" onClick={() => shift(-1)}><Icon.chevron className="w-4 h-4 rotate-180" /></button>
        <div className="font-display font-semibold text-lg w-48 text-center">{monthLabel}</div>
        <button className="btn-ghost" onClick={() => shift(1)}><Icon.chevron className="w-4 h-4" /></button>
        <button className="btn-soft" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button>
        <div className="flex-1" />
        <button className="btn-primary" onClick={() => createEvent(new Date())}><Icon.plus className="w-4 h-4" /> Event</button>
      </div>

      <div className="card p-2 md:p-3">
        <div className="grid grid-cols-7 text-xs font-semibold text-ink-400 px-2 py-2">
          {weekHeader(state.settings.weekStart).map((w) => <div key={w} className="text-center">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c, i) => {
            const events = eventsByDay[c.date.toDateString()] || []
            const isToday = c.date.toDateString() === new Date().toDateString()
            return (
              <button key={i} onClick={() => createEvent(c.date)}
                className={cx('min-h-[90px] md:min-h-[110px] rounded-xl p-2 text-left transition',
                  c.inMonth ? 'bg-white dark:bg-ink-900 hover:bg-ink-50 dark:hover:bg-ink-800' : 'bg-ink-50 dark:bg-ink-900/40 text-ink-400',
                  isToday && 'ring-2 ring-brand-400')}>
                <div className="text-xs font-semibold">{c.date.getDate()}</div>
                <div className="mt-1 space-y-0.5">
                  {events.slice(0, 3).map((e, idx) => {
                    const s = state.subjects.find((x) => x.id === e.subjectId)
                    const col = colorFor(s?.color || e.color || 'brand')
                    return (
                      <div key={idx} onClick={(ev) => { ev.stopPropagation(); if (e.kind === 'event') setEdit(e); else if (e.kind === 'assignment') navigate('assignments', { id: e.id }) }}
                        className={cx('text-[10px] rounded px-1.5 py-0.5 truncate text-white', col.bg)}>
                        {e.kind === 'class' ? `${fmtTime(e.start)} ${s?.name || ''}` : e.title}
                      </div>
                    )
                  })}
                  {events.length > 3 && <div className="text-[10px] text-ink-500">+{events.length - 3} more</div>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title="Event"
        footer={
          <>
            <button className="btn-ghost text-rose-600" onClick={() => { remove('events', edit.id); setEdit(null) }}>
              <Icon.trash className="w-4 h-4" /> Delete
            </button>
            <button className="btn-primary" onClick={() => setEdit(null)}>Done</button>
          </>
        }>
        {edit && (
          <div className="space-y-3">
            <input className="input text-lg font-semibold" value={edit.title}
              onChange={(e) => { update('events', { id: edit.id, title: e.target.value }); setEdit({ ...edit, title: e.target.value }) }} />
            <div>
              <div className="text-xs text-ink-500 mb-1">Date / time</div>
              <input type="datetime-local" className="input" value={toLocalInput(edit.date)}
                onChange={(e) => { const v = new Date(e.target.value).toISOString(); update('events', { id: edit.id, date: v }); setEdit({ ...edit, date: v }) }} />
            </div>
            <div>
              <div className="text-xs text-ink-500 mb-1">Notes</div>
              <textarea className="input min-h-[100px]" value={edit.notes || ''}
                onChange={(e) => { update('events', { id: edit.id, notes: e.target.value }); setEdit({ ...edit, notes: e.target.value }) }} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function toLocalInput(iso) {
  try {
    const d = new Date(iso)
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    return z.toISOString().slice(0, 16)
  } catch { return '' }
}

function weekHeader(start = 1) {
  const base = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return [...base.slice(start), ...base.slice(0, start)]
}

function buildMonth(cursor, weekStart = 1) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const startDay = first.getDay() // 0 Sun
  const offset = (startDay - weekStart + 7) % 7
  const start = new Date(first)
  start.setDate(first.getDate() - offset)
  const cells = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i)
    cells.push({ date: d, inMonth: d.getMonth() === cursor.getMonth() })
  }
  return cells
}
