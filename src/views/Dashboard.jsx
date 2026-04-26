import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import { cx, colorFor, daysUntil, fmtTime, relative, todayISO } from '../lib/utils.js'
import { briefForToday, buildLocalCoachBrief, upsertBrief } from '../lib/coach.js'
import { buildSystemPrompt, callAI } from '../lib/ai.js'

export default function Dashboard() {
  const { state, navigate, openAI, update, add, set, setSettings, showToast } = useApp()
  const [coachBusy, setCoachBusy] = useState(false)

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
  const coachBrief = useMemo(() => briefForToday(state), [state.coachBriefs])
  const nextWorkLate = nextWork ? daysUntil(nextWork.due) < 0 : false
  const readingQueue = state.reading
    .filter((item) => item.status !== 'done')
    .slice()
    .sort((a, b) => statusWeight(a.status) - statusWeight(b.status))
    .slice(0, 4)

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

  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      const key = d.toISOString().slice(0, 10)
      const study = state.studySessions.filter((s) => s.date === key).reduce((total, session) => total + session.minutes, 0)
      const habits = state.habits.reduce((total, habit) => total + (habit.log?.[key] ? 1 : 0), 0)
      return { key, label: d.toLocaleDateString(undefined, { weekday: 'short' }), study, habits }
    })
    const maxStudy = Math.max(1, ...days.map((day) => day.study))
    const habitsDone = days.reduce((total, day) => total + day.habits, 0)
    const totalHabits = Math.max(1, state.habits.length * 7)
    const open = state.assignments.filter((assignment) => assignment.status !== 'done').length
    const done = state.assignments.filter((assignment) => assignment.status === 'done').length
    const totalAssignments = Math.max(1, open + done)
    const dueCards = state.flashcards.filter((card) => card.due <= Date.now()).length
    const reviewedCards = state.flashcards.reduce((total, card) => total + (card.reviews || 0), 0)
    return {
      days,
      maxStudy,
      studyTotal: days.reduce((total, day) => total + day.study, 0),
      habitPct: Math.round((habitsDone / totalHabits) * 100),
      assignmentPct: Math.round((done / totalAssignments) * 100),
      dueCards,
      reviewedCards,
    }
  }, [state.studySessions, state.habits, state.assignments, state.flashcards])

  useEffect(() => {
    if (!state.settings.onboardingComplete || coachBrief) return
    const brief = buildLocalCoachBrief(state)
    set('coachBriefs', upsertBrief(state.coachBriefs || [], brief))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.settings.onboardingComplete, coachBrief?.date])

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
    const hour = new Date().getHours()
    const start = hour >= 7 && hour <= 20 ? 'now' : '10:00'
    openAI(null, [
      `Plan my study day for ${today}.`,
      'Use my timetable, due assignments, revision queue, weak topics, and recent study time.',
      `Start from ${start}. If any exact preference is missing, make a sensible student-friendly assumption instead of asking a clarification question.`,
      'Give me a realistic schedule with start times, focus blocks, breaks, and the single most important task.',
    ].join('\n'))
  }

  const refreshCoach = async () => {
    const lastRefresh = coachBrief?.refreshedAt || coachBrief?.createdAt || 0
    if (Date.now() - lastRefresh < 5 * 60 * 1000) {
      showToast('Coach refresh is on a short cooldown', 'info')
      return
    }
    setCoachBusy(true)
    try {
      let next = null
      const canAskAI = state.settings.aiProvider === 'mock' || !['localhost', '127.0.0.1'].includes(window.location.hostname)
      if (canAskAI) {
        const data = await callAI({
          settings: state.settings,
          system: buildSystemPrompt(state, 'Creating a concise daily study coach brief.'),
          json: true,
          messages: [{
            role: 'user',
            content: `Create today's Syllabi Study Coach brief. Return JSON only: {"title":"...","summary":"...","priorities":["..."],"risks":["..."],"nextAction":"..."}. Use the student's assignments, timetable, grades, habits, goals, and due flashcards. Do not create or change app data.`
          }],
        })
        if (data?.summary) {
          next = {
            id: `coach-${todayISO()}`,
            date: todayISO(),
            source: 'ai',
            title: data.title || "Today's study brief",
            summary: data.summary,
            priorities: (data.priorities || []).slice(0, 4),
            risks: (data.risks || []).slice(0, 4),
            nextAction: data.nextAction || 'Start one focused block.',
            dismissed: false,
            createdAt: coachBrief?.createdAt || Date.now(),
            refreshedAt: Date.now(),
          }
        }
      }
      if (!next) next = { ...buildLocalCoachBrief(state), source: 'offline', refreshedAt: Date.now() }
      set('coachBriefs', upsertBrief(state.coachBriefs || [], next))
      showToast('Coach brief refreshed', 'success')
    } catch (error) {
      const fallback = { ...buildLocalCoachBrief(state), source: 'offline', refreshedAt: Date.now() }
      set('coachBriefs', upsertBrief(state.coachBriefs || [], fallback))
      showToast(error.message || 'Used local coach brief instead', 'info')
    } finally {
      setCoachBusy(false)
    }
  }

  const dismissCoach = () => {
    if (!coachBrief) return
    set('coachBriefs', upsertBrief(state.coachBriefs || [], { ...coachBrief, dismissed: true }))
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <section className={cx(
        'liquid-glass-strong liquid-sheen p-4 md:p-7 text-white border-transparent rounded-[26px] md:rounded-[30px]',
        nextWorkLate
          ? 'bg-gradient-to-br from-rose-700 via-rose-600 to-amber-600'
          : 'bg-gradient-to-br from-brand-700 via-brand-500 to-brand-300'
      )}>
        <div className="flex items-start gap-3 md:gap-4">
          <div className="flex-1">
            <div className="text-white/80 text-sm">Good {greet()}, {state.user.name || 'Student'}</div>
            <h2 className="font-display text-[1.55rem] leading-tight md:text-3xl font-semibold mt-1">
              {nextWork
                ? <>Next up: <span className="opacity-90">{nextWork.title}</span> - {relative(nextWork.due)}</>
                : 'Nothing due - great time to revise.'}
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
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

      <SetupNudges state={state} navigate={navigate} setSettings={setSettings} />

      <section className="grid grid-cols-2 gap-2 md:grid-cols-5 md:gap-3">
        <Stat label="Open tasks" value={stats.open} icon="task" tone="rose" onClick={() => navigate('assignments')} />
        <Stat label="Cards due" value={dueCards} icon="cards" tone="brand" onClick={() => navigate('revision')} />
        <Stat label="Study today" value={`${stats.studyToday}m`} icon="timer" tone="amber" onClick={() => navigate('study')} sparkline={week?.days?.map((d) => d.study)} />
        <Stat label="Habit streaks" value={stats.streaks} icon="fire" tone="emerald" onClick={() => navigate('habits')} />
        <Stat label="Avg grade" value={weeklyGrade != null ? `${weeklyGrade}%` : '-'} icon="grade" tone="violet" onClick={() => navigate('grades')} />
      </section>

      {coachBrief && !coachBrief.dismissed && (
        <CoachCard
          brief={coachBrief}
          busy={coachBusy}
          onRefresh={refreshCoach}
          onDismiss={dismissCoach}
          onApply={() => openAI(null, [
            "Turn today's Study Coach brief into real app actions.",
            'Create sensible study/revision sessions or calendar events only where useful.',
            `Brief: ${coachBrief.summary}`,
            `Priorities: ${(coachBrief.priorities || []).join('; ')}`,
            `Next action: ${coachBrief.nextAction}`,
          ].join('\n'))}
          onOpenWeak={() => navigate('subjects')}
        />
      )}

      <section className="card p-5">
        <Header title="This week" action={{ label: 'Study', on: () => navigate('study') }} icon="grade" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <MiniMetric label="Study time" value={`${week.studyTotal}m`} />
          <MiniMetric label="Habit completion" value={`${week.habitPct}%`} />
          <MiniMetric label="Assignments done" value={`${week.assignmentPct}%`} />
          <MiniMetric label="Cards reviewed" value={week.reviewedCards || week.dueCards} />
        </div>
        <div className="relative flex items-end gap-2 h-24">
          {week.studyTotal === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-500">
              Start a focus session to see activity.
            </div>
          )}
          {week.days.map((day) => (
            <div key={day.key} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full rounded-t-lg bg-brand-500/10 dark:bg-brand-500/20 relative overflow-hidden" style={{ height: `${Math.max(8, (day.study / week.maxStudy) * 100)}%` }}>
                <div className={cx('absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-600 to-brand-400', day.study === 0 && 'opacity-20')} style={{ height: day.study === 0 ? '100%' : '100%' }} />
              </div>
              <div className="text-[10px] text-ink-500">{day.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-3 lg:gap-4">
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
                      <div className="line-clamp-2 font-medium" title={a.title}>{a.title}</div>
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

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-3 lg:gap-4">
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

        <div className="card p-5">
          <Header title="Reading queue" action={{ label: 'Reading', on: () => navigate('reading') }} icon="book" />
          {readingQueue.length === 0 ? (
            <Empty text="No reading queued" hint="Ask AI for recommendations." />
          ) : (
            <ul className="space-y-2">
              {readingQueue.map((item) => {
                const subject = state.subjects.find((s) => s.id === item.subjectId)
                return (
                  <li key={item.id} className="rounded-2xl bg-ink-50 p-3 dark:bg-ink-800">
                    <div className="flex items-start gap-2">
                      <Icon.book className="w-4 h-4 text-ink-400 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium line-clamp-1">{item.title}</div>
                        <div className="text-xs text-ink-500">{subject?.name || 'General'} - {item.estMinutes || 30}m</div>
                      </div>
                      <span className="chip capitalize">{item.status}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="card p-5">
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

function SetupNudges({ state, navigate, setSettings }) {
  const items = []
  const dismissed = state.settings.dismissedNudges || []
  const dismiss = (id) => setSettings({ dismissedNudges: [...new Set([...dismissed, id])] })
  const addNudge = (item) => { if (!dismissed.includes(item.id)) items.push({ ...item, dismiss: () => dismiss(item.id) }) }
  if (!state.user.avatarLocalData && !state.user.avatarStoragePath) addNudge({ id: 'avatar', icon: 'subject', title: 'Add profile picture', text: 'Make the workspace feel like yours.', action: () => navigate('account') })
  if ((state.subjects || []).length === 0) addNudge({ id: 'subjects', icon: 'subject', title: 'Add your first subject', text: 'Create your A-level subjects and colours.', action: () => navigate('subjects') })
  if ((state.subjects || []).some((subject) => !subject.target)) addNudge({ id: 'targets', icon: 'grade', title: 'Set grade targets', text: 'Targets power better coach recommendations.', action: () => navigate('subjects') })
  if (state.settings.timetableOrientation !== 'days-left') addNudge({ id: 'layout', icon: 'timetable', title: 'Try days-down timetable', text: 'Use the iPad-friendly timetable layout.', action: () => navigate('timetable') })
  if (!state.settings.reminders?.enabled) addNudge({ id: 'reminders', icon: 'flag', title: 'Enable reminders', text: 'Get nudges for due work and flashcards.', action: () => navigate('settings') })
  if (!items.length) return null
  return (
    <section className="card p-3 md:p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon.check className="w-4 h-4 text-brand-600" />
        <h3 className="font-display font-semibold">Complete your profile</h3>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.slice(0, 6).map((item) => {
          const Ic = Icon[item.icon]
          return (
            <div key={item.id} className="rounded-2xl bg-white/70 p-3 ring-1 ring-ink-100 dark:bg-ink-900/70 dark:ring-ink-800">
              <div className="flex items-start gap-2">
                <Ic className="w-4 h-4 text-brand-600 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm">{item.title}</div>
                  <div className="text-xs text-ink-500 mt-1">{item.text}</div>
                  <div className="mt-2 flex gap-2">
                    <button className="text-xs font-semibold text-brand-700 dark:text-brand-200" onClick={item.action}>Open</button>
                    {item.dismiss && <button className="text-xs text-ink-400" onClick={item.dismiss}>Dismiss</button>}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function PriorityRing({ label }) {
  const r = 16
  const circ = 2 * Math.PI * r
  return (
    <div className="flex items-center gap-3 py-1">
      <svg aria-hidden="true" focusable="false" width="40" height="40" className="shrink-0" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(77,115,244,0.18)" strokeWidth="3.5" />
        <circle
          cx="20" cy="20" r={r} fill="none"
          stroke="rgba(77,115,244,0.7)" strokeWidth="3.5"
          strokeDasharray={circ}
          strokeDashoffset={circ * 0.92}
          strokeLinecap="round"
        />
      </svg>
      <span className="text-sm leading-snug">{label.replace(/^[-•]\s*/, '')}</span>
    </div>
  )
}

function CoachCard({ brief, busy, onRefresh, onDismiss, onApply, onOpenWeak }) {
  return (
    <section className="card p-4 md:p-5 border-brand-100 dark:border-brand-900">
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-11 h-11 rounded-[18px] bg-brand-600 text-white flex items-center justify-center shadow-pop">
          <Icon.brain className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl font-extrabold">{brief.title || "Today's study brief"}</h3>
            <span className="chip">{brief.source === 'ai' ? 'AI coach' : 'Offline coach'}</span>
          </div>
          <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">{brief.summary}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-soft" onClick={onRefresh} disabled={busy}><Icon.reset className="w-4 h-4" /> {busy ? 'Refreshing...' : 'Refresh'}</button>
          <button className="btn-ghost" onClick={onDismiss}><Icon.x className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 mt-4 md:grid-cols-2">
        <div className="rounded-2xl bg-brand-50 p-3 dark:bg-brand-900/20">
          <div className="text-xs font-semibold text-brand-700 dark:text-brand-200">Priorities</div>
          <div className="space-y-0.5 mt-2">
            {(brief.priorities || []).slice(0, 3).map((p, i) => (
              <PriorityRing key={i} label={p} />
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-amber-50 p-3 dark:bg-amber-900/20">
          <div className="text-xs font-semibold text-amber-800 dark:text-amber-200">Watch-outs</div>
          <ul className="mt-2 space-y-1 text-sm">
            {(brief.risks || []).map((item) => <li key={item}>- {item}</li>)}
          </ul>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="text-sm font-semibold sm:mr-auto">Next: {brief.nextAction}</div>
        <button className="btn-primary" onClick={onApply}><Icon.sparkle className="w-4 h-4" /> Apply plan</button>
        <button className="btn-soft" onClick={onOpenWeak}>Open subjects</button>
      </div>
    </section>
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

function statusWeight(status) {
  return { reading: 0, queued: 1, done: 2 }[status] ?? 3
}

function MiniSparkline({ points, color }) {
  if (!points || points.length < 2 || points.every((p) => p === 0)) return null
  const max = Math.max(...points, 1)
  const W = 44, H = 14
  const xs = points.map((_, i) => (i / (points.length - 1)) * W)
  const ys = points.map((p) => H - (p / max) * H)
  const ptStr = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')
  return (
    <svg aria-hidden="true" focusable="false" width={W} height={H} className="mt-1 opacity-70" style={{ display: 'block' }}>
      <polyline fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" points={ptStr} />
    </svg>
  )
}

function toneColor(tone) {
  const map = { brand: '#4d73f4', rose: '#f43f5e', amber: '#f59e0b', emerald: '#10b981', violet: '#8b5cf6' }
  return map[tone] || '#4d73f4'
}

function Stat({ label, value, icon, tone, onClick, sparkline }) {
  const Ic = Icon[icon]
  const tones = {
    rose: 'text-rose-600 dark:text-rose-300 bg-rose-100/60 dark:bg-rose-900/30',
    brand: 'text-brand-600 dark:text-brand-300 bg-brand-100/60 dark:bg-brand-900/30',
    amber: 'text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-900/30',
    emerald: 'text-emerald-700 dark:text-emerald-300 bg-emerald-100/60 dark:bg-emerald-900/30',
    violet: 'text-violet-700 dark:text-violet-300 bg-violet-100/60 dark:bg-violet-900/30',
  }
  return (
    <button className="card tap-pop p-3 md:p-4 text-left hover:shadow-pop transition" onClick={onClick}>
      <div className={cx('w-9 h-9 rounded-2xl flex items-center justify-center mb-3', tones[tone])}>
        <Ic className="w-5 h-5" />
      </div>
      <div className="text-2xl font-display font-semibold">{value}</div>
      <MiniSparkline points={sparkline} color={toneColor(tone)} />
      <div className="text-xs text-ink-500 mt-0.5">{label}</div>
    </button>
  )
}

function MiniMetric({ label, value }) {
  return (
    <div className="rounded-2xl bg-ink-50 p-3 dark:bg-ink-800">
      <div className="text-lg font-display font-semibold">{value}</div>
      <div className="text-xs text-ink-500">{label}</div>
    </div>
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
