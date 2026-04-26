// Lightweight AI client. Production AI calls go through the server proxy so API keys
// never enter the browser bundle or user settings.

export const buildSystemPrompt = (state, contextNote) => {
  const subjects = state.subjects.map((s) => `- ${s.name}${s.teacher ? ` (${s.teacher})` : ''}`).join('\n')
  const upcoming = state.assignments
    .filter((a) => a.status !== 'done')
    .slice(0, 8)
    .map((a) => {
      const subj = state.subjects.find((s) => s.id === a.subjectId)?.name || 'General'
      return `- ${a.title} [${subj}] due ${new Date(a.due).toLocaleString()} (${a.priority})`
    })
    .join('\n')
  return `You are Syllabi, a warm, focused study assistant for ${state.user.name || 'the student'}.
You help with notes, study planning, revision, and explaining concepts clearly.
Prefer concise, structured answers with examples. Use markdown.

Student profile:
- Name: ${state.user.name || 'Student'}
- School: ${state.user.school || '-'}
- Year: ${state.user.year || '-'}

Subjects:
${subjects || '- none yet -'}

Upcoming work:
${upcoming || '- nothing pending -'}

${contextNote ? `\nContext for this conversation:\n${contextNote}\n` : ''}`
}

export const callAI = async ({ settings, system, messages, json = false }) => {
  if (settings.aiProvider === 'mock') {
    return mockReply(messages, json)
  }
  if (!isLocalVite()) {
    try {
      return await callProviderProxy({ settings, system, messages, json })
    } catch (error) {
      throw error
    }
  }
  return mockReply(messages, json)
}

async function callProviderProxy({ settings, system, messages, json }) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'openrouter',
      model: settings.aiModel,
      system,
      messages,
      json,
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error || `AI proxy error: ${res.status}`)
  }
  const data = await res.json()
  const text = data.text || ''
  return json ? safeJSON(text) : text
}

function isLocalVite() {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function safeJSON(text) {
  try { return JSON.parse(text) } catch {}
  const m = text.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch {} }
  return null
}

// Offline fallback for local development or temporary server configuration issues.
function mockReply(messages, json) {
  const last = messages[messages.length - 1]?.content || ''
  if (json) {
    if (/flashcard/i.test(last)) {
      return {
        cards: [
          { front: 'Sample front', back: 'Sample back' },
          { front: 'How does production Syllabi power AI?', back: 'Through a secure server-side OpenRouter connection.' },
        ],
      }
    }
    if (/quiz/i.test(last)) {
      return {
        questions: [
          { q: 'Production Syllabi uses a secure server AI connection - true or false?', choices: ['True', 'False'], answer: 0 },
        ],
      }
    }
    if (/plan/i.test(last)) {
      return {
        plan: [
          { day: 'Today', tasks: ['Review your dashboard', 'Ask Syllabi to plan one focused block'] },
        ],
      }
    }
    return { note: 'Server AI is not configured in this local/demo environment.' }
  }
  return [
    "I'm running in **offline demo mode** right now.",
    '',
    'On the live site, Syllabi uses the secure server AI connection to:',
    '- Summarize and rewrite your notes',
    '- Generate flashcards & quizzes from any topic',
    '- Build a personalized study plan around your timetable',
    '- Explain concepts step by step',
    '',
    `You said: _${last.slice(0, 200)}_`,
  ].join('\n')
}

// Helpers used by features
export const aiSummarizeNote = async ({ settings, state, note }) => {
  const system = buildSystemPrompt(state, `Summarizing a note titled "${note.title}".`)
  return callAI({
    settings, system,
    messages: [{ role: 'user', content: `Summarize this note in 5 bullet points and add a one-line "key idea":\n\n${note.content}` }],
  })
}

export const aiGenerateFlashcards = async ({ settings, state, source, n = 8 }) => {
  const system = buildSystemPrompt(state, 'Generating flashcards.')
  const data = await callAI({
    settings, system, json: true,
    messages: [{
      role: 'user',
      content: `Generate ${n} high-quality flashcards from the source below. Return JSON: {"cards":[{"front":"...","back":"..."}]} - fronts should be questions or prompts, backs concise answers.\n\nSOURCE:\n${source}`
    }],
  })
  return data?.cards || []
}

export const aiGenerateQuiz = async ({ settings, state, source, n = 5 }) => {
  const system = buildSystemPrompt(state, 'Generating a multiple-choice quiz.')
  const data = await callAI({
    settings, system, json: true,
    messages: [{
      role: 'user',
      content: `Create a ${n}-question multiple-choice quiz from the source. Return JSON: {"questions":[{"q":"...","choices":["a","b","c","d"],"answer":0,"explain":"..."}]}\n\nSOURCE:\n${source}`
    }],
  })
  return data?.questions || []
}

export const aiBuildStudyPlan = async ({ settings, state, days = 7 }) => {
  const system = buildSystemPrompt(state, 'Building a personalized study plan.')
  const data = await callAI({
    settings, system, json: true,
    messages: [{
      role: 'user',
      content: `Build a ${days}-day study plan covering my upcoming assignments and weak subjects. Return JSON: {"plan":[{"day":"YYYY-MM-DD or weekday","tasks":["task 1","task 2"]}]}`
    }],
  })
  return data?.plan || []
}

export const aiExplain = async ({ settings, state, topic, level = 'high school' }) => {
  const system = buildSystemPrompt(state, `Explaining a concept at the ${level} level.`)
  return callAI({
    settings, system,
    messages: [{ role: 'user', content: `Explain "${topic}" clearly for a ${level} student. Include a real-world example and a 2-question check-for-understanding.` }],
  })
}
