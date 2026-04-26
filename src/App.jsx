import { useState } from 'react'
import { useApp } from './context/AppContext.jsx'
import Sidebar from './components/Sidebar.jsx'
import TopBar from './components/TopBar.jsx'
import AIAssistant from './components/AIAssistant.jsx'
import CommandPalette from './components/CommandPalette.jsx'
import ReminderWatcher from './components/ReminderWatcher.jsx'
import Onboarding from './components/Onboarding.jsx'
import Dashboard from './views/Dashboard.jsx'
import Notes from './views/Notes.jsx'
import Assignments from './views/Assignments.jsx'
import Timetable from './views/Timetable.jsx'
import Calendar from './views/Calendar.jsx'
import Study from './views/Study.jsx'
import Revision from './views/Revision.jsx'
import Subjects from './views/Subjects.jsx'
import Grades from './views/Grades.jsx'
import Goals from './views/Goals.jsx'
import Habits from './views/Habits.jsx'
import Files from './views/Files.jsx'
import Reading from './views/Reading.jsx'
import Journal from './views/Journal.jsx'
import MindMap from './views/MindMap.jsx'
import Settings from './views/Settings.jsx'
import AIChat from './views/AIChat.jsx'
import Account from './views/Account.jsx'
import ExamSimulator from './views/ExamSimulator.jsx'
import { Icon } from './components/Icons.jsx'

const views = {
  dashboard: Dashboard,
  ai: AIChat,
  notes: Notes,
  assignments: Assignments,
  timetable: Timetable,
  calendar: Calendar,
  study: Study,
  revision: Revision,
  exams: ExamSimulator,
  subjects: Subjects,
  grades: Grades,
  goals: Goals,
  habits: Habits,
  files: Files,
  reading: Reading,
  journal: Journal,
  mindmap: MindMap,
  settings: Settings,
  account: Account,
}

export default function App() {
  const { route, toast, state, navigate, openAI } = useApp()
  const [drawer, setDrawer] = useState(false)
  const View = views[route.name] || Dashboard

  return (
    <div className="app-liquid-bg h-full flex flex-col md:flex-row text-ink-900 dark:text-ink-50">
      <LiquidGlassFilter />
      <LiquidBackdrop />
      <Sidebar open={drawer} onClose={() => setDrawer(false)} />
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <TopBar onMenu={() => setDrawer(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-8 py-4 md:py-6 pb-36 md:pb-32 animate-rise-in">
            <View />
          </div>
        </main>
      </div>
      <MobileBottomNav route={route} navigate={navigate} openAI={openAI} />
      <ReminderWatcher />
      <AIAssistant floating />
      <CommandPalette />
      {!state.settings.onboardingComplete && <Onboarding />}
      {toast && (
        <div className="liquid-glass fixed z-50 bottom-6 left-1/2 -translate-x-1/2 rounded-3xl px-4 py-3 text-sm shadow-pop flex items-center gap-2 animate-slide-up">
          {toast.kind === 'success' && <Icon.check className="w-4 h-4 text-emerald-500" />}
          {toast.kind === 'error' && <Icon.x className="w-4 h-4 text-rose-500" />}
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  )
}

function LiquidBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="liquid-orb liquid-orb-a" />
      <div className="liquid-orb liquid-orb-b" />
      <div className="liquid-orb liquid-orb-c" />
      <div className="liquid-streak liquid-streak-a" />
      <div className="liquid-streak liquid-streak-b" />
      <div className="liquid-streak liquid-streak-c" />
      <div className="liquid-spec liquid-spec-a" />
      <div className="liquid-spec liquid-spec-b" />
      <div className="liquid-spec liquid-spec-c" />
    </div>
  )
}

function LiquidGlassFilter() {
  return (
    <svg aria-hidden="true" className="pointer-events-none fixed h-0 w-0">
      <filter id="syllabi-liquid-glass" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.018 0.028" numOctaves="2" seed="7" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="1.2" result="softNoise" />
        <feDisplacementMap in="SourceGraphic" in2="softNoise" scale="18" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  )
}

function MobileBottomNav({ route, navigate, openAI }) {
  const items = [
    { id: 'dashboard', label: 'Home', icon: 'home' },
    { id: 'notes', label: 'Notes', icon: 'note' },
    { id: 'assignments', label: 'Tasks', icon: 'task' },
    { id: 'revision', label: 'Revise', icon: 'cards' },
  ]
  return (
    <nav className="liquid-glass-strong fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 gap-1 rounded-[28px] p-2 md:hidden" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}>
      {items.map((item) => {
        const Ic = Icon[item.icon]
        const active = route.name === item.id
        return (
          <button key={item.id} className={`rounded-2xl px-2 py-2 text-xs font-semibold ${active ? 'bg-white/80 text-brand-700 shadow-sm' : 'text-ink-500'}`} onClick={() => navigate(item.id)} type="button">
            <Ic className="mx-auto mb-1 h-4 w-4" />
            {item.label}
          </button>
        )
      })}
      <button className="rounded-2xl bg-brand-600 px-2 py-2 text-xs font-semibold text-white shadow-pop" onClick={() => openAI()} type="button">
        <Icon.sparkle className="mx-auto mb-1 h-4 w-4" />
        Chat
      </button>
    </nav>
  )
}
