import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import Markdown from '../components/Markdown.jsx'
import { buildSystemPrompt, callAI } from '../lib/ai.js'
import { normalizeAIText } from '../lib/text.js'
import { uid } from '../lib/utils.js'

const paperTypes = {
  short: { label: 'Short practice', minutes: 20, questions: 4 },
  half: { label: 'Half paper', minutes: 45, questions: 7 },
  full: { label: 'Full paper', minutes: 90, questions: 12 },
}

export default function ExamSimulator() {
  const { state, add, update, showToast } = useApp()
  const [subjectId, setSubjectId] = useState(state.subjects[0]?.id || '')
  const [paperType, setPaperType] = useState('short')
  const [attempt, setAttempt] = useState(null)
  const [busy, setBusy] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [logGrade, setLogGrade] = useState(true)

  const subject = state.subjects.find((item) => item.id === subjectId)
  const activeAttempt = attempt || (state.examAttempts || []).find((item) => item.status === 'draft')

  useEffect(() => {
    if (!activeAttempt || activeAttempt.status !== 'draft') return
    const endAt = activeAttempt.endsAt || Date.now() + 1000
    const tick = () => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
      setTimeLeft(left)
      if (left <= 0) {
        submitAttempt(activeAttempt, { timedOut: true })
      }
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [activeAttempt?.id, activeAttempt?.status])

  const generate = async () => {
    if (!subject) return
    setBusy(true)
    try {
      const spec = paperTypes[paperType]
      const data = await callAI({
        settings: state.settings,
        system: buildSystemPrompt(state, `Generating an exam-style ${subject.name} paper.`),
        json: true,
        messages: [{
          role: 'user',
          content: `Create a timed A-level ${subject.name} ${spec.label}. Return JSON only: {"title":"...","questions":[{"id":"q1","prompt":"...","marks":4,"answerGuide":"..."}]}. Use ${spec.questions} mixed exam-style questions. Include calculation, explanation, and evaluation where appropriate.`,
        }],
      })
      const questions = (data?.questions || []).slice(0, spec.questions).map((question, index) => ({
        id: question.id || `q${index + 1}`,
        prompt: normalizeAIText(question.prompt || question.question || `Question ${index + 1}`),
        marks: Number(question.marks) || 4,
        answerGuide: normalizeAIText(question.answerGuide || question.markScheme || ''),
      }))
      const item = {
        id: uid(),
        subjectId,
        paperType,
        title: data?.title || `${subject.name} ${spec.label}`,
        questions,
        answers: {},
        feedback: null,
        score: null,
        status: 'draft',
        createdAt: Date.now(),
        endsAt: Date.now() + spec.minutes * 60 * 1000,
      }
      add('examAttempts', item)
      setAttempt(item)
      showToast('Exam paper generated', 'success')
    } catch (error) {
      showToast(error.message || 'Could not generate paper', 'error')
    } finally {
      setBusy(false)
    }
  }

  const saveAnswer = (questionId, answer) => {
    if (!activeAttempt) return
    const next = { ...activeAttempt, answers: { ...(activeAttempt.answers || {}), [questionId]: answer } }
    update('examAttempts', next)
    setAttempt(next)
  }

  const submitAttempt = async (target = activeAttempt, { timedOut = false } = {}) => {
    if (!target || target.status !== 'draft' || busy) return
    setBusy(true)
    if (timedOut) showToast("Time's up — your answers were submitted.", 'info')
    try {
      const subjectName = state.subjects.find((item) => item.id === target.subjectId)?.name || 'Subject'
      const data = await callAI({
        settings: state.settings,
        system: buildSystemPrompt(state, `Marking an A-level ${subjectName} exam attempt.`),
        json: true,
        messages: [{
          role: 'user',
          content: `Mark this exam attempt. Return JSON only: {"percentage":72,"feedback":"...","questionFeedback":[{"id":"q1","marksAwarded":2,"marksAvailable":4,"feedback":"...","wrong":true,"flashcard":{"front":"...","back":"..."}}]}.\n\nQUESTIONS:\n${JSON.stringify(target.questions)}\n\nANSWERS:\n${JSON.stringify(target.answers || {})}`,
        }],
      })
      const marked = {
        ...target,
        status: 'submitted',
        submittedAt: Date.now(),
        score: Number(data?.percentage) || 0,
        feedback: normalizeAIText(data?.feedback || 'Marked.'),
        questionFeedback: (data?.questionFeedback || []).map((item) => ({
          ...item,
          feedback: normalizeAIText(item.feedback || ''),
        })),
      }
      update('examAttempts', marked)
      setAttempt(marked)
      createCorrectionCards(marked)
      if (logGrade) {
        add('grades', {
          subjectId: marked.subjectId,
          name: marked.title,
          score: Math.round(marked.score || 0),
          outOf: 100,
          weight: 5,
          date: new Date().toISOString(),
        })
      }
      showToast('Exam marked', 'success')
    } catch (error) {
      showToast(error.message || 'Could not mark exam', 'error')
    } finally {
      setBusy(false)
    }
  }

  const createCorrectionCards = (marked) => {
    const subjectName = state.subjects.find((item) => item.id === marked.subjectId)?.name || 'Subject'
    const existingDeck = state.decks.find((deck) => deck.subjectId === marked.subjectId)
    let deckId = existingDeck?.id
    if (!deckId) {
      const deck = add('decks', { name: `Exam corrections — ${subjectName}`, subjectId: marked.subjectId, color: 'brand' })
      deckId = deck.id
    }
    ;(marked.questionFeedback || [])
      .filter((item) => item.wrong && item.flashcard)
      .slice(0, 12)
      .forEach((item) => add('flashcards', {
        deckId,
        front: normalizeAIText(item.flashcard.front || 'Exam correction'),
        back: normalizeAIText(item.flashcard.back || item.feedback || ''),
        ease: 2.5,
        interval: 1,
        due: Date.now(),
        reviews: 0,
      }))
  }

  const attempts = useMemo(() => (state.examAttempts || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [state.examAttempts])

  if (activeAttempt?.status === 'draft') {
    return (
      <div className="space-y-4">
        <div className="card p-4 sticky top-0 z-10 flex flex-wrap items-center gap-3">
          <div>
            <div className="font-display text-xl font-semibold">{activeAttempt.title}</div>
            <div className="text-xs text-ink-500">Draft autosaves as you type. No hints during exam mode.</div>
          </div>
          <div className="flex-1" />
          <div className="chip text-base font-semibold">{formatTime(timeLeft)}</div>
          <button className="btn-primary" onClick={() => submitAttempt(activeAttempt)} disabled={busy}>Submit</button>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {activeAttempt.questions.map((question, index) => (
            <div key={question.id} className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="chip">Q{index + 1}</span>
                <span className="text-xs text-ink-500">{question.marks} marks</span>
              </div>
              <Markdown text={question.prompt} />
              <textarea
                className="input min-h-[140px] mt-3"
                value={activeAttempt.answers?.[question.id] || ''}
                onChange={(event) => saveAnswer(question.id, event.target.value)}
                placeholder="Write your answer..."
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-brand-600 text-white flex items-center justify-center"><Icon.grade className="w-5 h-5" /></div>
          <div>
            <h2 className="font-display text-2xl font-bold">Exam Simulator</h2>
            <p className="text-sm text-ink-500 mt-1">Generate a timed paper, submit your answers, and turn mistakes into revision cards.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <select className="input" value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
            {state.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select className="input" value={paperType} onChange={(event) => setPaperType(event.target.value)}>
            {Object.entries(paperTypes).map(([key, item]) => <option key={key} value={key}>{item.label} ({item.minutes}m)</option>)}
          </select>
          <button className="btn-primary" onClick={generate} disabled={busy || !subjectId}><Icon.sparkle className="w-4 h-4" /> {busy ? 'Working...' : 'Generate paper'}</button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={logGrade} onChange={(event) => setLogGrade(event.target.checked)} />
          Log marked result to Grades
        </label>
      </section>

      {activeAttempt?.status === 'submitted' && <MarkedAttempt attempt={activeAttempt} />}

      <section className="card p-5">
        <div className="font-display font-semibold mb-3">Recent attempts</div>
        <div className="space-y-2">
          {attempts.map((item) => (
            <button key={item.id} className="w-full rounded-2xl bg-ink-50 p-3 text-left dark:bg-ink-800" onClick={() => setAttempt(item)}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{item.title}</span>
                <span className="chip">{item.status === 'submitted' ? `${Math.round(item.score || 0)}%` : 'draft'}</span>
              </div>
              <div className="text-xs text-ink-500">{new Date(item.createdAt).toLocaleString()}</div>
            </button>
          ))}
          {attempts.length === 0 && <div className="text-sm text-ink-500">No exam attempts yet.</div>}
        </div>
      </section>
    </div>
  )
}

function MarkedAttempt({ attempt }) {
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h3 className="font-display text-xl font-semibold mr-auto">{attempt.title}</h3>
        <span className="chip text-base font-semibold">{Math.round(attempt.score || 0)}%</span>
      </div>
      <Markdown text={attempt.feedback || ''} />
      <div className="mt-4 space-y-2">
        {(attempt.questionFeedback || []).map((item, index) => (
          <div key={item.id || index} className="rounded-2xl bg-ink-50 p-3 dark:bg-ink-800">
            <div className="font-medium">Question {index + 1}: {item.marksAwarded ?? '-'} / {item.marksAvailable ?? '-'}</div>
            <Markdown text={item.feedback || ''} className="prose-compact" />
          </div>
        ))}
      </div>
    </section>
  )
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${String(secs).padStart(2, '0')}`
}
