import { useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext.jsx'

export default function ReminderWatcher() {
  const { state } = useApp()
  const sentRef = useRef(new Set())

  useEffect(() => {
    if (!state.settings.notifications) return
    if (!('Notification' in window) || Notification.permission !== 'granted') return

    const now = Date.now()
    state.assignments
      .filter((assignment) => assignment.status !== 'done')
      .forEach((assignment) => {
        const due = new Date(assignment.due).getTime()
        const hours = (due - now) / 3600000
        if (hours > 0 && hours <= 24) {
          notifyOnce(`assignment:${assignment.id}`, 'Assignment due soon', `${assignment.title} is due in ${Math.ceil(hours)}h.`)
        }
      })

    const dueCards = state.flashcards.filter((card) => card.due <= now).length
    if (dueCards > 0) notifyOnce(`cards:${new Date().toISOString().slice(0, 10)}`, 'Flashcards due', `${dueCards} card${dueCards === 1 ? '' : 's'} ready for review.`)
  }, [state.assignments, state.flashcards, state.settings.notifications])

  const notifyOnce = (key, title, body) => {
    if (sentRef.current.has(key)) return
    sentRef.current.add(key)
    try {
      new Notification(title, { body, icon: '/icons/icon-192.svg' })
    } catch {}
  }

  return null
}
