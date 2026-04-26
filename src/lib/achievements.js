export const ACHIEVEMENTS = [
  { id: 'first-focus', name: 'First Focus', detail: 'Log your first study session.', icon: 'timer' },
  { id: 'deep-work', name: 'Deep Work', detail: 'Log 120 total focus minutes.', icon: 'timer' },
  { id: 'study-streak-3', name: 'Study Streak 3', detail: 'Keep any habit going for 3 days.', icon: 'fire' },
  { id: 'study-streak-7', name: 'Study Streak 7', detail: 'Keep any habit going for 7 days.', icon: 'fire' },
  { id: 'assignment-closer', name: 'Assignment Closer', detail: 'Mark your first assignment done.', icon: 'task' },
  { id: 'deadline-boss', name: 'Deadline Boss', detail: 'Finish 10 assignments.', icon: 'task' },
  { id: 'card-starter', name: 'Card Starter', detail: 'Review 10 flashcards.', icon: 'cards' },
  { id: 'memory-machine', name: 'Memory Machine', detail: 'Review 100 flashcards.', icon: 'cards' },
  { id: 'note-taker', name: 'Note Taker', detail: 'Create 5 notes.', icon: 'note' },
  { id: 'mind-mapper', name: 'Mind Mapper', detail: 'Create your first mind map.', icon: 'mindmap' },
  { id: 'file-cabinet', name: 'File Cabinet', detail: 'Upload 3 files.', icon: 'files' },
  { id: 'grade-tracker', name: 'Grade Tracker', detail: 'Add 3 grades.', icon: 'grade' },
]

export function achievementStats(state) {
  const studyMinutes = (state.studySessions || []).reduce((total, session) => total + (Number(session.minutes) || 0), 0)
  const habitStreak = Math.max(0, ...(state.habits || []).map((habit) => Number(habit.streak) || 0))
  const assignmentsDone = (state.assignments || []).filter((assignment) => assignment.status === 'done').length
  const cardsReviewed = (state.flashcards || []).reduce((total, card) => total + (Number(card.reviews) || 0), 0)

  return {
    studyMinutes,
    studySessions: (state.studySessions || []).length,
    habitStreak,
    assignmentsDone,
    cardsReviewed,
    notes: (state.notes || []).length,
    mindmaps: (state.mindmaps || []).length,
    files: (state.files || []).length,
    grades: (state.grades || []).length,
  }
}

export function evaluateAchievements(state) {
  const stats = achievementStats(state)
  const unlocked = []
  if (stats.studySessions >= 1) unlocked.push('first-focus')
  if (stats.studyMinutes >= 120) unlocked.push('deep-work')
  if (stats.habitStreak >= 3) unlocked.push('study-streak-3')
  if (stats.habitStreak >= 7) unlocked.push('study-streak-7')
  if (stats.assignmentsDone >= 1) unlocked.push('assignment-closer')
  if (stats.assignmentsDone >= 10) unlocked.push('deadline-boss')
  if (stats.cardsReviewed >= 10) unlocked.push('card-starter')
  if (stats.cardsReviewed >= 100) unlocked.push('memory-machine')
  if (stats.notes >= 5) unlocked.push('note-taker')
  if (stats.mindmaps >= 1) unlocked.push('mind-mapper')
  if (stats.files >= 3) unlocked.push('file-cabinet')
  if (stats.grades >= 3) unlocked.push('grade-tracker')
  return unlocked
}

export function nextAchievements(state, now = Date.now()) {
  const current = new Set((state.achievements || []).map((achievement) => achievement.id))
  const unlocked = evaluateAchievements(state)
    .filter((id) => !current.has(id))
    .map((id) => ({ id, unlockedAt: now }))
  return unlocked
}
