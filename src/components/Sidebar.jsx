import { useApp } from '../context/AppContext.jsx'
import { Icon } from './Icons.jsx'
import { cx } from '../lib/utils.js'

const primary = [
  { id: 'dashboard',  label: 'Dashboard',  icon: 'home' },
  { id: 'ai',         label: 'AI Chat',    icon: 'chat' },
  { id: 'notes',      label: 'Notes',      icon: 'note' },
  { id: 'assignments',label: 'Assignments',icon: 'task' },
  { id: 'timetable',  label: 'Timetable',  icon: 'timetable' },
  { id: 'calendar',   label: 'Calendar',   icon: 'calendar' },
  { id: 'study',      label: 'Study',      icon: 'timer' },
  { id: 'revision',   label: 'Revision',   icon: 'cards' },
]

const secondary = [
  { id: 'subjects',   label: 'Subjects',   icon: 'subject' },
  { id: 'grades',     label: 'Grades',     icon: 'grade' },
  { id: 'goals',      label: 'Goals',      icon: 'goal' },
  { id: 'habits',     label: 'Habits',     icon: 'habit' },
  { id: 'files',      label: 'Files',      icon: 'files' },
  { id: 'reading',    label: 'Reading',    icon: 'book' },
  { id: 'journal',    label: 'Journal',    icon: 'journal' },
  { id: 'mindmap',    label: 'Mind Maps',  icon: 'mindmap' },
  { id: 'settings',   label: 'Settings',   icon: 'settings' },
]

export default function Sidebar({ open, onClose }) {
  const { route, navigate, state, account, openAI } = useApp()
  const IconOf = (k) => Icon[k]

  const Item = ({ id, label, icon }) => {
    const active = route.name === id
    const Ic = IconOf(icon)
    return (
      <div
        className={cx('nav-item', active && 'active')}
        onClick={() => { navigate(id); onClose?.() }}
        role="button"
        aria-current={active ? 'page' : undefined}
      >
        <Ic className="w-5 h-5 shrink-0" />
        <span>{label}</span>
      </div>
    )
  }

  const panel = (
    <aside className="h-full w-[272px] shrink-0 flex flex-col bg-white/80 dark:bg-ink-900/80 backdrop-blur border-r border-ink-100 dark:border-ink-800">
      <div className="px-5 py-5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center text-white">
          <Icon.sparkle className="w-5 h-5" />
        </div>
        <div>
          <div className="font-display font-semibold text-ink-900 dark:text-ink-50 leading-tight">Syllabi</div>
          <div className="text-xs text-ink-500">Hello, {state.user.name || 'Student'}</div>
        </div>
      </div>
      <div className="px-3 pb-2 overflow-y-auto flex-1">
        <div className="space-y-1">{primary.map((x) => <Item key={x.id} {...x} />)}</div>
        <div className="section-title px-3 mt-5 mb-2">Life</div>
        <div className="space-y-1">{secondary.map((x) => <Item key={x.id} {...x} />)}</div>
      </div>
      <div className="p-3 border-t border-ink-100 dark:border-ink-800">
        <button onClick={() => navigate('settings')} className="w-full btn-soft mb-2">
          <Icon.settings className="w-4 h-4" /> {account.user ? 'Account synced' : 'Sign in to sync'}
        </button>
        <button onClick={() => { openAI(); onClose?.() }} className="w-full btn-primary">
          <Icon.sparkle className="w-4 h-4" /> Ask Syllabi
        </button>
      </div>
    </aside>
  )

  return (
    <>
      {/* desktop/iPad */}
      <div className="hidden md:flex h-full">{panel}</div>
      {/* mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <div className="absolute inset-y-0 left-0 animate-slide-up">{panel}</div>
        </div>
      )}
    </>
  )
}
