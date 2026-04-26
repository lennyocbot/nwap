import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { buildSystemPrompt, callAI } from '../lib/ai.js'
import { applyAgentActions, buildAgentSystemPrompt, classifyAssistantIntent } from '../lib/agent.js'
import { markdownFromQuiz, normalizeAIText } from '../lib/text.js'
import { Icon } from './Icons.jsx'
import Markdown from './Markdown.jsx'

const STARTERS = [
  { label: 'Plan my week', prompt: 'Build a 7-day study plan based on my upcoming assignments. Reserve time for revision and breaks.' },
  { label: 'Summarize my pinned notes', prompt: 'Summarize the key ideas from my pinned notes. Use bullet points.' },
  { label: 'Quiz me', prompt: 'Create a quick 5-question quiz for my weakest subject based on recent topics.' },
  { label: 'Explain a concept', prompt: 'Explain [topic] clearly with an example and a quick understanding check.' },
]

export default function AIAssistant({ floating = true }) {
  const { state, aiPanel, closeAI, openAI, clearAIPrompt, add, update, remove, dispatch, showToast } = useApp()
  const [chatId, setChatId] = useState(state.chats[0]?.id)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [err, setErr] = useState('')
  const [conversationOpen, setConversationOpen] = useState(false)
  const scrollRef = useRef(null)
  const busyRef = useRef(false)
  const handledPromptRef = useRef(null)

  const chat = state.chats.find((c) => c.id === chatId) || state.chats[0] || null
  const messages = chat?.messages || []

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length, aiPanel.open])

  useEffect(() => {
    if (!busy) {
      setElapsed(0)
      return
    }
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [busy])

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

  const createChat = (title = 'New chat') => {
    const c = add('chats', { title, messages: [], createdAt: Date.now() })
    setChatId(c.id)
    return c
  }

  const newChat = () => createChat()

  const renameChat = () => {
    if (!chat) return
    const title = window.prompt('Conversation name', chat.title || 'New chat')
    if (title?.trim()) update('chats', { id: chat.id, title: title.trim().slice(0, 80) })
  }

  const deleteChat = () => {
    if (!chat) return
    if (state.chats.length <= 1) {
      update('chats', { id: chat.id, title: 'New chat', messages: [], createdAt: Date.now() })
      return
    }
    remove('chats', chat.id)
    setChatId(state.chats.find((c) => c.id !== chat.id)?.id || null)
  }

  const send = async (text, targetChat = chat) => {
    const content = (text ?? input).trim()
    if (!content || !targetChat || busyRef.current) return
    busyRef.current = true
    setErr('')

    const baseMessages = targetChat.messages || []
    const newMsgs = [...baseMessages, { role: 'user', content, at: Date.now() }]
    update('chats', { id: targetChat.id, messages: newMsgs })
    setInput('')
    setBusy(true)

    try {
      let reply
      let quizPayload = null
      const canUseServerKey = state.settings.useServerProxy !== false && !['localhost', '127.0.0.1'].includes(window.location.hostname)
      const hasUsableAI = state.settings.aiProvider === 'mock' || state.settings.aiKey || canUseServerKey

      if (hasUsableAI) {
        const plan = await callAI({
          settings: state.settings,
          system: buildAgentSystemPrompt(state, contextNote),
          json: true,
          messages: newMsgs.map(({ role, content }) => ({ role, content })),
        })
        const actions = Array.isArray(plan?.actions) ? plan.actions : []
        const quiz = quizFromActions(actions) || quizFromPlan(plan)
        quizPayload = quiz
        const appActions = actions.filter((action) => action.type !== 'present_quiz')
        const applied = applyAgentActions({ actions: appActions, state, dispatch })

        if (applied.length) {
          reply = `Done: ${applied.join(', ')}.`
          if (plan?.reply && !/added|created|updated|moved|deleted/i.test(plan.reply)) reply += `\n\n${plan.reply}`
          applied.forEach((item, index) => {
            setTimeout(() => showToast(`AI ${item}`, 'success'), index * 350)
          })
        }

        if (quiz) {
          reply = reply
            ? `${reply}\n\n${plan?.reply || 'I made an interactive quiz for you.'}`
            : (plan?.reply || 'Here is a quick interactive quiz.')
        } else if (!applied.length && plan?.handoffToChat && classifyAssistantIntent(content) === 'chat') {
          reply = await callAI({
            settings: state.settings,
            system: buildSystemPrompt(state, contextNote),
            messages: newMsgs.map(({ role, content }) => ({ role, content })),
          })
        } else if (!applied.length) {
          reply = plan?.reply || 'I need one more detail before I can use a tool to change the app.'
        }
      } else if (classifyAssistantIntent(content) === 'action') {
        reply = 'I can use tools to change your planner, but first paste your OpenRouter key in Settings, AI.'
      } else {
        reply = await callAI({
          settings: state.settings,
          system: buildSystemPrompt(state, contextNote),
          messages: newMsgs.map(({ role, content }) => ({ role, content })),
        })
      }
      reply = normalizeAIText(reply || '')

      update('chats', {
        id: targetChat.id,
        messages: [...newMsgs, { role: 'assistant', content: reply, quiz: quizPayload || undefined, at: Date.now() }],
        title: makeChatTitle(targetChat.title, content, reply),
      })
    } catch (e) {
      setErr(e.message || 'Something went wrong')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!aiPanel.open || !aiPanel.initialPrompt || handledPromptRef.current === aiPanel.requestId) return
    handledPromptRef.current = aiPanel.requestId
    const c = createChat('Daily planning')
    const prompt = aiPanel.initialPrompt
    clearAIPrompt?.()
    setTimeout(() => send(prompt, c), 0)
  }, [aiPanel.open, aiPanel.initialPrompt, aiPanel.requestId])

  const body = (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap items-center px-5 py-4 border-b border-ink-100 dark:border-ink-800 gap-2">
        <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 flex items-center justify-center text-white">
          <Icon.sparkle className="w-4 h-4" />
        </div>
        <div className="font-display font-semibold">Syllabi</div>
        <span className="chip">{state.settings.aiKey || state.settings.useServerProxy !== false ? state.settings.aiProvider : 'demo mode'}</span>
        <div className="flex-1 min-w-[12px]" />
        <div className="relative flex items-center gap-2 text-xs text-ink-500 min-w-0">
          <span className="hidden sm:inline">Conversations</span>
          <button
            className="input !py-1.5 max-w-[190px] min-w-[160px] flex items-center justify-between gap-2 text-left"
            onClick={() => setConversationOpen((open) => !open)}
            type="button"
          >
            <span className="truncate">{chat?.title || 'New chat'}</span>
            <Icon.chevron className="w-3.5 h-3.5 rotate-90 shrink-0" />
          </button>
          {conversationOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 max-h-72 overflow-y-auto rounded-2xl border border-ink-200 bg-white p-1 shadow-pop dark:border-ink-700 dark:bg-ink-900 z-50">
              {state.chats.slice().sort((a, b) => b.createdAt - a.createdAt).map((c) => (
                <button
                  key={c.id}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-ink-100 dark:hover:bg-ink-800 ${c.id === chat?.id ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-100' : 'text-ink-700 dark:text-ink-200'}`}
                  onClick={() => {
                    setChatId(c.id)
                    setConversationOpen(false)
                  }}
                  type="button"
                >
                  <div className="truncate font-medium">{c.title || 'New chat'}</div>
                  <div className="text-xs opacity-70">{(c.messages || []).length} messages</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="btn-ghost" onClick={newChat} title="New conversation"><Icon.plus className="w-4 h-4" /></button>
        <button className="btn-ghost" onClick={renameChat} title="Rename conversation"><Icon.note className="w-4 h-4" /></button>
        <button className="btn-ghost text-rose-600" onClick={deleteChat} title="Delete conversation"><Icon.trash className="w-4 h-4" /></button>
        {floating && <button className="btn-ghost" onClick={closeAI} title="Close"><Icon.x className="w-4 h-4" /></button>}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 && (
          <div>
            <div className="text-sm text-ink-500 mb-3">Try a starter</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STARTERS.map((s) => (
                <button key={s.label} onClick={() => send(s.prompt)} disabled={busy} className="card p-4 text-left hover:border-brand-300 transition disabled:opacity-60">
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
              {m.role === 'assistant' && m.quiz && (
                <QuizMessage quiz={m.quiz} add={add} showToast={showToast} />
              )}
            </div>
          </div>
        ))}
        {busy && <div className="text-sm text-ink-500 animate-pulse-soft">Syllabi is thinking... {elapsed}s</div>}
        {err && <div className="text-sm text-accent-rose">{err}</div>}
      </div>

      <div className="p-4 border-t border-ink-100 dark:border-ink-800">
        <div className="flex items-end gap-2">
          <textarea
            className="input min-h-[48px] max-h-40 resize-none"
            placeholder="Ask anything - plan, explain, quiz, summarize..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (!busyRef.current) send()
              }
            }}
            disabled={busy}
            rows={1}
          />
          <button className="btn-primary" onClick={() => send()} disabled={busy || !input.trim()}>
            <Icon.send className="w-4 h-4" />
          </button>
        </div>
        {!state.settings.aiKey && (
          <div className="text-xs text-ink-500 mt-2">
            Paste your OpenRouter key in Settings, AI, to enable Syllabi tools on this device.
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
          <div className="relative w-full md:w-[560px] h-full md:h-[82vh] card rounded-b-none md:rounded-3xl animate-slide-up flex flex-col min-h-0">
            {body}
          </div>
        </div>
      )}
    </>
  )
}

function makeChatTitle(current, userText, assistantText) {
  if (current && !['New chat', 'Daily planning'].includes(current)) return current
  if (current === 'Daily planning') return current
  const cleanedUser = userText.replace(/\s+/g, ' ').trim()
  if (/^(hi|hello|hey|yo|sup)[!?.\s]*$/i.test(cleanedUser)) return 'Quick chat'
  const source = cleanedUser || String(assistantText || '').replace(/\s+/g, ' ').trim()
  return source.length > 52 ? `${source.slice(0, 49)}...` : source || 'New chat'
}

function quizFromActions(actions) {
  const action = actions.find((item) => item?.type === 'present_quiz')
  const payload = action?.payload
  return quizFromPayload(payload)
}

function quizFromPlan(plan) {
  return quizFromPayload(plan?.questions ? { title: plan.title || 'Quick quiz', questions: plan.questions } : null)
}

function quizFromPayload(payload) {
  if (!payload || !Array.isArray(payload.questions) || payload.questions.length === 0) return null

  return {
    title: normalizeAIText(payload.title || 'Quick quiz'),
    questions: payload.questions.slice(0, 10).map((question) => ({
      q: normalizeAIText(question.q || question.question || 'Question'),
      choices: Array.isArray(question.choices) ? question.choices.slice(0, 6).map(normalizeAIText) : [],
      answer: typeof question.answer === 'number' ? question.answer : normalizeAIText(question.answer || question.correctAnswer || ''),
      explain: normalizeAIText(question.explain || question.explanation || ''),
    })),
  }
}

function QuizMessage({ quiz, add, showToast }) {
  const [answers, setAnswers] = useState({})
  const [revealed, setRevealed] = useState({})
  const [saved, setSaved] = useState(false)
  const questions = Array.isArray(quiz.questions) ? quiz.questions : []
  const answered = questions.filter((_, index) => revealed[index]).length
  const score = questions.reduce((total, question, index) => total + (isCorrect(question, answers[index]) ? 1 : 0), 0)

  const choose = (questionIndex, choiceIndex) => {
    setAnswers((current) => ({ ...current, [questionIndex]: choiceIndex }))
    setRevealed((current) => ({ ...current, [questionIndex]: true }))
  }

  const reveal = (questionIndex) => {
    setRevealed((current) => ({ ...current, [questionIndex]: true }))
  }

  const save = () => {
    const note = add('notes', {
      title: quiz.title || 'AI quiz',
      content: markdownFromQuiz(quiz),
      subjectId: null,
      tags: ['quiz', 'ai'],
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    setSaved(true)
    showToast(`Saved "${note.title}" to Notes`, 'success')
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-2xl bg-white/75 p-3 dark:bg-ink-950/40">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div>
            <div className="font-semibold">{quiz.title || 'Quick quiz'}</div>
            <div className="text-xs text-ink-500">{answered}/{questions.length} answered{answered ? ` - ${score}/${answered} correct` : ''}</div>
          </div>
          <button className="btn-soft text-xs" onClick={save} disabled={saved} type="button">
            <Icon.note className="w-4 h-4" /> {saved ? 'Saved' : 'Save to Notes'}
          </button>
        </div>
        <div className="h-2 rounded-full bg-ink-100 overflow-hidden dark:bg-ink-800">
          <div className="h-full bg-brand-500 transition-all" style={{ width: `${questions.length ? (answered / questions.length) * 100 : 0}%` }} />
        </div>
      </div>

      {questions.map((question, questionIndex) => {
        const shown = revealed[questionIndex]
        const selected = answers[questionIndex]
        return (
          <div key={questionIndex} className="rounded-2xl bg-white/75 p-3 dark:bg-ink-950/40">
            <div className="font-medium">{questionIndex + 1}. {question.q}</div>
            {question.choices?.length ? (
              <div className="mt-2 grid gap-2">
                {question.choices.map((choice, choiceIndex) => {
                  const correct = isCorrect(question, choiceIndex)
                  const chosen = selected === choiceIndex
                  return (
                    <button
                      key={choiceIndex}
                      className={`text-left rounded-xl border px-3 py-2 transition ${shown && correct ? 'border-emerald-400 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100' : shown && chosen ? 'border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-100' : 'border-ink-200 bg-white hover:border-brand-300 dark:border-ink-700 dark:bg-ink-900'}`}
                      onClick={() => choose(questionIndex, choiceIndex)}
                      type="button"
                    >
                      {choice}
                    </button>
                  )
                })}
              </div>
            ) : (
              <button className="btn-soft mt-2" onClick={() => reveal(questionIndex)} type="button">Reveal answer</button>
            )}
            {shown && (
              <div className="mt-2 text-xs text-ink-600 dark:text-ink-300">
                <strong>Answer:</strong> {answerLabel(question)}
                {question.explain && <div className="mt-1">{question.explain}</div>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function isCorrect(question, selected) {
  if (selected === undefined) return false
  if (typeof question.answer === 'number') return selected === question.answer
  return question.choices?.[selected]?.trim().toLowerCase() === String(question.answer).trim().toLowerCase()
}

function answerLabel(question) {
  if (typeof question.answer === 'number') return question.choices?.[question.answer] || `Choice ${question.answer + 1}`
  return question.answer || 'See explanation'
}
