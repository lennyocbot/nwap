import { useMemo, useState, useEffect } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import Modal from '../components/Modal.jsx'
import Markdown from '../components/Markdown.jsx'
import { cx, colorFor, daysUntil, fmtDateTime, relative } from '../lib/utils.js'
import { callAI, buildSystemPrompt } from '../lib/ai.js'
import { normalizeAIText } from '../lib/text.js'

const priorities = ['low', 'medium', 'high']
const columns = [
  { key: 'todo',  label: 'To do' },
  { key: 'doing', label: 'In progress' },
  { key: 'done',  label: 'Done' },
]

export default function Assignments() {
  const { state, add, update, remove, openAI, showToast, route, navigate } = useApp()
  const [open, setOpen] = useState(null)
  const [filter, setFilter] = useState('all')
  const [aiOut, setAiOut] = useState(null)
  const [aiBusy, setAiBusy] = useState(false)

  useEffect(() => {
    if (route.params?.id) {
      const a = state.assignments.find((x) => x.id === route.params.id)
      if (a) setOpen(a)
    }
  }, [route.params?.id])

  const lists = useMemo(() => {
    const all = state.assignments.slice().sort((a, b) => new Date(a.due) - new Date(b.due))
    const filtered = filter === 'all' ? all : all.filter((a) => a.subjectId === filter)
    return columns.map((c) => ({ ...c, items: filtered.filter((a) => a.status === c.key) }))
  }, [state.assignments, filter])

  const create = () => {
    const a = add('assignments', {
      title: 'New assignment', subjectId: state.subjects[0]?.id || null,
      due: new Date(Date.now() + 3 * 86400000).toISOString(),
      priority: 'medium', status: 'todo', estMinutes: 45, notes: '',
    })
    setOpen(a)
  }

  const saveOpen = (patch) => {
    if (!open) return
    update('assignments', { id: open.id, ...patch })
    setOpen({ ...open, ...patch })
  }

  const breakdown = async () => {
    if (!open) return
    setAiBusy(true); setAiOut(null)
    try {
      const s = state.subjects.find((x) => x.id === open.subjectId)
      const txt = await callAI({
        settings: state.settings,
        system: buildSystemPrompt(state, `Breaking an assignment into concrete steps.`),
        messages: [{ role: 'user', content: `Break the assignment "${open.title}" for ${s?.name || 'class'} (due ${new Date(open.due).toLocaleString()}) into 5-8 actionable steps that fit the student's estimate of ${open.estMinutes || 60} minutes. Start with "Your estimate: ${open.estMinutes || 60} min — here's a focused plan that fits." Only warn if the estimate is unrealistic. Markdown checklist with minutes per step.\n\nNotes: ${open.notes || 'none'}` }],
      })
      setAiOut(normalizeAIText(txt))
    } catch (e) { showToast(e.message || 'AI error', 'error') } finally { setAiBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input max-w-[200px]" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All subjects</option>
          {state.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="flex-1" />
        <button className="btn-soft" onClick={() => openAI(null, assignmentPlanPrompt(state.assignments, state.subjects))}><Icon.sparkle className="w-4 h-4" /> Plan with AI</button>
        <button className="btn-primary" onClick={create}><Icon.plus className="w-4 h-4" /> New</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {lists.map((col) => (
          <div key={col.key} className={cx('card p-3', col.items.length === 0 && 'bg-white/58 dark:bg-ink-900/70')}>
            <div className="flex items-center justify-between px-2 py-1">
              <div className="font-display font-semibold">{col.label}</div>
              <span className="chip">{col.items.length}</span>
            </div>
            <div className="space-y-2 mt-2">
              {col.items.length === 0 && (
                <div className="rounded-2xl border border-dashed border-ink-200/80 bg-white/45 px-3 py-5 text-center text-sm text-ink-400 dark:border-ink-700 dark:bg-ink-900/40">
                  {col.key === 'todo' ? 'Add a task to get started.' : col.key === 'doing' ? 'Drag work here when you start.' : 'Completed work lands here.'}
                </div>
              )}
              {col.items.map((a) => {
                const s = state.subjects.find((x) => x.id === a.subjectId)
                const c = colorFor(s?.color)
                const d = daysUntil(a.due)
                const logged = assignmentMinutes(state.studySessions, a.id)
                return (
                  <div key={a.id} className="group bg-white dark:bg-ink-900 p-3 rounded-2xl border border-ink-100 dark:border-ink-800">
                    <div className="flex items-start gap-2">
                      <button
                        onClick={() => update('assignments', { id: a.id, status: a.status === 'done' ? 'todo' : 'done' })}
                        className={cx('mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0',
                          a.status === 'done' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-ink-300')}
                      >{a.status === 'done' && <Icon.check className="w-3 h-3" />}</button>
                      <button className="flex-1 text-left" onClick={() => setOpen(a)}>
                        <div className={cx('font-medium line-clamp-2', a.status === 'done' && 'line-through text-ink-400')} title={a.title}>{a.title}</div>
                        <div className="flex flex-wrap gap-1 mt-1 items-center">
                          {s && <span className={cx('chip', c.soft)}>{s.emoji} {s.name}</span>}
                          <span className={cx('chip', priorityTone(a.priority))}>{a.priority}</span>
                          <span className={cx('chip', d < 0 && a.status !== 'done' && 'bg-rose-100 text-rose-700')}>{relative(a.due)}</span>
                          {logged > 0 && <span className="chip"><Icon.timer className="w-3 h-3" /> {logged}m focused</span>}
                        </div>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!open} onClose={() => { setOpen(null); navigate('assignments') }}
        title="Assignment"
        wide
        footer={(
          <>
            <button className="btn-ghost text-rose-600" onClick={() => { remove('assignments', open.id); setOpen(null) }}>
              <Icon.trash className="w-4 h-4" /> Delete
            </button>
            <button className="btn-primary" onClick={() => setOpen(null)}>Done</button>
          </>
        )}>
        {open && (
          <div className="space-y-3">
            {assignmentMinutes(state.studySessions, open.id) > 0 && (
              <div className="rounded-2xl border border-brand-100 bg-brand-50 p-3 text-sm dark:border-brand-900 dark:bg-brand-900/20">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">Logged focus time</span>
                  <span className="font-display text-xl font-semibold">{assignmentMinutes(state.studySessions, open.id)}m</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white dark:bg-ink-900">
                  <div
                    className="h-full bg-brand-500"
                    style={{ width: `${Math.min(100, (assignmentMinutes(state.studySessions, open.id) / Math.max(1, open.estMinutes || 1)) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            <input className="input text-lg font-semibold" value={open.title} onChange={(e) => saveOpen({ title: e.target.value })} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <div className="text-xs text-ink-500 mb-1">Subject</div>
                <select className="input" value={open.subjectId || ''} onChange={(e) => saveOpen({ subjectId: e.target.value || null })}>
                  <option value="">None</option>
                  {state.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-ink-500 mb-1">Priority</div>
                <select className="input" value={open.priority} onChange={(e) => saveOpen({ priority: e.target.value })}>
                  {priorities.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-ink-500 mb-1">Status</div>
                <select className="input" value={open.status} onChange={(e) => saveOpen({ status: e.target.value })}>
                  {columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-ink-500 mb-1">Est. minutes</div>
                <input type="number" className="input" value={open.estMinutes || 0} onChange={(e) => saveOpen({ estMinutes: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <div className="text-xs text-ink-500 mb-1">Due</div>
              <input type="datetime-local" className="input" value={toLocalInput(open.due)} onChange={(e) => saveOpen({ due: new Date(e.target.value).toISOString() })} />
            </div>
            <div>
              <div className="text-xs text-ink-500 mb-1">Notes</div>
              <textarea className="input min-h-[120px]" value={open.notes || ''} onChange={(e) => saveOpen({ notes: e.target.value })} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-soft" onClick={breakdown} disabled={aiBusy}><Icon.sparkle className="w-4 h-4" /> Break into steps</button>
              <button className="btn-ghost" onClick={() => openAI({ type: 'assignment', id: open.id })}><Icon.chat className="w-4 h-4" /> Ask AI about this</button>
            </div>
            {aiBusy && <div className="text-sm text-ink-500 animate-pulse-soft">Planning...</div>}
            {aiOut && <div className="p-3 rounded-2xl bg-ink-50 dark:bg-ink-800"><Markdown text={aiOut} /></div>}
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

function priorityTone(p) {
  return {
    high: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
    low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  }[p] || ''
}

function assignmentMinutes(studySessions, assignmentId) {
  return (studySessions || [])
    .filter((session) => session.assignmentId === assignmentId)
    .reduce((total, session) => total + (Number(session.minutes) || 0), 0)
}

function assignmentPlanPrompt(assignments, subjects) {
  const rows = assignments
    .filter((assignment) => assignment.status !== 'done')
    .slice()
    .sort((a, b) => new Date(a.due) - new Date(b.due))
    .map((assignment) => {
      const subject = subjects.find((item) => item.id === assignment.subjectId)?.name || 'General'
      return `- ${assignment.title} | ${subject} | due ${new Date(assignment.due).toLocaleString()} | ${assignment.priority} | ${assignment.status} | estimate ${assignment.estMinutes || 60}m | notes: ${assignment.notes || 'none'}`
    })
    .join('\n')
  return [
    'Create a study plan for my current assignments this week.',
    'Use the assignment data below directly. Do not ask me to provide priorities, dates, estimates, or details already listed.',
    'Tell me which assignment to start with today and why, then give a realistic schedule.',
    '',
    rows || 'No open assignments.',
  ].join('\n')
}
