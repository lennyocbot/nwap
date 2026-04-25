import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import { cx, todayISO } from '../lib/utils.js'

export default function Study() {
  const { state, add, showToast, openAI } = useApp()
  const { focus, short, long, longEvery } = state.settings.pomodoro

  const [mode, setMode] = useState('focus') // focus | short | long
  const [subjectId, setSubjectId] = useState(state.subjects[0]?.id || '')
  const [assignmentId, setAssignmentId] = useState('')
  const [running, setRunning] = useState(false)
  const [remaining, setRemaining] = useState(focus * 60)
  const [cycle, setCycle] = useState(0)
  const [distraction, setDistraction] = useState(0)
  const intervalRef = useRef(null)

  const total = (mode === 'focus' ? focus : mode === 'short' ? short : long) * 60
  useEffect(() => { setRemaining(total) }, [mode, focus, short, long])

  useEffect(() => {
    if (!running) { clearInterval(intervalRef.current); return }
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(intervalRef.current)
          finishInterval()
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [running])

  const finishInterval = () => {
    if (mode === 'focus') {
      const assignment = state.assignments.find((item) => item.id === assignmentId)
      add('studySessions', {
        date: todayISO(),
        minutes: focus,
        subjectId: subjectId || assignment?.subjectId || null,
        assignmentId: assignmentId || null,
        at: Date.now(),
      })
      const nextCycle = cycle + 1
      setCycle(nextCycle)
      const nextMode = nextCycle % longEvery === 0 ? 'long' : 'short'
      setMode(nextMode)
      showToast(`Focus complete - break ${nextMode === 'long' ? long : short}m`, 'success')
    } else {
      setMode('focus')
      showToast('Break over - ready to focus?', 'info')
    }
    setRunning(false)
    try { navigator.vibrate?.(200) } catch {}
  }

  const reset = () => { setRunning(false); setRemaining(total) }
  const mm = Math.floor(remaining / 60).toString().padStart(2, '0')
  const ss = (remaining % 60).toString().padStart(2, '0')
  const pct = 1 - remaining / total
  const openAssignments = state.assignments
    .filter((assignment) => assignment.status !== 'done')
    .slice()
    .sort((a, b) => new Date(a.due) - new Date(b.due))

  const stats = useMemo(() => {
    const today = todayISO()
    const minutesToday = state.studySessions.filter((s) => s.date === today).reduce((a, b) => a + b.minutes, 0)
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i))
      const key = d.toISOString().slice(0, 10)
      return { key, label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        m: state.studySessions.filter((s) => s.date === key).reduce((a, b) => a + b.minutes, 0) }
    })
    const max = Math.max(1, ...last7.map((x) => x.m))
    return { minutesToday, last7, max }
  }, [state.studySessions])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
      <div className="card p-6 md:p-8 flex flex-col items-center">
        <div className="flex gap-2 mb-6">
          <Tab label={`Focus (${focus}m)`} active={mode === 'focus'} onClick={() => { setMode('focus'); setRunning(false) }} />
          <Tab label={`Short Break (${short}m)`} active={mode === 'short'} onClick={() => { setMode('short'); setRunning(false) }} />
          <Tab label={`Long Break (${long}m)`} active={mode === 'long'} onClick={() => { setMode('long'); setRunning(false) }} />
        </div>

        <div className="relative w-64 h-64 md:w-80 md:h-80">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="6" fill="none" className="text-ink-200 dark:text-ink-800" />
            <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round"
              className={mode === 'focus' ? 'text-brand-500' : 'text-emerald-500'}
              strokeDasharray={2 * Math.PI * 45}
              strokeDashoffset={(1 - pct) * 2 * Math.PI * 45}
              style={{ transition: 'stroke-dashoffset 0.5s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-6xl md:text-7xl font-display font-semibold tracking-tight tabular-nums">{mm}:{ss}</div>
            <div className="text-xs text-ink-500 uppercase tracking-wider mt-2">{mode} - cycle {cycle + 1}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-6">
          <button className="btn-ghost" onClick={reset}><Icon.reset className="w-5 h-5" /></button>
          <button className="btn-primary !px-6 !py-3 !text-base" onClick={() => setRunning((v) => !v)}>
            {running ? <Icon.pause className="w-5 h-5" /> : <Icon.play className="w-5 h-5" />}
            {running ? 'Pause' : 'Start'}
          </button>
          <button className="btn-soft" onClick={() => setDistraction((d) => d + 1)} title="Log distraction">
            <Icon.flag className="w-5 h-5" />
            Log distraction
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <select className="input max-w-[220px]" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">No subject</option>
            {state.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="input max-w-[280px]" value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)}>
            <option value="">No assignment link</option>
            {openAssignments.map((assignment) => (
              <option key={assignment.id} value={assignment.id}>{assignment.title}</option>
            ))}
          </select>
          <span className="chip">Distractions: {distraction}</span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="card p-5">
          <div className="flex items-center">
            <div className="font-display font-semibold">Today</div>
            <div className="flex-1" />
            <div className="text-2xl font-display font-semibold">{stats.minutesToday}m</div>
          </div>
          <div className="mt-3 text-xs text-ink-500">Across {state.studySessions.filter((s) => s.date === todayISO()).length} sessions</div>
        </div>
        <div className="card p-5">
          <div className="font-display font-semibold mb-3">Last 7 days</div>
          <div className="flex items-end gap-2 h-28">
            {stats.last7.map((d) => (
              <div key={d.key} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-brand-500/20 dark:bg-brand-500/30 rounded-t-lg relative overflow-hidden" style={{ height: `${(d.m / stats.max) * 100}%` }}>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-600 to-brand-400" style={{ height: '100%' }} />
                </div>
                <div className="text-[10px] text-ink-500">{d.label}</div>
                <div className="text-[10px] font-semibold">{d.m}m</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-5">
          <div className="font-display font-semibold mb-2">Tips</div>
          <ul className="text-sm text-ink-600 dark:text-ink-300 space-y-1 list-disc pl-5">
            <li>Put phone in another room - raise the cost of distraction.</li>
            <li>Start with the smallest possible step.</li>
            <li>Ask AI to break an assignment into 25-minute chunks.</li>
          </ul>
          <button
            className="btn-soft mt-3 w-full"
            onClick={() => openAI(null, 'Plan my next 25-minute study session using my current assignments, timetable, and weak topics. Give me one focused task, a mini checklist, and a break plan.')}
          >
            <Icon.sparkle className="w-4 h-4" /> Get AI to plan my next session
          </button>
        </div>
      </div>
    </div>
  )
}

function Tab({ label, active, onClick }) {
  return <button onClick={onClick} className={cx('px-4 py-2 rounded-full text-sm font-medium transition',
    active ? 'bg-brand-600 text-white' : 'bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300')}>{label}</button>
}
