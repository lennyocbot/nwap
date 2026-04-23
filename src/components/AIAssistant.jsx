import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { buildSystemPrompt, callAI } from '../lib/ai.js'
import { Icon } from './Icons.jsx'
import Markdown from './Markdown.jsx'

const STARTERS = [
  { label: 'Plan my week', prompt: 'Build a 7-day study plan based on my upcoming assignments. Reserve time for revision and breaks.' },
  { label: 'Summarize my pinned notes', prompt: 'Summarize the key ideas from my pinned notes. Use bullet points.' },
  { label: 'Quiz me', prompt: 'Create a quick 5-question quiz for my weakest subject based on recent topics.' },
  { label: 'Explain a concept', prompt: 'Explain [topic] clearly with an example and a quick understanding check.' },
]

// Maps an action to a human-readable description for the action card.
function describeAction(tool, input, subjects, assignments) {
  const subjectName = (id) => subjects.find((s) => s.id === id)?.name || id
  switch (tool) {
    case 'create_assignment': {
      const due = input.due ? new Date(input.due).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'
      const subj = input.subjectId ? ` · ${subjectName(input.subjectId)}` : ''
      const pri = input.priority ? ` · ${input.priority} priority` : ''
      return { verb: 'Create assignment', detail: `"${input.title}"  —  due ${due}${subj}${pri}` }
    }
    case 'mark_assignment_done': {
      const a = assignments?.find((x) => x.id === input.id)
      return { verb: 'Mark as done', detail: a ? `"${a.title}"` : `ID: ${input.id}` }
    }
    case 'create_event': {
      const date = input.startDate ? new Date(input.startDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'
      return { verb: 'Add calendar event', detail: `"${input.title}"  —  ${date}` }
    }
    case 'add_goal': {
      const deadline = input.deadline ? ` · by ${new Date(input.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''
      const subj = input.subjectId ? ` · ${subjectName(input.subjectId)}` : ''
      return { verb: 'Add goal', detail: `"${input.title}"${subj}${deadline}` }
    }
    case 'create_note':
      return { verb: 'Create note', detail: `"${input.title}"${input.subjectId ? ` · ${subjectName(input.subjectId)}` : ''}` }
    default:
      return { verb: tool, detail: JSON.stringify(input) }
  }
}

export default function AIAssistant({ floating = true }) {
  const { state, aiPanel, closeAI, openAI, add, update, showToast } = useApp()
  const [chatId, setChatId] = useState(state.chats[0]?.id)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [pendingAction, setPendingAction] = useState(null)
  const scrollRef = useRef(null)

  const chat = state.chats.find((c) => c.id === chatId) || state.chats[0]
  const messages = chat?.messages || []

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length, aiPanel.open, pendingAction])

  const contextNote = useMemo(() => {
    const c = aiPanel.context
    if (!c) return null
    if (c.type === 'note') {
      const n = state.notes.find((x) => x.id === c.id)
      return n ? `The student is currently viewing a note titled "${n.title}":\n\n${n.content}` : null
    }
    if (c.type === 'assignment') {
      const a = state.assignments.find((x) => x.id === c.id)
      return a ? `The student wants help with an assignment titled "${a.title}" due ${new Date(a.due).toLocaleString()}. Notes: ${a.notes || 'none'}` : null
    }
    return null
  }, [aiPanel.context, state.notes, state.assignments])

  const newChat = () => {
    const c = add('chats', { title: 'New chat', messages: [], createdAt: Date.now() })
    setChatId(c.id)
  }

  const addMsg = (msgs, role, content) => {
    const updated = [...msgs, { role, content, at: Date.now() }]
    update('chats', { id: chat.id, messages: updated })
    return updated
  }

  const send = async (text) => {
    const content = (text ?? input).trim()
    if (!content || busy) return
    setErr('')
    setPendingAction(null)
    const newMsgs = [...messages, { role: 'user', content, at: Date.now() }]
    const title = chat.title === 'New chat' ? content.slice(0, 40) : chat.title
    update('chats', { id: chat.id, messages: newMsgs, title })
    setInput('')
    setBusy(true)
    try {
      const reply = await callAI({
        settings: state.settings,
        system: buildSystemPrompt(state, contextNote, { withActions: true }),
        messages: newMsgs.map(({ role, content }) => ({ role, content })),
      })
      if (reply?._action) {
        setPendingAction({ ...reply, messagesSnapshot: newMsgs })
      } else {
        addMsg(newMsgs, 'assistant', reply)
      }
    } catch (e) {
      setErr(e.message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const applyAction = () => {
    if (!pendingAction) return
    const { tool, input: inp } = pendingAction
    try {
      switch (tool) {
        case 'create_assignment':
          add('assignments', {
            title: inp.title,
            subjectId: inp.subjectId || null,
            due: inp.due,
            priority: inp.priority || 'medium',
            status: 'todo',
            estMinutes: inp.estMinutes || 60,
            notes: inp.notes || '',
          })
          break
        case 'mark_assignment_done':
          update('assignments', { id: inp.id, status: 'done' })
          break
        case 'create_event':
          add('events', {
            title: inp.title,
            startDate: inp.startDate,
            endDate: inp.startDate,
            description: inp.description || '',
          })
          break
        case 'add_goal':
          add('goals', {
            title: inp.title,
            subjectId: inp.subjectId || null,
            deadline: inp.deadline || null,
            milestones: [],
          })
          break
        case 'create_note':
          add('notes', {
            title: inp.title,
            content: inp.content || '',
            subjectId: inp.subjectId || null,
            tags: [],
            pinned: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
          break
        default:
          showToast(`Unknown action: ${tool}`, 'error')
          return
      }
      addMsg(pendingAction.messagesSnapshot, 'assistant', '✓ Done — I\'ve saved that to your app.')
      showToast('Action applied', 'success')
    } catch (e) {
      showToast(e.message || 'Failed to apply action', 'error')
    } finally {
      setPendingAction(null)
    }
  }

  const dismissAction = () => {
    if (!pendingAction) return
    addMsg(pendingAction.messagesSnapshot, 'assistant', 'No problem — I\'ll leave that. Let me know if you need anything else.')
    setPendingAction(null)
  }

  const body = (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center px-5 py-4 border-b border-ink-100 dark:border-ink-800 gap-2">
        <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center text-white">
          <Icon.sparkle className="w-4 h-4" />
        </div>
        <div className="font-display font-semibold">ScholarAI</div>
        <span className="chip">{state.settings.aiKey ? state.settings.aiProvider : 'demo mode'}</span>
        <div className="flex-1" />
        <select
          className="input !py-1.5 max-w-[180px]"
          value={chat?.id}
          onChange={(e) => setChatId(e.target.value)}
        >
          {state.chats.slice().sort((a, b) => b.createdAt - a.createdAt).map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
        <button className="btn-ghost" onClick={newChat} title="New chat"><Icon.plus className="w-4 h-4" /></button>
        {floating && <button className="btn-ghost" onClick={closeAI} title="Close"><Icon.x className="w-4 h-4" /></button>}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 && !pendingAction && (
          <div>
            <div className="text-sm text-ink-500 mb-3">Try a starter</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STARTERS.map((s) => (
                <button key={s.label} onClick={() => send(s.prompt)} className="card p-4 text-left hover:border-brand-300 transition">
                  <div className="font-medium text-ink-900 dark:text-ink-50">{s.label}</div>
                  <div className="text-xs text-ink-500 mt-1 line-clamp-2">{s.prompt}</div>
                </button>
              ))}
            </div>
            {aiPanel.context && (
              <div className="mt-4 chip"><Icon.link className="w-3 h-3" /> Context attached: {aiPanel.context.type}</div>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role === 'assistant' && (
              <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center text-white shrink-0">
                <Icon.sparkle className="w-4 h-4" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-3xl px-4 py-3 text-sm
              ${m.role === 'user'
                ? 'bg-brand-600 text-white rounded-br-md'
                : 'bg-ink-100 dark:bg-ink-800 text-ink-900 dark:text-ink-50 rounded-bl-md'}`}>
              {m.role === 'assistant' ? <Markdown text={m.content} /> : <div className="whitespace-pre-wrap">{m.content}</div>}
            </div>
          </div>
        ))}
        {busy && <div className="text-sm text-ink-500 animate-pulse-soft">Thinking…</div>}
        {err && <div className="text-sm text-accent-rose">{err}</div>}

        {pendingAction && (() => {
          const { verb, detail } = describeAction(pendingAction.tool, pendingAction.input, state.subjects, state.assignments)
          return (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center text-white shrink-0">
                <Icon.sparkle className="w-4 h-4" />
              </div>
              <div className="flex-1 card border-brand-300 dark:border-brand-700 p-4 rounded-3xl rounded-bl-md">
                <div className="text-xs font-semibold text-brand-600 dark:text-brand-400 mb-1 uppercase tracking-wide">ScholarAI wants to:</div>
                <div className="font-medium text-ink-900 dark:text-ink-50 text-sm">{verb}</div>
                <div className="text-xs text-ink-500 mt-0.5 mb-3">{detail}</div>
                <div className="flex gap-2">
                  <button className="btn-primary text-xs py-1.5 px-4" onClick={applyAction}>
                    <Icon.check className="w-3.5 h-3.5" /> Apply
                  </button>
                  <button className="btn-ghost text-xs py-1.5 px-4" onClick={dismissAction}>
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      <div className="p-4 border-t border-ink-100 dark:border-ink-800">
        <div className="flex items-end gap-2">
          <textarea
            className="input min-h-[48px] max-h-40 resize-none"
            placeholder="Ask anything — plan, explain, quiz, summarize…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            }}
            rows={1}
          />
          <button className="btn-primary" onClick={() => send()} disabled={busy || !input.trim()}>
            <Icon.send className="w-4 h-4" />
          </button>
        </div>
        {!state.settings.aiKey && (
          <div className="text-xs text-ink-500 mt-2">
            Running in offline demo. Add your Anthropic or OpenAI key in Settings → AI for real replies.
          </div>
        )}
      </div>
    </div>
  )

  if (!floating) return body

  return (
    <>
      {!aiPanel.open && (
        <button
          onClick={() => openAI()}
          className="fixed z-30 bottom-5 right-5 w-14 h-14 rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-white shadow-pop flex items-center justify-center"
          aria-label="Ask AI"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
        >
          <Icon.sparkle className="w-6 h-6" />
        </button>
      )}
      {aiPanel.open && (
        <div className="fixed inset-0 z-40 flex items-stretch md:items-center md:justify-end md:p-6 animate-fade-in">
          <div className="absolute inset-0 bg-black/40" onClick={closeAI} />
          <div className="relative w-full md:w-[520px] h-full md:h-[80vh] card rounded-b-none md:rounded-3xl animate-slide-up flex flex-col min-h-0">
            {body}
          </div>
        </div>
      )}
    </>
  )
}
