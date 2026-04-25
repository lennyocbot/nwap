import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import { cx, todayISO } from '../lib/utils.js'
import { callAI, buildSystemPrompt } from '../lib/ai.js'
import { normalizeAIText } from '../lib/text.js'
import Markdown from '../components/Markdown.jsx'

const moods = [
  { key: 1, emoji: '😔', label: 'Low' },
  { key: 2, emoji: '😕', label: 'Meh' },
  { key: 3, emoji: '😐', label: 'Okay' },
  { key: 4, emoji: '🙂', label: 'Good' },
  { key: 5, emoji: '😄', label: 'Great' },
]

export default function Journal() {
  const { state, add, update, remove, showToast, route } = useApp()
  const today = todayISO()
  const [date, setDate] = useState(today)
  const [weekly, setWeekly] = useState(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const saveTimer = useRef(null)

  const entry = state.journal.find((j) => j.date === date)
  const ensureEntry = () => entry || add('journal', { date, mood: 3, content: '', gratitude: '', tomorrow: '' })
  const patch = (p) => {
    const e = ensureEntry()
    update('journal', { id: e.id, ...p })
    setSaving(true)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSaving(false)
      setSavedAt(new Date())
    }, 300)
  }

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  useEffect(() => {
    if (route.params?.date) setDate(route.params.date)
  }, [route.params?.date])

  const list = useMemo(() => state.journal.slice().sort((a, b) => b.date.localeCompare(a.date)), [state.journal])

  const runWeeklyReview = async () => {
    setBusy(true); setWeekly(null)
    try {
      const last7 = list.filter((j) => (new Date(today) - new Date(j.date)) <= 7 * 86400000)
      const studyMins = state.studySessions.filter((s) => (new Date(today) - new Date(s.date)) <= 7 * 86400000).reduce((a, b) => a + b.minutes, 0)
      const done = state.assignments.filter((a) => a.status === 'done').length
      const text = await callAI({
        settings: state.settings,
        system: buildSystemPrompt(state, 'Producing a supportive weekly review.'),
        messages: [{
          role: 'user',
          content: `Write a warm, specific weekly review based on this data. Call out 2 wins, 1 area to improve, and 3 focused tasks for next week.\n\nJournal entries:\n${last7.map((j) => `- ${j.date} (mood ${j.mood}): ${j.content}`).join('\n') || 'none'}\nStudy time last 7 days: ${studyMins}m. Assignments done: ${done}.`
        }],
      })
      setWeekly(normalizeAIText(text))
    } catch (e) { showToast(e.message || 'AI error', 'error') } finally { setBusy(false) }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
      <div className="card p-3">
        <div className="flex items-center justify-between px-1 mb-2">
          <div className="font-display font-semibold">Entries</div>
          <input type="date" className="input !py-1.5 max-w-[150px]" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <ul className="space-y-1 max-h-[60vh] overflow-y-auto">
          {list.map((j) => (
            <li key={j.id}>
              <button onClick={() => setDate(j.date)}
                className={cx('w-full text-left p-3 rounded-2xl flex items-center gap-2',
                  j.date === date ? 'bg-brand-50 dark:bg-brand-900/30' : 'hover:bg-ink-50 dark:hover:bg-ink-800')}>
                <span className="text-xl">{moods.find((m) => m.key === j.mood)?.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{new Date(j.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                  <div className="text-xs text-ink-500 line-clamp-1">{j.content || '-'}</div>
                </div>
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="text-center text-sm text-ink-500 py-6">No entries yet</li>}
        </ul>
      </div>

      <div className="card p-5 space-y-4">
        <div className="flex items-center">
          <div className="font-display font-semibold text-lg">
            {new Date(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <div className="flex-1" />
          <div className="text-xs text-ink-500 mr-2">
            {saving ? 'Saving...' : savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Autosaves'}
          </div>
          <button className="btn-soft" onClick={runWeeklyReview} disabled={busy}><Icon.sparkle className="w-4 h-4" /> Weekly AI review</button>
        </div>

        <div>
          <div className="text-xs text-ink-500 mb-1">Mood</div>
          <div className="flex gap-2">
            {moods.map((m) => (
              <button key={m.key} onClick={() => patch({ mood: m.key })}
                className={cx('flex-1 p-3 rounded-2xl text-center transition',
                  (entry?.mood || 3) === m.key ? 'bg-brand-50 dark:bg-brand-900/40 ring-2 ring-brand-400' : 'bg-ink-50 dark:bg-ink-800')}>
                <div className="text-2xl">{m.emoji}</div>
                <div className="text-[10px] text-ink-500">{m.label}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs text-ink-500 mb-1">How was today?</div>
          <textarea className="input min-h-[140px]" value={entry?.content || ''} onChange={(e) => patch({ content: e.target.value })}
            placeholder="Write freely - the AI weekly review will look back on this." />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-ink-500 mb-1">Grateful for</div>
            <textarea className="input min-h-[80px]" value={entry?.gratitude || ''} onChange={(e) => patch({ gratitude: e.target.value })} />
          </div>
          <div>
            <div className="text-xs text-ink-500 mb-1">Tomorrow's focus</div>
            <textarea className="input min-h-[80px]" value={entry?.tomorrow || ''} onChange={(e) => patch({ tomorrow: e.target.value })} />
          </div>
        </div>

        {entry && (
          <div className="flex justify-end">
            <button className="btn-ghost text-rose-600" onClick={() => remove('journal', entry.id)}><Icon.trash className="w-4 h-4" /> Delete entry</button>
          </div>
        )}

        {busy && <div className="text-sm text-ink-500 animate-pulse-soft">Reflecting on your week...</div>}
        {weekly && (
          <div className="p-4 rounded-2xl bg-ink-50 dark:bg-ink-800">
            <div className="font-display font-semibold mb-2">Weekly review</div>
            <Markdown text={weekly} />
          </div>
        )}
      </div>
    </div>
  )
}
