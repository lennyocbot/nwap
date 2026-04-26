import { useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import Modal from '../components/Modal.jsx'
import { cx, colorFor, fmtTime } from '../lib/utils.js'
import { SCHOOL_TIMETABLE_ROWS, TIMETABLE_KIND_OPTIONS, mergedTimetableRows } from '../lib/timetable.js'

const days = [
  { n: 1, label: 'Mon' }, { n: 2, label: 'Tue' }, { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' }, { n: 5, label: 'Fri' }, { n: 6, label: 'Sat' }, { n: 7, label: 'Sun' },
]

export default function Timetable() {
  const { state, add, update, remove, setSettings } = useApp()
  const [edit, setEdit] = useState(null)
  const [rowEdit, setRowEdit] = useState(null)
  const todayN = (() => { const d = new Date().getDay(); return d === 0 ? 7 : d })()
  const baseRows = mergedTimetableRows(state.settings.timetableRows || [])
  const rows = mergedTimetableRows([
    ...(state.settings.timetableRows || []),
    ...(state.timetable || []).map((slot) => ({
      id: `slot-row-${slot.start}-${slot.end}`,
      custom: true,
      label: slot.title?.trim() || 'Custom slot',
      start: slot.start,
      end: slot.end,
      kind: slot.kind || 'study',
    })).filter((row) => !baseRows.some((base) => base.start === row.start && base.end === row.end)),
  ])

  const addSlot = (day, row = SCHOOL_TIMETABLE_ROWS[1]) => {
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

  const saveRow = (row) => {
    const custom = state.settings.timetableRows || []
    const nextRow = {
      ...row,
      id: row.id || `row-${Date.now()}`,
      custom: true,
      label: row.label?.trim() || 'Custom slot',
      start: row.start || '06:30',
      end: row.end || '07:00',
      kind: row.kind || 'before',
    }
    const nextRows = custom.some((item) => item.id === nextRow.id)
      ? custom.map((item) => item.id === nextRow.id ? nextRow : item)
      : [...custom, nextRow]
    setSettings({ timetableRows: nextRows })
    setRowEdit(null)
  }

  const removeRow = (row) => {
    setSettings({ timetableRows: (state.settings.timetableRows || []).filter((item) => item.id !== row.id) })
    setRowEdit(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <div className="font-display text-lg font-bold">School week</div>
          <div className="text-sm text-ink-500">Editable time rows from early morning through evening, with your school periods, breaks, lunch, clubs, and study blocks.</div>
        </div>
        <div className="flex-1" />
        <button className="btn-soft" onClick={() => setRowEdit({ label: 'Early study', start: '06:30', end: '07:00', kind: 'before' })} type="button">
          <Icon.plus className="w-4 h-4" /> Add time row
        </button>
        <button className="btn-soft" onClick={() => fillDefaultDay(todayN)} type="button">
          <Icon.timetable className="w-4 h-4" /> Fill today
        </button>
        <button className="btn-primary" onClick={() => addSlot(todayN, rows[0] || SCHOOL_TIMETABLE_ROWS[0])} type="button">
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

      <MobileTimetable
        rows={rows}
        days={days}
        todayN={todayN}
        slotFor={slotFor}
        addSlot={addSlot}
        setEdit={setEdit}
        state={state}
      />

      <div className="liquid-glass-strong hidden rounded-[30px] p-3 overflow-x-auto md:block">
        <div className="min-w-[900px] xl:min-w-0">
          <div className="grid gap-2" style={{ gridTemplateColumns: '128px repeat(7, minmax(104px, 1fr))' }}>
            <div className="rounded-2xl px-3 py-2 text-xs font-semibold text-ink-500">Time</div>
            {days.map((day) => (
              <div key={day.n} className={cx('rounded-2xl px-3 py-2 text-center text-sm font-bold', day.n === todayN ? 'bg-brand-600 text-white shadow-pop' : 'bg-white/42 text-ink-600 ring-1 ring-white/60')}>
                {day.label}
              </div>
            ))}

            {rows.map((row) => (
              <TimetableRow
                key={row.id}
                row={row}
                todayN={todayN}
                slotFor={slotFor}
                addSlot={addSlot}
                setEdit={setEdit}
                state={state}
                onEditRow={row.custom ? setRowEdit : null}
              />
            ))}
          </div>
        </div>
      </div>

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
                  {TIMETABLE_KIND_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
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

      <Modal open={!!rowEdit} onClose={() => setRowEdit(null)} title="Time row"
        footer={rowEdit && (
          <>
            {rowEdit.custom && (
              <button className="btn-ghost text-rose-600" onClick={() => removeRow(rowEdit)} type="button">
                <Icon.trash className="w-4 h-4" /> Delete row
              </button>
            )}
            <button className="btn-primary" onClick={() => saveRow(rowEdit)} type="button">Save row</button>
          </>
        )}>
        {rowEdit && (
          <div className="space-y-3">
            <div>
              <div className="text-xs text-ink-500 mb-1">Row label</div>
              <input className="input" value={rowEdit.label || ''} onChange={(e) => setRowEdit({ ...rowEdit, label: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <div className="text-xs text-ink-500 mb-1">Start</div>
                <input className="input" type="time" value={rowEdit.start || ''} onChange={(e) => setRowEdit({ ...rowEdit, start: e.target.value })} />
              </div>
              <div>
                <div className="text-xs text-ink-500 mb-1">End</div>
                <input className="input" type="time" value={rowEdit.end || ''} onChange={(e) => setRowEdit({ ...rowEdit, end: e.target.value })} />
              </div>
              <div>
                <div className="text-xs text-ink-500 mb-1">Default type</div>
                <select className="input" value={rowEdit.kind || 'before'} onChange={(e) => setRowEdit({ ...rowEdit, kind: e.target.value })}>
                  {TIMETABLE_KIND_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )

  function fillDefaultDay(day) {
    rows.forEach((row) => {
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

function TimetableRow({ row, todayN, slotFor, addSlot, setEdit, state, onEditRow }) {
  return (
    <>
      <div className={cx('rounded-2xl px-3 py-3 ring-1 ring-white/60', row.kind === 'break' || row.kind === 'lunch' ? 'bg-amber-50/70' : 'bg-white/44')}>
        <div className="font-semibold text-sm">{row.label}</div>
        <div className="text-[11px] text-ink-500">{fmtTime(row.start)}-{fmtTime(row.end)}</div>
        {onEditRow && <button className="mt-1 text-[10px] font-semibold text-brand-600" onClick={() => onEditRow(row)} type="button">Edit row</button>}
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

function MobileTimetable({ rows, days, todayN, slotFor, addSlot, setEdit, state }) {
  return (
    <div className="space-y-3 md:hidden">
      {days.map((day) => (
        <section key={day.n} className={cx('liquid-glass rounded-[26px] p-3 animate-rise-in', day.n === todayN && 'ring-2 ring-brand-300')}>
          <div className="mb-3 flex items-center justify-between">
            <div className="font-display text-lg font-bold">{day.label}</div>
            <button className="btn-soft !px-3 !py-1.5 text-xs" onClick={() => addSlot(day.n, rows[3])} type="button">
              <Icon.plus className="w-3 h-3" /> Add
            </button>
          </div>
          <div className="space-y-2">
            {rows.map((row) => {
              const slot = slotFor(day.n, row)
              return (
                <button
                  key={row.id}
                  className="grid w-full grid-cols-[86px_1fr] gap-2 rounded-2xl bg-white/32 p-2 text-left ring-1 ring-white/60"
                  onClick={() => slot ? setEdit(slot) : addSlot(day.n, row)}
                  type="button"
                >
                  <div>
                    <div className="text-xs font-semibold">{row.label}</div>
                    <div className="text-[10px] text-ink-500">{fmtTime(row.start)}-{fmtTime(row.end)}</div>
                  </div>
                  {slot ? <SlotCard slot={slot} state={state} /> : <EmptySlot row={row} />}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
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
    before: 'bg-sky-500',
    after: 'bg-ink-500',
  }[kind] || 'bg-brand-500'
}
