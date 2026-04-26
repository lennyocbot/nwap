import { useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import Modal from '../components/Modal.jsx'
import { cx, colorFor, fmtTime } from '../lib/utils.js'

const days = [
  { n: 1, label: 'Mon' }, { n: 2, label: 'Tue' }, { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' }, { n: 5, label: 'Fri' }, { n: 6, label: 'Sat' }, { n: 7, label: 'Sun' },
]

const schoolRows = [
  { id: 'form', label: 'Form', start: '08:00', end: '08:15', kind: 'form', defaultTitle: 'Form time' },
  { id: 'p1', label: 'Period 1', start: '08:15', end: '09:15', kind: 'lesson' },
  { id: 'p2', label: 'Period 2', start: '09:15', end: '10:15', kind: 'lesson' },
  { id: 'break', label: 'Break', start: '10:15', end: '10:35', kind: 'break', defaultTitle: 'Break' },
  { id: 'p3', label: 'Period 3', start: '10:35', end: '11:35', kind: 'lesson' },
  { id: 'p4', label: 'Period 4', start: '11:35', end: '12:35', kind: 'lesson' },
  { id: 'lunch', label: 'Lunch', start: '12:35', end: '13:30', kind: 'lunch', defaultTitle: 'Lunch' },
  { id: 'p5', label: 'Period 5', start: '13:30', end: '14:30', kind: 'lesson' },
  { id: 'p6', label: 'Period 6', start: '14:30', end: '15:30', kind: 'lesson' },
  { id: 'after1', label: 'After school', start: '15:30', end: '16:30', kind: 'after' },
  { id: 'after2', label: 'After school 2', start: '16:30', end: '17:30', kind: 'after' },
]

const kindOptions = [
  ['lesson', 'Lesson'],
  ['study', 'Study block'],
  ['form', 'Form time'],
  ['break', 'Break'],
  ['lunch', 'Lunch'],
  ['club', 'Club / activity'],
  ['after', 'After school'],
]

export default function Timetable() {
  const { state, add, update, remove } = useApp()
  const [edit, setEdit] = useState(null)
  const todayN = (() => { const d = new Date().getDay(); return d === 0 ? 7 : d })()

  const addSlot = (day, row = schoolRows[1]) => {
    const slot = add('timetable', {
      day,
      start: row.start,
      end: row.end,
      title: row.defaultTitle || '',
      kind: row.kind || 'lesson',
      subjectId: row.kind === 'lesson' ? state.subjects[0]?.id || null : null,
      room: '',
    })
    setEdit(slot)
  }

  const slotFor = (day, row) => {
    return state.timetable.find((item) => item.day === day && item.start === row.start && item.end === row.end)
  }

  const extraSlots = state.timetable.filter((item) => !schoolRows.some((row) => row.start === item.start && row.end === item.end))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <div className="font-display text-lg font-bold">School week</div>
          <div className="text-sm text-ink-500">8:00-3:30 periods, breaks, lunch, and after-school blocks.</div>
        </div>
        <div className="flex-1" />
        <button className="btn-soft" onClick={() => fillDefaultDay(todayN)} type="button">
          <Icon.timetable className="w-4 h-4" /> Fill today
        </button>
        <button className="btn-primary" onClick={() => addSlot(todayN, schoolRows[1])} type="button">
          <Icon.plus className="w-4 h-4" /> New slot
        </button>
      </div>

      {state.timetable.length === 0 && (
        <section className="liquid-glass p-5 rounded-[28px]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex-1">
              <h2 className="font-display text-xl font-bold">Start with your real school day.</h2>
              <p className="mt-1 text-sm text-ink-500">The grid already follows form time, six periods, break, lunch, and after-school space. Add subjects or custom activities into each slot.</p>
            </div>
            <button className="btn-primary" onClick={() => fillDefaultDay(todayN)} type="button">
              <Icon.plus className="w-4 h-4" /> Fill today with slots
            </button>
          </div>
        </section>
      )}

      <div className="liquid-glass-strong rounded-[30px] p-3 overflow-x-auto">
        <div className="min-w-[980px]">
          <div className="grid gap-2" style={{ gridTemplateColumns: '138px repeat(7, minmax(112px, 1fr))' }}>
            <div className="rounded-2xl px-3 py-2 text-xs font-semibold text-ink-500">Time</div>
            {days.map((day) => (
              <div key={day.n} className={cx('rounded-2xl px-3 py-2 text-center text-sm font-bold', day.n === todayN ? 'bg-brand-600 text-white shadow-pop' : 'bg-white/42 text-ink-600 ring-1 ring-white/60')}>
                {day.label}
              </div>
            ))}

            {schoolRows.map((row) => (
              <TimetableRow
                key={row.id}
                row={row}
                todayN={todayN}
                slotFor={slotFor}
                addSlot={addSlot}
                setEdit={setEdit}
                state={state}
              />
            ))}
          </div>
        </div>
      </div>

      {extraSlots.length > 0 && (
        <section className="card p-4">
          <div className="font-display font-semibold mb-3">Custom times</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {extraSlots.map((slot) => (
              <button key={slot.id} className="rounded-2xl bg-white/50 p-3 text-left ring-1 ring-white/70" onClick={() => setEdit(slot)} type="button">
                <div className="font-semibold">{slotTitle(slot, state)}</div>
                <div className="text-xs text-ink-500">{days.find((d) => d.n === slot.day)?.label} {fmtTime(slot.start)}-{fmtTime(slot.end)}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title="Timetable slot"
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
            <div>
              <div className="text-xs text-ink-500 mb-1">Custom name</div>
              <input className="input" placeholder="e.g. Form time, Maths, Football, Study block" value={edit.title || ''}
                onChange={(e) => { update('timetable', { id: edit.id, title: e.target.value }); setEdit({ ...edit, title: e.target.value }) }} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-ink-500 mb-1">Day</div>
                <select className="input" value={edit.day} onChange={(e) => { const v = Number(e.target.value); update('timetable', { id: edit.id, day: v }); setEdit({ ...edit, day: v }) }}>
                  {days.map((d) => <option key={d.n} value={d.n}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-ink-500 mb-1">Type</div>
                <select className="input" value={edit.kind || 'lesson'} onChange={(e) => { update('timetable', { id: edit.id, kind: e.target.value }); setEdit({ ...edit, kind: e.target.value }) }}>
                  {kindOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-ink-500 mb-1">Subject optional</div>
                <select className="input" value={edit.subjectId || ''}
                  onChange={(e) => { const v = e.target.value || null; update('timetable', { id: edit.id, subjectId: v }); setEdit({ ...edit, subjectId: v }) }}>
                  <option value="">No subject</option>
                  {state.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-ink-500 mb-1">Room / place</div>
                <input className="input" value={edit.room || ''}
                  onChange={(e) => { update('timetable', { id: edit.id, room: e.target.value }); setEdit({ ...edit, room: e.target.value }) }} />
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
            </div>
          </div>
        )}
      </Modal>
    </div>
  )

  function fillDefaultDay(day) {
    schoolRows.forEach((row) => {
      if (slotFor(day, row)) return
      if (!row.defaultTitle) return
      add('timetable', {
        day,
        start: row.start,
        end: row.end,
        title: row.defaultTitle,
        kind: row.kind,
        subjectId: null,
        room: '',
      })
    })
  }
}

function TimetableRow({ row, todayN, slotFor, addSlot, setEdit, state }) {
  return (
    <>
      <div className={cx('rounded-2xl px-3 py-3 ring-1 ring-white/60', row.kind === 'break' || row.kind === 'lunch' ? 'bg-amber-50/70' : 'bg-white/44')}>
        <div className="font-semibold text-sm">{row.label}</div>
        <div className="text-[11px] text-ink-500">{fmtTime(row.start)}-{fmtTime(row.end)}</div>
      </div>
      {days.map((day) => {
        const slot = slotFor(day.n, row)
        return (
          <button
            key={`${row.id}-${day.n}`}
            onClick={() => slot ? setEdit(slot) : addSlot(day.n, row)}
            className={cx(
              'min-h-[74px] rounded-2xl p-2 text-left transition ring-1',
              day.n === todayN ? 'ring-brand-200 bg-brand-50/62' : 'ring-white/60 bg-white/34 hover:bg-white/58',
              !slot && (row.kind === 'break' || row.kind === 'lunch' || row.kind === 'form') && 'bg-white/22'
            )}
            type="button"
          >
            {slot ? <SlotCard slot={slot} state={state} /> : <EmptySlot row={row} />}
          </button>
        )
      })}
    </>
  )
}

function SlotCard({ slot, state }) {
  const subject = state.subjects.find((item) => item.id === slot.subjectId)
  const color = colorFor(subject?.color)
  const title = slotTitle(slot, state)
  return (
    <div className={cx('h-full rounded-xl p-2 text-white shadow-sm', subject ? color.bg : kindTone(slot.kind))}>
      <div className="font-semibold leading-tight line-clamp-2">{subject?.emoji ? `${subject.emoji} ` : ''}{title}</div>
      <div className="mt-1 text-[11px] opacity-85">{fmtTime(slot.start)}-{fmtTime(slot.end)}</div>
      {slot.room && <div className="text-[11px] opacity-85 truncate">{slot.room}</div>}
    </div>
  )
}

function EmptySlot({ row }) {
  if (row.defaultTitle) {
    return (
      <div className="flex h-full min-h-[58px] items-center justify-center rounded-xl border border-dashed border-white/70 text-xs font-semibold text-ink-400">
        {row.defaultTitle}
      </div>
    )
  }
  return (
    <div className="flex h-full min-h-[58px] items-center justify-center rounded-xl border border-dashed border-brand-100/80 text-xs font-semibold text-brand-500">
      + add
    </div>
  )
}

function slotTitle(slot, state) {
  const subject = state.subjects.find((item) => item.id === slot.subjectId)
  return slot.title?.trim() || subject?.name || 'Activity'
}

function kindTone(kind) {
  return {
    form: 'bg-sky-500',
    break: 'bg-amber-500',
    lunch: 'bg-emerald-500',
    study: 'bg-violet-500',
    club: 'bg-pink-500',
    after: 'bg-ink-500',
  }[kind] || 'bg-brand-500'
}
