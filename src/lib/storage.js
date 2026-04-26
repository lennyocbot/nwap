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
    dismissedNudges: [],
    coachBriefTime: '07:00',
    timetableOrientation: 'days-left',
    timetableRows: [],
  },
  subjects: [],
  notes: [],
  assignments: [],
  events: [],
  timetable: [],
  flashcards: [],
  decks: [],
  files: [],
  habits: [
    { id: 'h1', name: 'Review flashcards', emoji: 'FC', streak: 0, log: {} },
    { id: 'h2', name: 'Past-paper question', emoji: 'PQ', streak: 0, log: {} },
    { id: 'h3', name: 'Focused reading', emoji: 'RD', streak: 0, log: {} },
  ],
  goals: [],
  grades: [],
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
      dismissedNudges: Array.isArray(settings.dismissedNudges) ? settings.dismissedNudges : [],
      timetableRows: Array.isArray(settings.timetableRows) ? settings.timetableRows : [],
      timetableOrientation,
      pomodoro: { ...defaultState.settings.pomodoro, ...(settings.pomodoro || {}) },
    },
    subjects: migrateSubjects(parsed.subjects || defaultState.subjects),
    notes: migrateNotes(parsed.notes || defaultState.notes),
    coachBriefs: parsed.coachBriefs || [],
    achievements: parsed.achievements || [],
    examAttempts: parsed.examAttempts || [],
  }
}

function subjectInitial(name = '') {
  const match = String(name || '').trim().match(/[A-Za-z0-9]/)
  return (match?.[0] || 'S').toUpperCase()
}

function migrateSubjects(subjects) {
  return (subjects || []).map((subject) => {
    const next = { ...subject }
    const expected = subjectInitial(next.name)
    const current = String(next.emoji || '').trim()
    if (!current || (current === 'S' && expected !== 'S')) next.emoji = expected
    return next
  })
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
