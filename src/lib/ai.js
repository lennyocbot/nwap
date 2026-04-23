// Lightweight AI client supporting Anthropic Claude, OpenAI, and a built-in offline mock.
// The user provides their own API key in Settings — it is stored only on-device.

export const buildSystemPrompt = (state, contextNote) => {
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const subjects = state.subjects.map((s) => `- [${s.id}] ${s.name}${s.teacher ? ` (${s.teacher})` : ''}`).join('\n')
  const upcoming = state.assignments
    .filter((a) => a.status !== 'done')
    .slice(0, 8)
    .map((a) => {
      const subj = state.subjects.find((s) => s.id === a.subjectId)?.name || 'General'
      return `- [${a.id}] ${a.title} [${subj}] due ${new Date(a.due).toLocaleString()} (${a.priority})`
    })
    .join('\n')
  return `You are ScholarAI, a warm, focused study assistant for ${state.user.name || 'the student'}.
You help with notes, study planning, revision, and explaining concepts clearly.
Prefer concise, structured answers with examples. Use markdown.

Today is ${today}.

Student profile:
- Name: ${state.user.name || 'Student'}
- School: ${state.user.school || '—'}
- Year: ${state.user.year || '—'}

Subjects:
${subjects || '— none yet —'}

Upcoming work:
${upcoming || '— nothing pending —'}

${contextNote ? `\nContext for this conversation:\n${contextNote}\n` : ''}`
}

// Dedicated intent classifier — uses a minimal JSON-only prompt so the model
// can't drift into prose. Returns an action object or null.
export const detectAction = async ({ settings, state, message }) => {
  if (!settings.aiKey || settings.aiProvider === 'mock') return null

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const subjects = state.subjects.map((s) => `${s.id}=${s.name}`).join(', ') || 'none'
  const pending = state.assignments
    .filter((a) => a.status !== 'done')
    .slice(0, 8)
    .map((a) => `${a.id}=${a.title}`)
    .join(', ') || 'none'

  const system = `Today is ${today}.
Subjects (id=name): ${subjects}
Pending assignments (id=title): ${pending}

You are a JSON action classifier for a student planner app. Output ONLY valid JSON — no explanation, no markdown, nothing else.

If the user's message is asking to CREATE, ADD, SCHEDULE, or MARK DONE something in their planner, output one of:
{"action":"create_assignment","title":"...","subjectId":"ID_or_null","due":"YYYY-MM-DDTHH:MM:SS","priority":"high|medium|low","estMinutes":60,"notes":""}
{"action":"mark_assignment_done","id":"ASSIGNMENT_ID_from_list"}
{"action":"create_event","title":"...","startDate":"YYYY-MM-DDTHH:MM:SS","description":""}
{"action":"add_goal","title":"...","subjectId":"ID_or_null","deadline":"YYYY-MM-DD_or_null"}
{"action":"create_note","title":"...","content":"","subjectId":"ID_or_null"}

If the message is a question, request for help, study plan as text, or anything that is NOT a direct instruction to create/modify data, output:
{"action":null}`

  try {
    const data = await callAI({ settings, system, messages: [{ role: 'user', content: message }], json: true })
    if (!data?.action) return null
    const { action, ...input } = data
    return { _action: true, tool: action, input }
  } catch {
    return null
  }
}

export const callAI = async ({ settings, system, messages, json = false }) => {
  if (settings.aiProvider === 'mock' || !settings.aiKey) {
    return mockReply(messages, json)
  }
  if (settings.aiProvider === 'anthropic') {
    return callAnthropic({ settings, system, messages, json })
  }
  if (settings.aiProvider === 'openai') {
    return callOpenAI({ settings, system, messages, json })
  }
  if (settings.aiProvider === 'openrouter') {
    return callOpenRouter({ settings, system, messages, json })
  }
  return mockReply(messages, json)
}

async function callAnthropic({ settings, system, messages, json }) {
  const body = {
    model: settings.aiModel || 'claude-opus-4-7',
    max_tokens: 2048,
    system: json
      ? `${system}\n\nReturn ONLY a valid JSON object — no commentary, no markdown fences.`
      : system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.aiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Anthropic error: ${res.status} ${await res.text()}`)
    const data = await res.json()
    const text = (data.content || []).map((c) => c.text || '').join('')
    return json ? safeJSON(text) : text
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out after 60 seconds.')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

async function callOpenAI({ settings, system, messages, json }) {
  const body = {
    model: settings.aiModel || 'gpt-4o-mini',
    messages: [{ role: 'system', content: system }, ...messages],
    response_format: json ? { type: 'json_object' } : undefined,
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.aiKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`)
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content || ''
    return json ? safeJSON(text) : text
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out after 60 seconds.')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

async function callOpenRouter({ settings, system, messages, json }) {
  const model = settings.aiModel || 'anthropic/claude-opus-4'
  const body = {
    model,
    messages: [{ role: 'system', content: json ? `${system}\n\nReturn ONLY a valid JSON object — no commentary, no markdown fences.` : system }, ...messages],
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.aiKey}`,
        'HTTP-Referer': 'https://scholarai.app',
        'X-Title': 'ScholarAI',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`OpenRouter error: ${res.status} ${await res.text()}`)
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content || ''
    return json ? safeJSON(text) : text
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out after 60 seconds.')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

function safeJSON(text) {
  if (typeof text !== 'string') return text
  try { return JSON.parse(text) } catch {}
  const m = text.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch {} }
  return null
}

// Offline fallback so the app still feels alive without an API key.
function mockReply(messages, json) {
  const last = messages[messages.length - 1]?.content || ''
  if (json) {
    if (/flashcard/i.test(last)) {
      return {
        cards: [
          { front: 'Sample front (configure your API key for real generation)', back: 'Sample back' },
          { front: 'What does ScholarAI need to power AI features?', back: 'An Anthropic or OpenAI API key in Settings.' },
        ],
      }
    }
    if (/quiz/i.test(last)) {
      return {
        questions: [
          { q: 'Add your AI key in Settings to generate real quizzes — true or false?', choices: ['True', 'False'], answer: 0 },
        ],
      }
    }
    if (/plan/i.test(last)) {
      return {
        plan: [
          { day: 'Today', tasks: ['Add an Anthropic or OpenAI key in Settings', 'Then ask me to plan again'] },
        ],
      }
    }
    return { note: 'Add an AI key in Settings to enable real responses.' }
  }
  return [
    "I'm running in **offline demo mode** right now.",
    '',
    'Add an Anthropic or OpenAI API key in **Settings → AI** and I can:',
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
      content: `Generate ${n} high-quality flashcards from the source below. Return JSON: {"cards":[{"front":"...","back":"..."}]} — fronts should be questions or prompts, backs concise answers.\n\nSOURCE:\n${source}`
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
