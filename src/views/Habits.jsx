import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import Modal from '../components/Modal.jsx'
import { cx, todayISO } from '../lib/utils.js'

export default function Habits() {
  const { state, add, update, remove } = useApp()
  const [edit, setEdit] = useState(null)

  const last30 = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (29 - i))
      return d.toISOString().slice(0, 10)
    })
  }, [])

  const toggle = (h, key) => {
    const was = !!h.log[key]
    const log = { ...h.log, [key]: !was }
    const streak = computeStreak(log)
    update('habits', { id: h.id, log, streak })
  }

  const create = () => {
    const h = add('habits', { name: 'New habit', emoji: '*', streak: 0, log: {} })
    setEdit(h)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <div className="text-sm text-ink-500">Daily consistency beats intensity</div>
        <div className="flex-1" />
        <button className="btn-primary" onClick={create}><Icon.plus className="w-4 h-4" /> Add habit</button>
      </div>

      <div className="card p-4 overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="text-[10px] text-ink-400">
              <th className="text-left pl-2 pb-2 w-56">Habit</th>
              {last30.map((d, i) => {
                const date = new Date(`${d}T00:00:00`)
                const showMonth = i === 0 || date.getDate() === 1
                return (
                  <th key={d} className="font-normal">
                    <div className="h-4 text-[9px] text-ink-500">{showMonth ? date.toLocaleDateString(undefined, { month: 'short' }) : ''}</div>
                    <div>{date.getDate()}</div>
                  </th>
                )
              })}
              <th className="pr-2">Streak</th>
            </tr>
          </thead>
          <tbody>
            {state.habits.map((h) => (
              <tr key={h.id}>
                <td className="pl-2 py-1">
                  <button onClick={() => setEdit(h)} className="flex items-center gap-2">
                    <span className="text-lg">{h.emoji}</span>
                    <span className="text-sm font-medium">{h.name}</span>
                  </button>
                </td>
                {last30.map((d) => (
                  <td key={d} className="text-center">
                    <button onClick={() => toggle(h, d)}
                      className={cx('w-6 h-6 rounded-md mx-auto block transition',
                        h.log[d]
                          ? 'bg-emerald-500'
                          : 'border border-ink-200 bg-white hover:bg-ink-100 dark:border-ink-700 dark:bg-ink-900 dark:hover:bg-ink-800')}
                      title={d} />
                  </td>
                ))}
                <td className="text-right pr-2 text-sm font-semibold">{h.streak || 0}</td>
              </tr>
            ))}
            {state.habits.length === 0 && <tr><td colSpan={32} className="text-center text-sm text-ink-500 py-6">No habits yet</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title="Habit"
        footer={
          <>
            <button className="btn-ghost text-rose-600" onClick={() => { remove('habits', edit.id); setEdit(null) }}><Icon.trash className="w-4 h-4" /> Delete</button>
            <button className="btn-primary" onClick={() => setEdit(null)}>Done</button>
          </>
        }>
        {edit && (
          <div className="space-y-3">
            <div className="grid grid-cols-[auto_1fr] gap-2 items-center">
              <input className="input text-2xl w-16 text-center" maxLength={3} value={edit.emoji}
                onChange={(e) => { update('habits', { id: edit.id, emoji: e.target.value }); setEdit({ ...edit, emoji: e.target.value }) }} />
              <input className="input text-lg" value={edit.name}
                onChange={(e) => { update('habits', { id: edit.id, name: e.target.value }); setEdit({ ...edit, name: e.target.value }) }} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function computeStreak(log) {
  let streak = 0
  const d = new Date()
  for (;;) {
    const k = d.toISOString().slice(0, 10)
    if (log[k]) { streak++; d.setDate(d.getDate() - 1) }
    else if (k === todayISO()) { d.setDate(d.getDate() - 1) }
    else break
  }
  return streak
}
