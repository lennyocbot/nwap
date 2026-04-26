import { uid } from './utils.js'
import { normalizeAIText } from './text.js'

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

export function buildAgentSystemPrompt(state, contextNote) {
  const subjects = state.subjects.map((s) => ({ id: s.id, name: s.name }))
  const decks = state.decks.map((d) => ({ id: d.id, name: d.name, subjectId: d.subjectId }))
  const assignments = state.assignments.map((a) => ({
    id: a.id,
    title: a.title,
    subjectId: a.subjectId,
    due: a.due,
    status: a.status
  }))

  return `You are Syllabi's app operator with tools. You are smarter than brittle keyword matching, so interpret typos, follow-up answers, natural dates, and chat history.
Return JSON only with shape {"reply":"short human message","actions":[...],"handoffToChat":false}.
Today is ${new Date().toISOString().slice(0, 10)}.

Rules:
- If the user asks you to change the app, return one or more actions. These are real tool calls.
- If details are missing, ask for ONLY the missing details and return actions: [].
- Use prior user messages in the conversation to resolve follow-ups. Example: if the user first asks "add an assignment for the 27th called volleyball" and then says "april 2026, maths", create the assignment.
- Never claim that something was added, created, moved, deleted, or updated unless you return a matching action.
- For normal study questions, explanations, greetings, or brainstorming, return actions: [] and handoffToChat: true unless a short direct reply is enough.
- For quiz requests, return a present_quiz action with interactive questions. Do not create a note unless the user explicitly asks to save the quiz to notes.
- Dates must be ISO strings. If the user gives a day/month/year, use 23:59 local time for assignments unless they gave a time.
- Match subjects to existing subject ids, accepting common aliases and typos like maths -> Mathematics and econ -> Economics.

Supported action objects:
{"type":"create_assignment","payload":{"title":"...","subjectId":"existing subject id or null","due":"ISO date","priority":"low|medium|high","status":"todo|doing|done","estMinutes":60,"notes":"..."}}
{"type":"create_note","payload":{"title":"...","content":"markdown","subjectId":"existing subject id or null","tags":["tag"],"pinned":false}}
{"type":"create_calendar_event","payload":{"title":"...","date":"ISO date","color":"brand","notes":"..."}}
{"type":"create_timetable_slot","payload":{"day":1,"start":"09:00","end":"10:00","subjectId":"existing subject id or null","room":""}}
{"type":"create_revision_session","payload":{"date":"YYYY-MM-DD","minutes":25,"subjectId":"existing subject id or null","at":"ISO date"}}
{"type":"create_deck","payload":{"name":"...","subjectId":"existing subject id or null","color":"brand"}}
{"type":"create_flashcards","payload":{"deckName":"...","subjectId":"existing subject id or null","cards":[{"front":"...","back":"..."}]}}
{"type":"update_assignment","payload":{"id":"existing assignment id","patch":{"status":"doing"}}}
{"type":"present_quiz","payload":{"title":"...","questions":[{"q":"...","choices":["...","...","...","..."],"answer":0,"explain":"..."}]}}

${contextNote ? `Current page context:\n${contextNote}\n` : ''}
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
        notes: normalizeAIText(payload.notes || '')
      }
      dispatch({ type: 'add', key: 'assignments', item })
      applied.push(`created assignment "${item.title}"`)
    }

    if (action.type === 'create_note') {
      const item = {
        id: uid(),
        title: payload.title || 'AI note',
        content: normalizeAIText(payload.content || ''),
        subjectId: validSubject(state, payload.subjectId),
        tags: Array.isArray(payload.tags) ? payload.tags.slice(0, 6) : ['ai'],
        pinned: Boolean(payload.pinned),
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      dispatch({ type: 'add', key: 'notes', item })
      applied.push(`created note "${item.title}"`)
    }

    if (action.type === 'create_calendar_event') {
      const item = {
        id: uid(),
        title: payload.title || 'New event',
        date: safeDate(payload.date, 1),
        color: payload.color || 'brand',
        notes: normalizeAIText(payload.notes || '')
      }
      dispatch({ type: 'add', key: 'events', item })
      applied.push(`created event "${item.title}"`)
    }

    if (action.type === 'create_timetable_slot') {
      const item = {
        id: uid(),
        day: Number(payload.day) >= 1 && Number(payload.day) <= 7 ? Number(payload.day) : 1,
        start: timeOr(payload.start, '16:00'),
        end: timeOr(payload.end, '17:00'),
        subjectId: validSubject(state, payload.subjectId),
        room: normalizeAIText(payload.room || '')
      }
      dispatch({ type: 'add', key: 'timetable', item })
      applied.push(`scheduled ${item.start}-${item.end}`)
    }

    if (action.type === 'create_revision_session') {
      const date = payload.date || new Date().toISOString().slice(0, 10)
      const item = {
        id: uid(),
        date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : safeISODate(date),
        minutes: Number(payload.minutes) || 25,
        subjectId: validSubject(state, payload.subjectId),
        at: payload.at ? new Date(payload.at).getTime() : Date.now()
      }
      dispatch({ type: 'add', key: 'studySessions', item })
      applied.push(`logged ${item.minutes}m revision`)
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
            front: normalizeAIText(card.front || 'Question'),
            back: normalizeAIText(card.back || 'Answer'),
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

function safeDate(value, fallbackDays) {
  const date = value ? new Date(value) : new Date(Date.now() + fallbackDays * 86400000)
  if (Number.isNaN(date.getTime())) return new Date(Date.now() + fallbackDays * 86400000).toISOString()
  return date.toISOString()
}

function timeOr(value, fallback) {
  return /^\d{2}:\d{2}$/.test(value || '') ? value : fallback
}

function safeISODate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10)
  return date.toISOString().slice(0, 10)
}
