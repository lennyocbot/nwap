export function clampMark(value, max) {
  const upper = Math.max(0, Number(max) || 0)
  const next = Number(value)
  if (!Number.isFinite(next)) return 0
  return Math.max(0, Math.min(upper, next))
}

export function scoreExamAttempt(attempt = {}) {
  const feedback = attempt.questionFeedback || []
  const marks = feedback.reduce((total, item) => total + clampMark(item.marksAwarded, item.marksAvailable), 0)
  const available = feedback.reduce((total, item) => total + Math.max(0, Number(item.marksAvailable) || 0), 0)
  if (available > 0) {
    return {
      marks,
      available,
      score: Math.round((marks / available) * 100),
      hasMarks: true,
    }
  }
  return {
    marks: null,
    available: null,
    score: Math.max(0, Math.min(100, Math.round(Number(attempt.score ?? 0) || 0))),
    hasMarks: false,
  }
}
