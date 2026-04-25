import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { buildSystemPrompt, callAI } from '../lib/ai.js'
import { applyAgentActions, buildAgentSystemPrompt, classifyAssistantIntent } from '../lib/agent.js'
import { Icon } from './Icons.jsx'
import Markdown from './Markdown.jsx'

const STARTERS = [
  { label: 'Plan my week', prompt: 'Build a 7-day study plan based on my upcoming assignments. Reserve time for revision and breaks.' },
  { label: 'Summarize my pinned notes', prompt: 'Summarize the key ideas from my pinned notes. Use bullet points.' },
  { label: 'Quiz me', prompt: 'Create a quick 5-question quiz for my weakest subject based on recent topics.' },
  { label: 'Explain a concept', prompt: 'Explain [topic] clearly with an example and a quick understanding check.' },
]

export default function AIAssistant({ floating = true }) {
  const { state, aiPanel, closeAI, openAI, add, update, dispatch, showToast } = useApp()
  const [chatId, setChatId] = useState(state.chats[0]?.id)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const scrollRef = useRef(null)

  const chat = state.chats.find((c) => c.id === chatId) || state.chats[0]
  const messages = chat?.messages || []

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length, aiPanel.open])

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

  const send = async (text) => {
    const content = (text ?? input).trim()
    if (!content || busy) return
    setErr('')
    const newMsgs = [...messages, { role: 'user', content, at: Date.now() }]
    const title = chat.title === 'New chat' ? content.slice(0, 40) : chat.title
    update('chats', { id: chat.id, messages: newMsgs, title })
    setInput('')
    setBusy(true)
    try {
      let reply
      if (classifyAssistantIntent(content) === 'action') {
        const canUseServerKey = state.settings.useServerProxy !== false && !['localhost', '127.0.0.1'].includes(window.location.hostname)
        if (!state.settings.aiKey && state.settings.aiProvider !== 'mock' && !canUseServerKey) {
          reply = 'I can change your planner, but first add your OpenRouter key in Settings -> AI or set OPENROUTER_API_KEY in Netlify.'
        } else {
          const plan = await callAI({
            settings: state.settings,
            system: buildAgentSystemPrompt(state),
            json: true,
            messages: [{ role: 'user', content }],
          })
          const applied = applyAgentActions({ actions: plan?.actions || [], state, dispatch })
          reply = plan?.reply || (applied.length ? `Done: ${applied.join(', ')}.` : 'I did not make changes because that did not look like a concrete app action.')
          if (applied.length) showToast(`AI ${applied[0]}`, 'success')
        }
      } else {
        reply = await callAI({
          settings: state.settings,
          system: buildSystemPrompt(state, contextNote),
          messages: newMsgs.map(({ role, content }) => ({ role, content })),
        })
      }
      update('chats', { id: chat.id, messages: [...newMsgs, { role: 'assistant', content: reply, at: Date.now() }] })
    } catch (e) {
      setErr(e.message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
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
        {messages.length === 0 && (
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
