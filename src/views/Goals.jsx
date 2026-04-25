import { useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import Modal from '../components/Modal.jsx'
import { cx, colorFor, relative } from '../lib/utils.js'
import { uid } from '../lib/utils.js'
import { buildSystemPrompt, callAI } from '../lib/ai.js'

export default function Goals() {
  const { state, add, update, remove, showToast } = useApp()
  const [edit, setEdit] = useState(null)
  const [busy, setBusy] = useState(false)

  const create = () => {
    const g = add('goals', {
      title: 'New goal', subjectId: state.subjects[0]?.id || null,
      deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
      milestones: [],
    })
    setEdit(g)
  }

  const suggestGoals = async () => {
    setBusy(true)
    try {
      const data = await callAI({
        settings: state.settings,
        system: buildSystemPrompt(state, 'Suggesting realistic A-level study goals.'),
        json: true,
        messages: [{
          role: 'user',
          content: `Suggest 3 practical study goals from my subjects, grades, assignments, and upcoming deadlines. Return JSON only: {"goals":[{"title":"...","subjectId":"existing subject id or null","deadlineDays":30,"milestones":["...","...","..."]}]}.\n\nSubjects: ${JSON.stringify(state.subjects.map((s) => ({ id: s.id, name: s.name, target: s.target })))}\nGrades: ${JSON.stringify(state.grades.slice(-12))}\nAssignments: ${JSON.stringify(state.assignments.filter((a) => a.status !== 'done').slice(0, 12))}`
        }],
      })
      const suggestions = (data?.goals || []).slice(0, 3)
      if (!suggestions.length) {
        showToast('No goal suggestions returned', 'info')
        return
      }
      suggestions.forEach((g) => {
        add('goals', {
          title: g.title || 'AI suggested goal',
          subjectId: state.subjects.some((s) => s.id === g.subjectId) ? g.subjectId : null,
          deadline: new Date(Date.now() + (Number(g.deadlineDays) || 30) * 86400000).toISOString(),
          milestones: (g.milestones || []).slice(0, 5).map((title) => ({ id: uid(), title, done: false })),
        })
      })
      showToast(`Added ${suggestions.length} AI goal suggestions`, 'success')
    } catch (e) {
      showToast(e.message || 'AI error', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <div className="text-sm text-ink-500">Long-term goals & milestones</div>
        <div className="flex-1" />
        <button className="btn-soft" onClick={suggestGoals} disabled={busy}><Icon.sparkle className="w-4 h-4" /> AI suggestions</button>
        <button className="btn-primary" onClick={create}><Icon.plus className="w-4 h-4" /> Add goal</button>
      </div>
      {busy && <div className="text-sm text-ink-500 animate-pulse-soft">Thinking through goals...</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {state.goals.map((g) => {
          const s = state.subjects.find((x) => x.id === g.subjectId)
          const c = colorFor(s?.color)
          const done = g.milestones.filter((m) => m.done).length
          const total = g.milestones.length
          const pct = total ? (done / total) * 100 : 0
          return (
            <div key={g.id} className="card p-5">
              <div className="flex items-start gap-3">
                <div className={cx('w-10 h-10 rounded-2xl flex items-center justify-center text-white', c.bg)}><Icon.goal className="w-5 h-5" /></div>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-semibold truncate">{g.title}</div>
                  <div className="text-xs text-ink-500">{s?.name || 'General'} - {relative(g.deadline)}</div>
                </div>
                <button className="btn-ghost" onClick={() => setEdit(g)}><Icon.dots className="w-5 h-5" /></button>
              </div>
              <div className="mt-3 h-2 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden">
                <div className={cx('h-full', c.bg)} style={{ width: `${pct}%` }} />
              </div>
              <div className="text-xs text-ink-500 mt-1">{done} / {total} milestones</div>
              <ul className="mt-3 space-y-1.5">
                {g.milestones.slice(0, 5).map((m) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <button onClick={() => update('goals', { id: g.id, milestones: g.milestones.map((x) => x.id === m.id ? { ...x, done: !x.done } : x) })}
                      className={cx('w-5 h-5 rounded-md border flex items-center justify-center shrink-0',
                        m.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-ink-300')}>
                      {m.done && <Icon.check className="w-3 h-3" />}
                    </button>
                    <span className={cx('text-sm', m.done && 'line-through text-ink-400')}>{m.title}</span>
                  </li>
                ))}
                {g.milestones.length === 0 && <li className="text-xs text-ink-500">No milestones yet</li>}
              </ul>
            </div>
          )
        })}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title="Goal"
        footer={
          <>
            <button className="btn-ghost text-rose-600" onClick={() => { remove('goals', edit.id); setEdit(null) }}><Icon.trash className="w-4 h-4" /> Delete</button>
            <button className="btn-primary" onClick={() => setEdit(null)}>Done</button>
          </>
        }>
        {edit && <GoalEditor goal={edit} onChange={(patch) => { update('goals', { id: edit.id, ...patch }); setEdit({ ...edit, ...patch }) }} subjects={state.subjects} />}
      </Modal>
    </div>
  )
}

function GoalEditor({ goal, onChange, subjects }) {
  const [newM, setNewM] = useState('')
  return (
    <div className="space-y-3">
      <input className="input text-lg" value={goal.title} onChange={(e) => onChange({ title: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <select className="input" value={goal.subjectId || ''} onChange={(e) => onChange({ subjectId: e.target.value || null })}>
          <option value="">No subject</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input type="date" className="input" value={goal.deadline?.slice(0, 10)}
          onChange={(e) => onChange({ deadline: new Date(e.target.value).toISOString() })} />
      </div>
      <div>
        <div className="text-xs text-ink-500 mb-1">Milestones</div>
        <ul className="space-y-2 mb-2">
          {goal.milestones.map((m) => (
            <li key={m.id} className="flex items-center gap-2">
              <input type="checkbox" checked={m.done} onChange={(e) => onChange({ milestones: goal.milestones.map((x) => x.id === m.id ? { ...x, done: e.target.checked } : x) })} />
              <input className="input flex-1" value={m.title}
                onChange={(e) => onChange({ milestones: goal.milestones.map((x) => x.id === m.id ? { ...x, title: e.target.value } : x) })} />
              <button className="btn-ghost text-rose-600" onClick={() => onChange({ milestones: goal.milestones.filter((x) => x.id !== m.id) })}>
                <Icon.x className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input className="input" placeholder="Add milestone" value={newM} onChange={(e) => setNewM(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newM.trim()) { onChange({ milestones: [...goal.milestones, { id: uid(), title: newM.trim(), done: false }] }); setNewM('') } }} />
          <button className="btn-soft" onClick={() => { if (newM.trim()) { onChange({ milestones: [...goal.milestones, { id: uid(), title: newM.trim(), done: false }] }); setNewM('') } }}>
            <Icon.plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
