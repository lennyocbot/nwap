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
  const { route, toast, state } = useApp()
  const [drawer, setDrawer] = useState(false)
  const View = views[route.name] || Dashboard

  return (
    <div className="h-full flex flex-col md:flex-row bg-ink-50 text-ink-900 dark:bg-ink-950 dark:text-ink-50">
      <Sidebar open={drawer} onClose={() => setDrawer(false)} />
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <TopBar onMenu={() => setDrawer(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 pb-32">
            <View />
          </div>
        </main>
      </div>
      <ReminderWatcher />
      <AIAssistant floating />
      <CommandPalette />
      {!state.settings.onboardingComplete && <Onboarding />}
      {toast && (
        <div className="fixed z-50 bottom-6 left-1/2 -translate-x-1/2 card px-4 py-3 text-sm shadow-pop flex items-center gap-2 animate-slide-up">
          {toast.kind === 'success' && <Icon.check className="w-4 h-4 text-emerald-500" />}
          {toast.kind === 'error' && <Icon.x className="w-4 h-4 text-rose-500" />}
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  )
}
