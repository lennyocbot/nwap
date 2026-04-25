import { useMemo } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import { cx, colorFor, daysUntil, fmtTime, relative, todayISO } from '../lib/utils.js'

export default function Dashboard() {
  const { state, navigate, openAI, update, add } = useApp()

  const todayIdx = useMemo(() => {
    const d = new Date().getDay()
    return d === 0 ? 7 : d
  }, [])

  const todaySlots = state.timetable
    .filter((t) => t.day === todayIdx)
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start))

  const upcoming = state.assignments
    .filter((a) => a.status !== 'done')
    .slice()
    .sort((a, b) => new Date(a.due) - new Date(b.due))
    .slice(0, 5)

  const dueCards = state.flashcards.filter((f) => f.due <= Date.now()).length
  const nextWork = upcoming[0]
  const nextWorkLate = nextWork ? daysUntil(nextWork.due) < 0 : false

  const stats = useMemo(() => {
    const today = todayISO()
    const studyToday = state.studySessions.filter((s) => s.date === today).reduce((a, b) => a + b.minutes, 0)
    const streaks = state.habits.reduce((m, h) => m + (h.streak || 0), 0)
    const open = state.assignments.filter((a) => a.status !== 'done').length
    return { studyToday, streaks, open, decks: state.decks.length, notes: state.notes.length }
  }, [state])

  const weeklyGrade = useMemo(() => {
    if (!state.grades.length) return null
    const avg = state.grades.reduce((a, g) => a + (g.score / g.outOf) * 100, 0) / state.grades.length
    return Math.round(avg)
  }, [state.grades])

  const toggleHabit = (h) => {
    const key = todayISO()
    const was = !!h.log[key]
    const log = { ...h.log, [key]: !was }
    let streak = h.streak || 0
    if (!was) streak += 1
    else streak = Math.max(0, streak - 1)
    update('habits', { id: h.id, log, streak })
  }

  const quickNote = () => {
    const n = add('notes', {
      title: 'Untitled note', content: '', tags: [], subjectId: null, pinned: false,
      createdAt: Date.now(), updatedAt: Date.now(),
    })
    navigate('notes', { id: n.id })
  }

  const planDay = () => {
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    openAI(null, [
      `Plan my study day for ${today}.`,
      'Use my timetable, due assignments, revision queue, weak topics, and recent study time.',
      'Give me a realistic schedule with start times, focus blocks, breaks, and the single most important task.',
    ].join('\n'))
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <section className={cx(
        'card p-5 md:p-7 text-white border-transparent',
        nextWorkLate
          ? 'bg-gradient-to-br from-rose-700 via-rose-600 to-amber-600'
          : 'bg-gradient-to-br from-brand-600 via-brand-500 to-violet-500'
      )}>
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <div className="text-white/80 text-sm">Good {greet()}, {state.user.name || 'Student'}</div>
            <h2 className="font-display text-2xl md:text-3xl font-semibold mt-1">
              {nextWork
                ? <>Next up: <span className="opacity-90">{nextWork.title}</span> - {relative(nextWork.due)}</>
                : 'Nothing due - great time to revise.'}
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn bg-white text-brand-700 hover:bg-white/90" onClick={planDay}>
                <Icon.sparkle className="w-4 h-4" /> Plan my day
              </button>
              <button className="btn bg-white/10 hover:bg-white/20 border border-white/20" onClick={quickNote}>
                <Icon.plus className="w-4 h-4" /> Quick note
              </button>
              <button className="btn bg-white/10 hover:bg-white/20 border border-white/20" onClick={() => navigate('study')}>
                <Icon.timer className="w-4 h-4" /> Start focus
              </button>
            </div>
          </div>
          <div className="hidden md:flex flex-col items-end text-right">
            <div className="text-5xl font-display font-semibold leading-none">{new Date().getDate()}</div>
            <div className="text-white/80 text-sm mt-1">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long' })}</div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Open tasks" value={stats.open} icon="task" tone="rose" onClick={() => navigate('assignments')} />
        <Stat label="Cards due" value={dueCards} icon="cards" tone="brand" onClick={() => navigate('revision')} />
        <Stat label="Study today" value={`${stats.studyToday}m`} icon="timer" tone="amber" onClick={() => navigate('study')} />
        <Stat label="Habit streaks" value={stats.streaks} icon="fire" tone="emerald" onClick={() => navigate('habits')} />
        <Stat label="Avg grade" value={weeklyGrade != null ? `${weeklyGrade}%` : '-'} icon="grade" tone="violet" onClick={() => navigate('grades')} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <Header title="Today" action={{ label: 'Timetable', on: () => navigate('timetable') }} icon="timetable" />
          {todaySlots.length === 0 ? (
            <Empty text="No classes today" hint="Enjoy the breathing room." />
          ) : (
            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
              {todaySlots.map((t) => {
                const s = state.subjects.find((x) => x.id === t.subjectId)
                const c = colorFor(s?.color)
                return (
                  <li key={t.id} className="py-3 flex items-center gap-3">
                    <div className={cx('w-10 h-10 rounded-2xl text-white flex items-center justify-center text-lg', c.bg)}>{s?.emoji || 'S'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{s?.name || 'Subject'}</div>
                      <div className="text-xs text-ink-500">{fmtTime(t.start)}-{fmtTime(t.end)} - {t.room || s?.room || '-'}</div>
                    </div>
                    <button className="btn-ghost" onClick={() => navigate('notes', { subject: s?.id })}><Icon.note className="w-4 h-4" /></button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <Header title="Upcoming" action={{ label: 'All', on: () => navigate('assignments') }} icon="task" />
          {upcoming.length === 0 ? (
            <Empty text="All clear" hint="No open assignments." />
          ) : (
            <ul className="space-y-2">
              {upcoming.map((a) => {
                const s = state.subjects.find((x) => x.id === a.subjectId)
                const d = daysUntil(a.due)
                const late = d < 0
                return (
                  <li key={a.id} className="flex items-center gap-3 p-2 rounded-2xl hover:bg-ink-50 dark:hover:bg-ink-800 cursor-pointer"
                    onClick={() => navigate('assignments', { id: a.id })}>
                    <span className={cx('w-2 h-2 rounded-full', priorityDot(a.priority))} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{a.title}</div>
                      <div className="text-xs text-ink-500 truncate">{s?.name || 'General'}</div>
                    </div>
                    <span className={cx('pill', late ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200' : 'bg-ink-100 dark:bg-ink-800')}>
                      {relative(a.due)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5">
          <Header title="Today's habits" action={{ label: 'Manage', on: () => navigate('habits') }} icon="habit" />
          <ul className="space-y-2">
            {state.habits.map((h) => {
              const done = !!h.log[todayISO()]
              return (
                <li key={h.id} className="flex items-center gap-3">
                  <button
                    onClick={() => toggleHabit(h)}
                    className={cx(
                      'w-8 h-8 rounded-2xl flex items-center justify-center transition',
                      done ? 'bg-emerald-500 text-white' : 'bg-ink-100 dark:bg-ink-800 text-ink-500'
                    )}
                  >
                    {done ? <Icon.check className="w-4 h-4" /> : <span className="text-sm font-semibold">{h.emoji}</span>}
                  </button>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{h.name}</div>
                    <div className="text-xs text-ink-500">Streak: {h.streak || 0}</div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="card p-5 lg:col-span-2">
          <Header title="Pinned notes" action={{ label: 'Notes', on: () => navigate('notes') }} icon="note" />
          {state.notes.filter((n) => n.pinned).length === 0 ? (
            <Empty text="No pinned notes" hint="Pin notes from the Notes view." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {state.notes.filter((n) => n.pinned).slice(0, 4).map((n) => (
                <button key={n.id} onClick={() => navigate('notes', { id: n.id })}
                  className="text-left p-4 rounded-2xl bg-ink-50 dark:bg-ink-800 hover:bg-ink-100 dark:hover:bg-ink-700 transition">
                  <div className="font-medium line-clamp-1">{n.title}</div>
                  <div className="text-xs text-ink-500 line-clamp-3 mt-1 whitespace-pre-line">{n.content.replace(/[#>*_`]/g, '').slice(0, 160)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function greet() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

function priorityDot(p) {
  return { high: 'bg-rose-500', medium: 'bg-amber-500', low: 'bg-emerald-500' }[p] || 'bg-ink-300'
}

function Stat({ label, value, icon, tone, onClick }) {
  const Ic = Icon[icon]
  const tones = {
    rose: 'text-rose-600 dark:text-rose-300 bg-rose-100/60 dark:bg-rose-900/30',
    brand: 'text-brand-600 dark:text-brand-300 bg-brand-100/60 dark:bg-brand-900/30',
    amber: 'text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-900/30',
    emerald: 'text-emerald-700 dark:text-emerald-300 bg-emerald-100/60 dark:bg-emerald-900/30',
    violet: 'text-violet-700 dark:text-violet-300 bg-violet-100/60 dark:bg-violet-900/30',
  }
  return (
    <button className="card p-4 text-left hover:shadow-pop transition" onClick={onClick}>
      <div className={cx('w-9 h-9 rounded-2xl flex items-center justify-center mb-3', tones[tone])}>
        <Ic className="w-5 h-5" />
      </div>
      <div className="text-2xl font-display font-semibold">{value}</div>
      <div className="text-xs text-ink-500 mt-0.5">{label}</div>
    </button>
  )
}

function Header({ title, icon, action }) {
  const Ic = Icon[icon]
  return (
    <div className="flex items-center mb-3">
      <div className="flex items-center gap-2">
        {Ic && <Ic className="w-4 h-4 text-ink-400" />}
        <h3 className="font-display font-semibold">{title}</h3>
      </div>
      <div className="flex-1" />
      {action && <button className="text-sm text-brand-600" onClick={action.on}>{action.label}</button>}
    </div>
  )
}

function Empty({ text, hint }) {
  return (
    <div className="text-center py-8 text-ink-500">
      <div className="font-medium">{text}</div>
      {hint && <div className="text-xs mt-1">{hint}</div>}
    </div>
  )
}
