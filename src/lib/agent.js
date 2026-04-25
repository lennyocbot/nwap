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

function safeDate(value, fallbackDays) {
  const date = value ? new Date(value) : new Date(Date.now() + fallbackDays * 86400000)
  if (Number.isNaN(date.getTime())) return new Date(Date.now() + fallbackDays * 86400000).toISOString()
  return date.toISOString()
}

function timeOr(value, fallback) {
  return /^\d{2}:\d{2}$/.test(value || '') ? value : fallback
}
