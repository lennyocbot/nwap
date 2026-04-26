import { todayISO } from './utils.js'

export function buildLocalCoachBrief(state, date = todayISO()) {
  const now = Date.now()
  const openAssignments = (state.assignments || [])
    .filter((assignment) => assignment.status !== 'done')
    .slice()
    .sort((a, b) => new Date(a.due) - new Date(b.due))
  const dueSoon = openAssignments.filter((assignment) => {
    const hours = (new Date(assignment.due).getTime() - now) / 3600000
    return hours > -24 && hours <= 72
  })
  const dueCards = (state.flashcards || []).filter((card) => card.due <= now)
  const weakSubject = weakestSubject(state)
  const freeWindow = firstFreeWindow(state)
  const habitToRescue = (state.habits || []).find((habit) => !habit.log?.[date])

  const priorities = []
  if (dueSoon[0]) priorities.push(`Protect the deadline: ${dueSoon[0].title}`)
  if (dueCards.length) priorities.push(`Review ${dueCards.length} due flashcard${dueCards.length === 1 ? '' : 's'}`)
  if (weakSubject) priorities.push(`Push ${weakSubject.name} toward the ${weakSubject.target || 90}% target`)
  if (!priorities.length) priorities.push('Use today for calm revision and consolidation')

  const risks = []
  dueSoon.slice(0, 3).forEach((assignment) => {
    const due = new Date(assignment.due)
    const days = Math.ceil((due.getTime() - now) / 86400000)
    risks.push(`${assignment.title} is due ${days <= 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}`)
  })
  if (habitToRescue) risks.push(`${habitToRescue.name} is not checked off yet`)
  if (!risks.length) risks.push('No urgent risk flagged right now')

  const nextAction = dueSoon[0]
    ? `Start a 25 minute focus block for ${dueSoon[0].title}.`
    : dueCards.length
      ? 'Review the due flashcards before starting new work.'
      : weakSubject
        ? `Do one targeted ${weakSubject.name} practice set.`
        : 'Make one quick note from today and revise it later.'

  return {
    id: `coach-${date}`,
    date,
    source: 'local',
    title: "Today's study brief",
    summary: freeWindow
      ? `Best opening: ${freeWindow}. Keep the first block small and winnable.`
      : 'Your timetable is full, so use short blocks between commitments.',
    priorities: priorities.slice(0, 4),
    risks: risks.slice(0, 4),
    nextAction,
    dismissed: false,
    createdAt: Date.now(),
  }
}

export function upsertBrief(briefs = [], brief) {
  const existing = briefs.find((item) => item.date === brief.date)
  if (!existing) return [...briefs, brief]
  return briefs.map((item) => item.date === brief.date ? { ...item, ...brief, id: item.id || brief.id } : item)
}

export function briefForToday(state) {
  const date = todayISO()
  return (state.coachBriefs || []).find((brief) => brief.date === date)
}

function weakestSubject(state) {
  const subjects = state.subjects || []
  const grades = state.grades || []
  return subjects
    .map((subject) => {
      const entries = grades.filter((grade) => grade.subjectId === subject.id)
      const avg = entries.length
        ? Math.round(entries.reduce((total, grade) => total + (grade.score / Math.max(1, grade.outOf)) * 100, 0) / entries.length)
        : null
      return { ...subject, avg, gap: avg == null ? 0 : (subject.target || 90) - avg }
    })
    .filter((subject) => subject.avg != null)
    .sort((a, b) => b.gap - a.gap)[0]
}

function firstFreeWindow(state) {
  const d = new Date().getDay()
  const day = d === 0 ? 7 : d
  const slots = (state.timetable || [])
    .filter((slot) => slot.day === day)
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start))
  if (!slots.length) return 'any 25 minute block today'
  const latest = slots[slots.length - 1]
  return latest?.end ? `after ${latest.end}` : 'after your last lesson'
}
