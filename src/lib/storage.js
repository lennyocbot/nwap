const KEY = 'syllabi.state.v1'
const LEGACY_KEY = 'scholarai.state.v1'

export const defaultState = {
  user: { name: 'Student', avatar: null, avatarStoragePath: '', avatarLocalData: '', school: '', year: 'A-level' },
  settings: {
    theme: 'light',
    accent: 'brand',
    aiProvider: 'openrouter',
    aiModel: 'meta-llama/llama-3.3-70b-instruct',
    aiMode: 'normal',
    aiKey: '',
    useServerProxy: true,
    pomodoro: { focus: 25, short: 5, long: 15, longEvery: 4 },
    weekStart: 1,
    onboardingComplete: false,
    aiSetupDismissed: false,
    notifications: false,
    reminders: {
      enabled: false,
      assignments: true,
      flashcards: true,
      habits: false,
      coach: true,
      quietStart: '21:30',
      quietEnd: '07:00',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
      devices: [],
    },
    coachBriefTime: '07:00',
    timetableOrientation: 'days-left',
  },
  subjects: [
    { id: 's1', name: 'Mathematics', teacher: '', room: 'M1', color: 'brand', emoji: 'M', target: 90 },
    { id: 's2', name: 'Physics', teacher: '', room: 'P1', color: 'sky', emoji: 'P', target: 90 },
    { id: 's3', name: 'Economics', teacher: '', room: 'E1', color: 'emerald', emoji: 'E', target: 90 },
  ],
  notes: [
    {
      id: 'n1',
      title: 'Syllabi beta workspace',
      subjectId: null,
      tags: ['intro'],
      pinned: true,
      content: [
        '# Syllabi beta workspace',
        '',
        'Use this as your daily command center for A-level Mathematics, Physics, and Economics.',
        '',
        '| Area | What to track |',
        '| --- | --- |',
        '| Notes | Markdown, tables, links, code, and formulas like $E = mc^2$ |',
        '| Assignments | Due dates, priority, status, and AI breakdowns |',
        '| Revision | Flashcards, spaced repetition, and weak-topic practice |',
        '',
        'Try asking the AI to create a real assignment or generate flashcards from a note.',
      ].join('\n'),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ],
  assignments: [
    { id: 'a1', title: 'Pure maths integration practice', subjectId: 's1', due: addDays(2), priority: 'high', status: 'todo', estMinutes: 75, notes: 'Focus on integration by parts and substitution.' },
    { id: 'a2', title: 'Physics waves problem set', subjectId: 's2', due: addDays(4), priority: 'medium', status: 'todo', estMinutes: 60, notes: 'Review phase difference and stationary waves first.' },
    { id: 'a3', title: 'Economics market failure essay plan', subjectId: 's3', due: addDays(6), priority: 'medium', status: 'doing', estMinutes: 90, notes: 'Include externalities, information failure, and evaluation.' },
  ],
  events: [],
  timetable: [
    { id: 't1', day: 1, start: '08:30', end: '09:30', subjectId: 's1', room: 'M1' },
    { id: 't2', day: 1, start: '10:00', end: '11:00', subjectId: 's2', room: 'P1' },
    { id: 't3', day: 2, start: '09:00', end: '10:00', subjectId: 's3', room: 'E1' },
    { id: 't4', day: 3, start: '11:00', end: '12:00', subjectId: 's1', room: 'M1' },
    { id: 't5', day: 4, start: '08:30', end: '09:30', subjectId: 's2', room: 'P1' },
    { id: 't6', day: 5, start: '13:00', end: '14:00', subjectId: 's3', room: 'E1' },
  ],
  flashcards: [
    { id: 'f1', deckId: 'd1', front: 'What is $\\frac{d}{dx}\\sin x$?', back: '$\\cos x$', ease: 2.5, interval: 1, due: Date.now(), reviews: 0 },
    { id: 'f2', deckId: 'd1', front: 'What is the chain rule?', back: 'If $y=f(g(x))$, then $\\frac{dy}{dx}=f\\prime(g(x))g\\prime(x)$.', ease: 2.5, interval: 1, due: Date.now(), reviews: 0 },
    { id: 'f3', deckId: 'd2', front: 'Define angular frequency.', back: '$\\omega = 2\\pi f$', ease: 2.5, interval: 1, due: Date.now(), reviews: 0 },
  ],
  decks: [
    { id: 'd1', name: 'Maths essentials', subjectId: 's1', color: 'brand' },
    { id: 'd2', name: 'Physics equations', subjectId: 's2', color: 'sky' },
  ],
  files: [],
  habits: [
    { id: 'h1', name: 'Review flashcards', emoji: 'FC', streak: 0, log: {} },
    { id: 'h2', name: 'Past-paper question', emoji: 'PQ', streak: 0, log: {} },
    { id: 'h3', name: 'Focused reading', emoji: 'RD', streak: 0, log: {} },
  ],
  goals: [
    {
      id: 'g1',
      title: 'Build exam-ready calculus fluency',
      subjectId: 's1',
      deadline: addDays(60),
      milestones: [
        { id: 'm1', title: 'Finish integration mixed practice', done: false },
        { id: 'm2', title: 'Complete one timed pure maths paper', done: false },
      ],
    },
  ],
  grades: [
    { id: 'gr1', subjectId: 's1', name: 'Pure maths checkpoint', score: 82, outOf: 100, weight: 10, date: addDays(-12) },
    { id: 'gr2', subjectId: 's2', name: 'Mechanics quiz', score: 78, outOf: 100, weight: 10, date: addDays(-7) },
  ],
  studySessions: [],
  chats: [
    { id: 'c1', title: 'New chat', messages: [], createdAt: Date.now() },
  ],
  reading: [],
  mindmaps: [],
  journal: [],
  coachBriefs: [],
  achievements: [],
  examAttempts: [],
}

function addDays(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(23, 59, 0, 0)
  return d.toISOString()
}

export const loadState = () => {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY)
    if (!raw) return defaultState
    const parsed = JSON.parse(raw)
    return migrateState(parsed, { existingState: true })
  } catch {
    return defaultState
  }
}

export const saveState = (s) => {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch {}
}

export const resetState = () => {
  localStorage.removeItem(KEY)
  localStorage.removeItem(LEGACY_KEY)
}

export function migrateState(input, { existingState = false } = {}) {
  const parsed = input || {}
  const settings = parsed.settings || {}
  const legacyNotifications = typeof settings.notifications === 'boolean' ? settings.notifications : defaultState.settings.notifications
  const reminders = settings.reminders
    ? { ...defaultState.settings.reminders, ...settings.reminders }
    : { ...defaultState.settings.reminders, enabled: legacyNotifications }

  const onboardingComplete = settings.onboardingComplete === undefined
    ? Boolean(existingState)
    : Boolean(settings.onboardingComplete)

  const timetableOrientation = settings.timetableOrientation
    || (existingState ? 'days-top' : defaultState.settings.timetableOrientation)

  return {
    ...defaultState,
    ...parsed,
    user: {
      ...defaultState.user,
      ...(parsed.user || {}),
    },
    settings: {
      ...defaultState.settings,
      ...settings,
      aiProvider: 'openrouter',
      aiMode: ['normal', 'high'].includes(settings.aiMode) ? settings.aiMode : 'normal',
      aiModel: !settings.aiModel || settings.aiModel === 'anthropic/claude-sonnet-4-5'
        ? defaultState.settings.aiModel
        : settings.aiModel,
      aiKey: '',
      onboardingComplete,
      reminders,
      timetableOrientation,
      pomodoro: { ...defaultState.settings.pomodoro, ...(settings.pomodoro || {}) },
    },
    notes: migrateNotes(parsed.notes || defaultState.notes),
    coachBriefs: parsed.coachBriefs || [],
    achievements: parsed.achievements || [],
    examAttempts: parsed.examAttempts || [],
  }
}

function migrateNotes(notes) {
  return (notes || []).map((note) => {
    if (
      note.title === 'ScholarAI beta workspace'
      && typeof note.content === 'string'
      && note.content.includes('ScholarAI beta workspace')
    ) {
      return {
        ...note,
        title: 'Syllabi beta workspace',
        content: note.content.replaceAll('ScholarAI beta workspace', 'Syllabi beta workspace').replaceAll('ScholarAI', 'Syllabi'),
      }
    }
    return note
  })
}
