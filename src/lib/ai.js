// Lightweight AI client supporting Anthropic Claude, OpenAI, and a built-in offline mock.
// The user provides their own API key in Settings — it is stored only on-device.

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
  return `You are ScholarAI, a warm, focused study assistant for ${state.user.name || 'the student'}.
You help with notes, study planning, revision, and explaining concepts clearly.
Prefer concise, structured answers with examples. Use markdown.

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

export const callAI = async ({ settings, system, messages, json = false }) => {
  const useProxy = settings.useServerProxy !== false && !isLocalVite()
  if (settings.aiProvider === 'mock') {
    return mockReply(messages, json)
  }
  if (useProxy) {
    return callProviderProxy({ settings, system, messages, json })
  }
  if (!settings.aiKey) {
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

async function callProviderProxy({ settings, system, messages, json }) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: settings.aiProvider,
      model: settings.aiModel,
      apiKey: settings.aiKey,
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

async function callAnthropic({ settings, system, messages, json }) {
  const body = {
    model: settings.aiModel || 'claude-opus-4-7',
    max_tokens: 2048,
    system: json
      ? `${system}\n\nReturn ONLY a valid JSON object — no commentary, no markdown fences.`
      : system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
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
}

async function callOpenAI({ settings, system, messages, json }) {
  const body = {
    model: settings.aiModel || 'gpt-4o-mini',
    messages: [{ role: 'system', content: system }, ...messages],
    response_format: json ? { type: 'json_object' } : undefined,
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
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
}

async function callOpenRouter({ settings, system, messages, json }) {
  const model = settings.aiModel || 'anthropic/claude-opus-4'
  const body = {
    model,
    messages: [{ role: 'system', content: json ? `${system}\n\nReturn ONLY a valid JSON object — no commentary, no markdown fences.` : system }, ...messages],
  }
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
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
}

function safeJSON(text) {
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
