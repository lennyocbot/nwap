import { uid } from './utils.js'

const actionWords = [
  'add', 'create', 'make', 'schedule', 'plan', 'move', 'reschedule', 'revise',
  'revision', 'flashcard', 'note', 'summarize', 'summarise', 'assignment',
  'homework', 'timetable', 'due', 'study block', 'quiz', 'deck'
]

const greetings = new Set(['hi', 'hello', 'hey', 'yo', 'sup', 'hiya'])

export function classifyAssistantIntent(text) {
  const clean = text.trim().toLowerCase().replace(/[!?.\s]/g, '')
  if (!clean || greetings.has(clean)) return 'chat'

  const lower = text.toLowerCase()
  return actionWords.some((word) => lower.includes(word)) ? 'action' : 'chat'
}

export function planDeterministicAction({ text, state, messages = [] }) {
  const combined = buildCombinedRequest(text, messages)
  const lower = combined.toLowerCase()
  if (!/(assignment|homework|task|due)/i.test(combined)) return null

  const title = parseAssignmentTitle(combined)
  const due = parseDueDate(combined)
  if (!title || !due) return null

  const subjectId = inferSubjectId(combined, state)
  const assignment = {
    title,
    subjectId,
    due,
    priority: /urgent|important|high priority/i.test(combined) ? 'high' : 'medium',
    status: 'todo',
    estMinutes: /essay/i.test(combined) ? 120 : 45,
    notes: ''
  }

  const subjectName = state.subjects.find((s) => s.id === subjectId)?.name || 'No subject'
  return {
    reply: `Created assignment "${assignment.title}" for ${subjectName}, due ${new Date(assignment.due).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}.`,
    actions: [{ type: 'create_assignment', payload: assignment }]
  }
}

export function buildAgentSystemPrompt(state) {
  const subjects = state.subjects.map((s) => ({ id: s.id, name: s.name }))
  const decks = state.decks.map((d) => ({ id: d.id, name: d.name, subjectId: d.subjectId }))
  const assignments = state.assignments.map((a) => ({
    id: a.id,
    title: a.title,
    subjectId: a.subjectId,
    due: a.due,
    status: a.status
  }))

  return `You are ScholarAI's app operator. Decide whether to change the student's app data.
Return JSON only with shape {"reply":"short human summary","actions":[...]}.
If the user is just greeting, chatting, or asking a question, return {"reply":"...","actions":[]}.
Only create or update data when the user clearly asks you to do it.

Supported action objects:
{"type":"create_assignment","payload":{"title":"...","subjectId":"existing subject id or null","due":"ISO date","priority":"low|medium|high","status":"todo|doing|done","estMinutes":60,"notes":"..."}}
{"type":"create_note","payload":{"title":"...","content":"markdown","subjectId":"existing subject id or null","tags":["tag"],"pinned":false}}
{"type":"create_timetable_slot","payload":{"day":1,"start":"09:00","end":"10:00","subjectId":"existing subject id or null","room":""}}
{"type":"create_deck","payload":{"name":"...","subjectId":"existing subject id or null","color":"brand"}}
{"type":"create_flashcards","payload":{"deckName":"...","subjectId":"existing subject id or null","cards":[{"front":"...","back":"..."}]}}
{"type":"update_assignment","payload":{"id":"existing assignment id","patch":{"status":"doing"}}}

Subjects: ${JSON.stringify(subjects)}
Decks: ${JSON.stringify(decks)}
Assignments: ${JSON.stringify(assignments).slice(0, 3500)}`
}

export function applyAgentActions({ actions, state, dispatch }) {
  const applied = []

  for (const action of actions || []) {
    const payload = action.payload || {}

    if (action.type === 'create_assignment') {
      const item = {
        id: uid(),
        title: payload.title || 'New assignment',
        subjectId: validSubject(state, payload.subjectId),
        due: safeDate(payload.due, 3),
        priority: ['low', 'medium', 'high'].includes(payload.priority) ? payload.priority : 'medium',
        status: ['todo', 'doing', 'done'].includes(payload.status) ? payload.status : 'todo',
        estMinutes: Number(payload.estMinutes) || 60,
        notes: payload.notes || ''
      }
      dispatch({ type: 'add', key: 'assignments', item })
      applied.push(`created assignment "${item.title}"`)
    }

    if (action.type === 'create_note') {
      const item = {
        id: uid(),
        title: payload.title || 'AI note',
        content: payload.content || '',
        subjectId: validSubject(state, payload.subjectId),
        tags: Array.isArray(payload.tags) ? payload.tags.slice(0, 6) : ['ai'],
        pinned: Boolean(payload.pinned),
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      dispatch({ type: 'add', key: 'notes', item })
      applied.push(`created note "${item.title}"`)
    }

    if (action.type === 'create_timetable_slot') {
      const item = {
        id: uid(),
        day: Number(payload.day) >= 1 && Number(payload.day) <= 7 ? Number(payload.day) : 1,
        start: timeOr(payload.start, '16:00'),
        end: timeOr(payload.end, '17:00'),
        subjectId: validSubject(state, payload.subjectId),
        room: payload.room || ''
      }
      dispatch({ type: 'add', key: 'timetable', item })
      applied.push(`scheduled ${item.start}-${item.end}`)
    }

    if (action.type === 'create_deck') {
      const item = {
        id: uid(),
        name: payload.name || 'AI deck',
        subjectId: validSubject(state, payload.subjectId),
        color: payload.color || 'brand'
      }
      dispatch({ type: 'add', key: 'decks', item })
      applied.push(`created deck "${item.name}"`)
    }

    if (action.type === 'create_flashcards') {
      const deck = {
        id: uid(),
        name: payload.deckName || 'AI flashcards',
        subjectId: validSubject(state, payload.subjectId),
        color: 'brand'
      }
      dispatch({ type: 'add', key: 'decks', item: deck })
      ;(payload.cards || []).slice(0, 20).forEach((card) => {
        dispatch({
          type: 'add',
          key: 'flashcards',
          item: {
            id: uid(),
            deckId: deck.id,
            front: card.front || 'Question',
            back: card.back || 'Answer',
            ease: 2.5,
            interval: 1,
            due: Date.now(),
            reviews: 0
          }
        })
      })
      applied.push(`created ${payload.cards?.length || 0} flashcards`)
    }

    if (action.type === 'update_assignment') {
      const existing = state.assignments.find((a) => a.id === payload.id)
      if (existing) {
        dispatch({ type: 'update', key: 'assignments', item: { id: existing.id, ...(payload.patch || {}) } })
        applied.push(`updated assignment "${existing.title}"`)
      }
    }
  }

  return applied
}

function validSubject(state, subjectId) {
  return state.subjects.some((s) => s.id === subjectId) ? subjectId : null
}

function buildCombinedRequest(text, messages) {
  const previousUser = [...messages]
    .reverse()
    .find((m) => m.role === 'user' && m.content !== text && /(assignment|homework|task|due)/i.test(m.content))

  if (previousUser && !/(assignment|homework|task|due)/i.test(text)) {
    return `${previousUser.content} ${text}`
  }

  return text
}

function parseAssignmentTitle(text) {
  const called = text.match(/\bcalled\s+["']?([^"',.]+)["']?/i)
  if (called?.[1]) return tidyTitle(called[1])

  const titled = text.match(/\btitled\s+["']?([^"',.]+)["']?/i)
  if (titled?.[1]) return tidyTitle(titled[1])

  const on = text.match(/\b(?:assignment|homework|task)\s+(?:on|about|for)\s+([^,.]+?)(?:\s+due|\s+for\s+the|\s+on\s+the|$)/i)
  if (on?.[1]) return tidyTitle(on[1])

  return ''
}

function tidyTitle(value) {
  return value
    .replace(/\b(april|may|june|july|august|september|october|november|december|january|february|march)\b.*$/i, '')
    .replace(/\b(maths?|mathematics|physics|economics|econ)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDueDate(text) {
  const now = new Date()
  const lower = text.toLowerCase()
  const months = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
  }

  const dayMatch = lower.match(/\b(?:for|on|due|the)\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b|\b(\d{1,2})(?:st|nd|rd|th)\b/)
  const monthName = Object.keys(months).find((month) => lower.includes(month))
  const yearMatch = lower.match(/\b(20\d{2})\b/)

  if (dayMatch) {
    const day = Number(dayMatch[1] || dayMatch[2])
    const month = monthName ? months[monthName] : now.getMonth()
    const year = yearMatch ? Number(yearMatch[1]) : now.getFullYear()
    const date = new Date(year, month, day, 23, 59, 0, 0)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }

  if (lower.includes('tomorrow')) return endOfDay(1)
  if (lower.includes('today')) return endOfDay(0)
  if (lower.includes('friday')) return nextWeekday(5)
  if (lower.includes('monday')) return nextWeekday(1)
  if (lower.includes('tuesday')) return nextWeekday(2)
  if (lower.includes('wednesday')) return nextWeekday(3)
  if (lower.includes('thursday')) return nextWeekday(4)
  if (lower.includes('saturday')) return nextWeekday(6)
  if (lower.includes('sunday')) return nextWeekday(0)

  return ''
}

function inferSubjectId(text, state) {
  const lower = text.toLowerCase()
  const aliases = {
    maths: 'mathematics',
    math: 'mathematics',
    econ: 'economics'
  }

  return state.subjects.find((subject) => {
    const name = subject.name.toLowerCase()
    return lower.includes(name) || Object.entries(aliases).some(([alias, full]) => lower.includes(alias) && name.includes(full))
  })?.id || null
}

function endOfDay(offset) {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  date.setHours(23, 59, 0, 0)
  return date.toISOString()
}

function nextWeekday(target) {
  const date = new Date()
  const today = date.getDay()
  const delta = (target + 7 - today) % 7 || 7
  date.setDate(date.getDate() + delta)
  date.setHours(23, 59, 0, 0)
  return date.toISOString()
}

function safeDate(value, fallbackDays) {
  const date = value ? new Date(value) : new Date(Date.now() + fallbackDays * 86400000)
  if (Number.isNaN(date.getTime())) return new Date(Date.now() + fallbackDays * 86400000).toISOString()
  return date.toISOString()
}

function timeOr(value, fallback) {
  return /^\d{2}:\d{2}$/.test(value || '') ? value : fallback
}
