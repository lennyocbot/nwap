const KEY = 'scholarai.state.v1'

export const defaultState = {
  user: { name: 'Student', avatar: null, school: '', year: '' },
  settings: {
    theme: 'system',          // 'light' | 'dark' | 'system'
    accent: 'brand',
    aiProvider: 'anthropic',  // 'anthropic' | 'openai' | 'mock'
    aiModel: 'claude-opus-4-7',
    aiKey: '',
    pomodoro: { focus: 25, short: 5, long: 15, longEvery: 4 },
    weekStart: 1,             // 0=Sun, 1=Mon
    notifications: true,
  },
  subjects: [
    { id: 's1', name: 'Mathematics', teacher: 'Mr. Reyes', room: '204', color: 'brand', emoji: '📐', target: 90 },
    { id: 's2', name: 'Biology',     teacher: 'Ms. Han',   room: '118', color: 'emerald', emoji: '🧬', target: 85 },
    { id: 's3', name: 'History',     teacher: 'Dr. Okafor', room: '301', color: 'amber',  emoji: '🏛️', target: 80 },
    { id: 's4', name: 'English',     teacher: 'Ms. Lopez',  room: '212', color: 'pink',   emoji: '📚', target: 88 },
  ],
  notes: [
    {
      id: 'n1', title: 'Welcome to ScholarAI',
      subjectId: null, tags: ['intro'], pinned: true,
      content: '# Welcome 👋\n\nAsk the AI to **summarize**, **make flashcards**, or **quiz** you on any note.\n\n- Tap *Notes* to start writing\n- Use the floating ✨ button anywhere for AI help\n- Add subjects in *Subjects* — everything connects',
      createdAt: Date.now(), updatedAt: Date.now(),
    },
  ],
  assignments: [
    { id: 'a1', title: 'Calculus problem set 4', subjectId: 's1', due: addDays(2), priority: 'high',   status: 'todo', estMinutes: 60, notes: '' },
    { id: 'a2', title: 'Cell biology essay',     subjectId: 's2', due: addDays(5), priority: 'medium', status: 'doing', estMinutes: 120, notes: '' },
  ],
  events: [],                 // calendar events
  timetable: [                // weekly recurring slots
    { id: 't1', day: 1, start: '08:30', end: '09:30', subjectId: 's1', room: '204' },
    { id: 't2', day: 1, start: '10:00', end: '11:00', subjectId: 's2', room: '118' },
    { id: 't3', day: 2, start: '09:00', end: '10:00', subjectId: 's4', room: '212' },
    { id: 't4', day: 3, start: '11:00', end: '12:00', subjectId: 's3', room: '301' },
    { id: 't5', day: 4, start: '08:30', end: '09:30', subjectId: 's1', room: '204' },
    { id: 't6', day: 5, start: '13:00', end: '14:00', subjectId: 's2', room: '118' },
  ],
  flashcards: [
    { id: 'f1', deckId: 'd1', front: 'Derivative of sin(x)', back: 'cos(x)', ease: 2.5, interval: 1, due: Date.now(), reviews: 0 },
    { id: 'f2', deckId: 'd1', front: 'Derivative of cos(x)', back: '-sin(x)', ease: 2.5, interval: 1, due: Date.now(), reviews: 0 },
    { id: 'f3', deckId: 'd2', front: 'Powerhouse of the cell', back: 'Mitochondria', ease: 2.5, interval: 1, due: Date.now(), reviews: 0 },
  ],
  decks: [
    { id: 'd1', name: 'Calculus essentials', subjectId: 's1', color: 'brand' },
    { id: 'd2', name: 'Cell biology', subjectId: 's2', color: 'emerald' },
  ],
  files: [],
  habits: [
    { id: 'h1', name: 'Read 20 minutes', emoji: '📖', streak: 0, log: {} },
    { id: 'h2', name: 'Review flashcards', emoji: '🃏', streak: 0, log: {} },
    { id: 'h3', name: 'No phone in study', emoji: '📵', streak: 0, log: {} },
  ],
  goals: [
    { id: 'g1', title: 'Get A in Calculus', subjectId: 's1', deadline: addDays(60), milestones: [
      { id: 'm1', title: 'Finish chapter 5 problems', done: false },
      { id: 'm2', title: '90%+ on practice exam', done: false },
    ]},
  ],
  grades: [
    { id: 'gr1', subjectId: 's1', name: 'Quiz 1', score: 88, outOf: 100, weight: 10, date: addDays(-12) },
    { id: 'gr2', subjectId: 's2', name: 'Lab report', score: 92, outOf: 100, weight: 15, date: addDays(-7) },
  ],
  studySessions: [],          // pomodoro logs
  chats: [
    { id: 'c1', title: 'New chat', messages: [], createdAt: Date.now() },
  ],
  reading: [],                // reading list
  mindmaps: [],
  journal: [],                // daily reflections
}

function addDays(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(23, 59, 0, 0)
  return d.toISOString()
}

export const loadState = () => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultState
    const parsed = JSON.parse(raw)
    return { ...defaultState, ...parsed, settings: { ...defaultState.settings, ...(parsed.settings || {}) } }
  } catch {
    return defaultState
  }
}

export const saveState = (s) => {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch {}
}

export const resetState = () => { localStorage.removeItem(KEY) }
