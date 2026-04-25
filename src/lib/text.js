export function normalizeAIText(value = '') {
  return String(value)
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\r\n/g, '\n')
}

export function markdownFromQuiz(quiz) {
  const questions = Array.isArray(quiz?.questions) ? quiz.questions : []
  return [
    `# ${quiz?.title || 'AI Quiz'}`,
    '',
    ...questions.flatMap((question, index) => {
      const choices = Array.isArray(question.choices)
        ? question.choices.map((choice, choiceIndex) => `${choiceIndex + 1}. ${choice}`)
        : []
      return [
        `## ${index + 1}. ${question.q || question.question || 'Question'}`,
        '',
        ...choices,
        '',
        `**Answer:** ${answerText(question)}`,
        question.explain ? `\n${question.explain}` : '',
      ].filter(Boolean)
    }),
  ].join('\n')
}

function answerText(question) {
  if (typeof question.answer === 'number' && Array.isArray(question.choices)) {
    return question.choices[question.answer] || `Choice ${question.answer + 1}`
  }
  return question.answer || question.correctAnswer || 'See explanation'
}
