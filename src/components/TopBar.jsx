import { useApp } from '../context/AppContext.jsx'
import { Icon } from './Icons.jsx'

const titles = {
  dashboard: 'Dashboard',
  ai: 'AI Chat',
  notes: 'Notes',
  assignments: 'Assignments',
  timetable: 'Timetable',
  calendar: 'Calendar',
  study: 'Study Timer',
  revision: 'Revision',
  subjects: 'Subjects',
  grades: 'Grades',
  goals: 'Goals',
  habits: 'Habits',
  files: 'Files',
  reading: 'Reading List',
  journal: 'Journal',
  mindmap: 'Mind Maps',
  settings: 'Settings',
}

export default function TopBar({ onMenu }) {
  const { route, openAI, account, navigate } = useApp()
  return (
    <header className="sticky top-0 z-20 backdrop-blur bg-white/70 dark:bg-ink-950/70 border-b border-ink-100 dark:border-ink-800">
      <div className="px-4 md:px-8 py-3 flex items-center gap-3" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}>
        <button className="md:hidden btn-ghost -ml-2" onClick={onMenu} aria-label="Menu">
          <Icon.menu className="w-5 h-5" />
        </button>
        <h1 className="font-display text-xl md:text-2xl font-semibold text-ink-900 dark:text-ink-50">
          {titles[route.name] || 'ScholarAI'}
        </h1>
        <div className="flex-1" />
        <button className="btn-soft" onClick={() => navigate('settings')} title="Account sync">
          <Icon.settings className="w-4 h-4" />
          <span className="hidden sm:inline">{account.user ? 'Synced' : 'Sign in'}</span>
        </button>
        <button className="btn-soft" onClick={() => openAI()}>
          <Icon.sparkle className="w-4 h-4" />
          <span className="hidden sm:inline">Ask AI</span>
        </button>
      </div>
    </header>
  )
}
