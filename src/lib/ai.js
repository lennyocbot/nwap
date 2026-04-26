// Lightweight AI client. Production AI calls go through the server proxy so API keys
// never enter the browser bundle or user settings.
import { supabase } from './supabase.js'

export const buildSystemPrompt = (state, contextNote) => {
  const now = currentTimeContext()
  const subjects = state.subjects.map((s) => `- ${s.name}${s.teacher ? ` (${s.teacher})` : ''}`).join('\n')
  const upcoming = state.assignments
    .filter((a) => a.status !== 'done')
    .slice(0, 8)
    .map((a) => {
      const subj = state.subjects.find((s) => s.id === a.subjectId)?.name || 'General'
      return `- ${a.title} [${subj}] due ${new Date(a.due).toLocaleString()} (${a.priority})`
    })
    .join('\n')
  const gradesBySubject = state.subjects.map((subject) => {
    const grades = (state.grades || []).filter((grade) => grade.subjectId === subject.id)
    if (!grades.length) return `- ${subject.name}: no grades yet`
    const totalWeight = grades.reduce((total, grade) => total + (Number(grade.weight) || 1), 0)
    const weighted = grades.reduce((total, grade) => total + ((Number(grade.score) || 0) / Math.max(1, Number(grade.outOf) || 100)) * 100 * (Number(grade.weight) || 1), 0) / Math.max(1, totalWeight)
    const recent = grades.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3)
      .map((grade) => `${grade.name}: ${grade.score}/${grade.outOf}`)
      .join(', ')
    return `- ${subject.name}: ${Math.round(weighted)}% weighted average. Recent: ${recent}`
  }).join('\n')
  const weakest = state.subjects
    .map((subject) => {
      const grades = (state.grades || []).filter((grade) => grade.subjectId === subject.id)
      if (!grades.length) return null
      const avg = grades.reduce((total, grade) => total + ((Number(grade.score) || 0) / Math.max(1, Number(grade.outOf) || 100)) * 100, 0) / grades.length
      return { name: subject.name, avg }
    })
    .filter(Boolean)
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 2)
    .map((item) => `${item.name} (${Math.round(item.avg)}%)`)
    .join(', ')
  const timetable = (state.timetable || []).slice(0, 20).map((slot) => {
    const subject = state.subjects.find((s) => s.id === slot.subjectId)?.name || 'Study'
    const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][Math.max(0, Number(slot.day || 1) - 1)]
    const title = slot.title || subject
    return `- ${day} ${slot.start}-${slot.end}: ${title}${slot.kind ? ` (${slot.kind})` : ''}${slot.room ? ` in ${slot.room}` : ''}`
  }).join('\n')
  const decks = (state.decks || []).map((deck) => {
    const cards = (state.flashcards || []).filter((card) => card.deckId === deck.id)
    const due = cards.filter((card) => Number(card.due || 0) <= Date.now()).length
    return `- ${deck.name}: ${cards.length} cards, ${due} due`
  }).join('\n')
  const sevenDaysAgo = Date.now() - 7 * 86400000
  const recentStudy = (state.studySessions || [])
    .filter((session) => Number(session.at || 0) >= sevenDaysAgo || (session.date && new Date(session.date).getTime() >= sevenDaysAgo))
    .reduce((total, session) => total + (Number(session.minutes) || 0), 0)
  const habits = (state.habits || []).map((habit) => `- ${habit.name}: streak ${habit.streak || 0}`).join('\n')
  return `You are Syllabi, a warm, focused study assistant for ${state.user.name || 'the student'}.
You help with notes, study planning, revision, and explaining concepts clearly.
Prefer concise, structured answers with examples. Use markdown.

Student profile:
- Name: ${state.user.name || 'Student'}
- School: ${state.user.school || '-'}
- Year: ${state.user.year || '-'}

Current time:
- Local date/time: ${now.local}
- Timezone: ${now.timeZone}
- ISO timestamp: ${now.iso}
- Day planning rule: if the user asks to plan today, start from the current local time unless they specify another start time. Do not schedule tasks in the past.

Subjects:
${subjects || '- none yet -'}

Upcoming work:
${upcoming || '- nothing pending -'}

Grades:
${gradesBySubject || '- no grades yet -'}
Weakest subjects: ${weakest || 'not enough grade data yet'}

Timetable:
${timetable || '- no timetable blocks yet -'}

Revision decks:
${decks || '- no decks yet -'}

Recent study time: ${recentStudy} minutes in the last 7 days.
Habits:
${habits || '- no habits yet -'}

${contextNote ? `\nContext for this conversation:\n${contextNote}\n` : ''}`
}

export function currentTimeContext() {
  const date = new Date()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'
  return {
    iso: date.toISOString(),
    timeZone,
    local: date.toLocaleString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }),
    time: date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    date: date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
  }
}

export const callAI = async ({ settings, system, messages, json = false, aiModeOverride = null }) => {
  if (settings.aiProvider === 'mock') {
    return mockReply(messages, json)
  }
  if (!isLocalVite()) {
    try {
      return await callProviderProxy({ settings, system, messages, json, aiModeOverride })
    } catch (error) {
      throw error
    }
  }
  return mockReply(messages, json)
}

async function callProviderProxy({ settings, system, messages, json, aiModeOverride }) {
  const token = await getAccessToken()
  if (!token) throw new Error('Sign in to use Syllabi AI.')
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      aiMode: aiModeOverride || settings.aiMode || 'normal',
      system,
      messages,
      json,
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    const error = new Error(data?.message || data?.error || `AI proxy error: ${res.status}`)
    error.code = data?.error
    error.resetIn = data?.reset_in
    error.resetAt = data?.reset_at
    throw error
  }
  const data = await res.json()
  const text = data.text || ''
  return json ? safeJSON(text) : text
}

export async function fetchAIUsage() {
  if (!supabase) return null
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user?.id
  if (!userId) return null
  const { data, error } = await supabase
    .from('user_ai_usage')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchAIHealth() {
  if (isLocalVite()) return null
  const token = await getAccessToken()
  if (!token) return null
  const res = await fetch('/api/health/ai', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || `AI health check failed: ${res.status}`)
  return data
}

async function getAccessToken() {
  if (!supabase) return ''
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
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
