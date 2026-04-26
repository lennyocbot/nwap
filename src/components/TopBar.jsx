import { useApp } from '../context/AppContext.jsx'
import { Icon } from './Icons.jsx'
import Avatar from './Avatar.jsx'

const titles = {
  dashboard: 'Dashboard',
  ai: 'AI Chat',
  notes: 'Notes',
  assignments: 'Assignments',
  timetable: 'Timetable',
  calendar: 'Calendar',
  study: 'Study Timer',
  revision: 'Revision',
  exams: 'Exam Simulator',
  subjects: 'Subjects',
  grades: 'Grades',
  goals: 'Goals',
  habits: 'Habits',
  files: 'Files',
  reading: 'Reading List',
  journal: 'Journal',
  mindmap: 'Mind Maps',
  settings: 'Settings',
  account: 'Account',
}

export default function TopBar({ onMenu }) {
  const { route, openAI, account, navigate } = useApp()
  return (
    <header className="sticky top-0 z-20 border-b border-white/70 bg-white/58 shadow-[0_16px_40px_-34px_rgba(32,57,143,0.38)] backdrop-blur-2xl">
      <div className="px-4 md:px-8 py-3 flex items-center gap-3" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}>
        <button className="md:hidden btn-ghost -ml-2" onClick={onMenu} aria-label="Menu">
          <Icon.menu className="w-5 h-5" />
        </button>
        <h1 className="font-display text-xl md:text-2xl font-extrabold tracking-tight text-ink-900">
          {titles[route.name] || 'Syllabi'}
        </h1>
        <div className="flex-1" />
        <button
          className="btn-soft"
          onClick={() => window.dispatchEvent(new Event('syllabi:open-search'))}
          title="Search"
          type="button"
        >
          <Icon.search className="w-4 h-4" />
          <span className="hidden lg:inline">Search</span>
        </button>
        <button className="btn-soft !pl-2" onClick={() => navigate('account')} title="Account sync">
          <Avatar className="w-7 h-7 rounded-xl" label={false} />
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
