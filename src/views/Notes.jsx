import { useMemo, useState, useEffect } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import Markdown from '../components/Markdown.jsx'
import Modal from '../components/Modal.jsx'
import { cx, colorFor } from '../lib/utils.js'
import { aiSummarizeNote, aiGenerateFlashcards, aiGenerateQuiz, callAI, buildSystemPrompt } from '../lib/ai.js'
import { normalizeAIText } from '../lib/text.js'

const noteTemplates = [
  {
    key: 'cornell',
    label: 'Cornell notes',
    title: 'Cornell notes',
    content: '# Topic\n\n## Cues / Questions\n\n- \n\n## Notes\n\n- \n\n## Summary\n\n',
    tags: ['template', 'cornell'],
  },
  {
    key: 'essay',
    label: 'Essay plan',
    title: 'Essay plan',
    content: '# Essay plan\n\n## Question\n\n\n## Thesis\n\n\n## Argument 1\n\n- Evidence:\n- Evaluation:\n\n## Argument 2\n\n- Evidence:\n- Evaluation:\n\n## Argument 3\n\n- Evidence:\n- Evaluation:\n\n## Conclusion\n\n',
    tags: ['template', 'essay'],
  },
  {
    key: 'lab',
    label: 'Lab report',
    title: 'Lab report',
    content: '# Lab report\n\n## Aim\n\n\n## Hypothesis\n\n\n## Variables\n\n- Independent:\n- Dependent:\n- Control:\n\n## Method\n\n1. \n\n## Results\n\n| Trial | Result |\n| --- | --- |\n| 1 |  |\n\n## Analysis\n\n\n## Conclusion\n\n',
    tags: ['template', 'lab'],
  },
  {
    key: 'lecture',
    label: 'Lesson notes',
    title: 'Lesson notes',
    content: '# Lesson notes\n\n## Key ideas\n\n- \n\n## Examples\n\n\n## Questions to ask\n\n- \n\n## Follow-up tasks\n\n- [ ] \n',
    tags: ['template', 'lesson'],
  },
]

export default function Notes() {
  const { state, add, update, remove, navigate, route, openAI, showToast } = useApp()
  const [selectedId, setSelectedId] = useState(route.params?.id || state.notes[0]?.id || null)
  const [query, setQuery] = useState('')
  const [preview, setPreview] = useState(false)
  const [aiOutput, setAiOutput] = useState(null)
  const [aiBusy, setAiBusy] = useState(false)

  useEffect(() => {
    if (route.params?.id) setSelectedId(route.params.id)
  }, [route.params?.id])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return state.notes
      .slice()
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt)
      .filter((n) => {
        if (!q) return true
        return (n.title + ' ' + n.content + ' ' + (n.tags || []).join(' ')).toLowerCase().includes(q)
      })
      .filter((n) => !route.params?.subject || n.subjectId === route.params.subject)
  }, [state.notes, query, route.params])

  const note = state.notes.find((n) => n.id === selectedId)

  const createNote = () => {
    const n = add('notes', {
      title: 'Untitled', content: '', tags: [],
      subjectId: route.params?.subject || null, pinned: false,
      createdAt: Date.now(), updatedAt: Date.now(),
    })
    setSelectedId(n.id)
  }

  const createFromTemplate = (templateKey) => {
    if (!templateKey) return
    const template = noteTemplates.find((item) => item.key === templateKey)
    if (!template) return
    const n = add('notes', {
      title: template.title,
      content: template.content,
      tags: template.tags,
      subjectId: route.params?.subject || null,
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    setSelectedId(n.id)
    showToast(`Created ${template.label}`, 'success')
  }

  const patch = (p) => update('notes', { id: note.id, ...p, updatedAt: Date.now() })

  const handleContentChange = (content) => {
    const patchData = { content }
    if (!note.title || /^(untitled|quick note)$/i.test(note.title.trim())) {
      const nextTitle = titleFromContent(content)
      if (nextTitle) patchData.title = nextTitle
    }
    patch(patchData)
  }

  const runSummarize = async () => {
    if (!note) return
    setAiBusy(true); setAiOutput(null)
    try {
      const res = await aiSummarizeNote({ settings: state.settings, state, note })
      setAiOutput({ kind: 'markdown', text: normalizeAIText(res) })
    } catch (e) { showToast(e.message || 'AI error', 'error') } finally { setAiBusy(false) }
  }

  const runFlashcards = async () => {
    if (!note) return
    setAiBusy(true); setAiOutput(null)
    try {
      const cards = await aiGenerateFlashcards({ settings: state.settings, state, source: note.content })
      setAiOutput({
        kind: 'cards',
        cards: cards.map((card) => ({ ...card, front: normalizeAIText(card.front), back: normalizeAIText(card.back) })),
      })
    } catch (e) { showToast(e.message || 'AI error', 'error') } finally { setAiBusy(false) }
  }

  const runQuiz = async () => {
    if (!note) return
    setAiBusy(true); setAiOutput(null)
    try {
      const questions = await aiGenerateQuiz({ settings: state.settings, state, source: note.content })
      setAiOutput({
        kind: 'quiz',
        questions: questions.map((question) => ({
          ...question,
          q: normalizeAIText(question.q),
          choices: (question.choices || []).map(normalizeAIText),
          explain: normalizeAIText(question.explain || ''),
        })),
      })
    } catch (e) { showToast(e.message || 'AI error', 'error') } finally { setAiBusy(false) }
  }

  const runRewrite = async () => {
    if (!note) return
    setAiBusy(true)
    try {
      const text = await callAI({
        settings: state.settings,
        system: buildSystemPrompt(state, 'Rewriting a note for clarity.'),
        messages: [{ role: 'user', content: `Rewrite this note to be clearer and better structured with headings and bullet points. Keep facts intact.\n\n${note.content}` }],
      })
      patch({ content: normalizeAIText(text) })
      showToast('Note rewritten', 'success')
    } catch (e) { showToast(e.message || 'AI error', 'error') } finally { setAiBusy(false) }
  }

  const saveCardsToDeck = (cards) => {
    if (!cards?.length) return
    const deckName = `${note.title} - cards`
    const deck = add('decks', { name: deckName, subjectId: note.subjectId || null, color: 'brand' })
    cards.forEach((c) => add('flashcards', {
      deckId: deck.id, front: normalizeAIText(c.front), back: normalizeAIText(c.back),
      ease: 2.5, interval: 1, due: Date.now(), reviews: 0,
    }))
    showToast(`Saved ${cards.length} cards to "${deckName}"`, 'success')
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 min-h-[70vh]">
      {/* List */}
      <div className="card p-3 flex flex-col min-h-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex-1">
            <Icon.search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input className="input pl-9" placeholder="Search notes..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={createNote}><Icon.plus className="w-4 h-4" /></button>
        </div>
        <select className="input mb-2 text-sm" value="" onChange={(e) => createFromTemplate(e.target.value)}>
          <option value="">Create from template...</option>
          {noteTemplates.map((template) => <option key={template.key} value={template.key}>{template.label}</option>)}
        </select>
        <div className="overflow-y-auto flex-1 -mr-1 pr-1">
          {filtered.length === 0 && <div className="text-center text-ink-500 py-8 text-sm">No notes</div>}
          <ul className="space-y-1">
            {filtered.map((n) => {
              const s = state.subjects.find((x) => x.id === n.subjectId)
              const c = colorFor(s?.color)
              const active = n.id === selectedId
              return (
                <li key={n.id}>
                  <button
                    onClick={() => setSelectedId(n.id)}
                    className={cx('w-full text-left p-3 rounded-2xl transition', active ? 'bg-brand-50 dark:bg-brand-900/30' : 'hover:bg-ink-50 dark:hover:bg-ink-800')}
                  >
                    <div className="flex items-center gap-2">
                      {n.pinned && <Icon.pin className="w-3 h-3 text-amber-500" />}
                      <div className="font-medium line-clamp-1 flex-1">{n.title || 'Untitled'}</div>
                      {s && <span className={cx('w-2 h-2 rounded-full', c.bg)} />}
                    </div>
                    <div className="text-xs text-ink-500 line-clamp-2 mt-1">{n.content.replace(/[#>*_`]/g, '').slice(0, 120) || 'Empty note'}</div>
                    {n.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {n.tags.slice(0, 3).map((t) => <span key={t} className="chip text-[10px]">#{t}</span>)}
                      </div>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {/* Editor */}
      <div className="card p-4 md:p-6 flex flex-col min-h-0">
        {!note ? (
          <div className="flex-1 flex items-center justify-center text-ink-500">Select or create a note</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <input
                value={note.title}
                onChange={(e) => patch({ title: e.target.value })}
                className="text-2xl font-display font-semibold bg-transparent flex-1 min-w-[180px] focus:outline-none"
                placeholder="Title"
              />
              <select
                className="input !py-1.5 max-w-[160px]"
                value={note.subjectId || ''}
                onChange={(e) => patch({ subjectId: e.target.value || null })}
              >
                <option value="">No subject</option>
                {state.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button className="btn-ghost" onClick={() => patch({ pinned: !note.pinned })} title="Pin">
                <Icon.pin className={cx('w-4 h-4', note.pinned && 'text-amber-500')} />
              </button>
              <button className="btn-ghost" onClick={() => setPreview((v) => !v)} title="Toggle preview">
                {preview ? <Icon.note className="w-4 h-4" /> : <Icon.book className="w-4 h-4" />}
              </button>
              <button className="btn-ghost text-rose-600" onClick={() => { remove('notes', note.id); setSelectedId(state.notes[0]?.id || null) }} title="Delete">
                <Icon.trash className="w-4 h-4" />
              </button>
            </div>

            <TagEditor tags={note.tags || []} onChange={(tags) => patch({ tags })} />

            {preview ? (
              <div className="flex-1 overflow-y-auto"><Markdown text={note.content || '*Empty*'} /></div>
            ) : (
              <textarea
                value={note.content}
                onChange={(e) => handleContentChange(e.target.value)}
                placeholder="# Start writing...  markdown supported"
                className="flex-1 resize-none bg-transparent focus:outline-none text-[15px] leading-relaxed"
              />
            )}

            {/* AI toolbar */}
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-soft" onClick={runSummarize} disabled={aiBusy}><Icon.sparkle className="w-4 h-4" /> Summarize</button>
              <button className="btn-soft" onClick={runFlashcards} disabled={aiBusy}><Icon.cards className="w-4 h-4" /> Make flashcards</button>
              <button className="btn-soft" onClick={runQuiz} disabled={aiBusy}><Icon.brain className="w-4 h-4" /> Generate quiz</button>
              <button className="btn-soft" onClick={runRewrite} disabled={aiBusy}><Icon.sparkle className="w-4 h-4" /> Rewrite</button>
              <button className="btn-ghost" onClick={() => openAI({ type: 'note', id: note.id })}><Icon.chat className="w-4 h-4" /> Ask about this note</button>
            </div>

            {aiBusy && <div className="text-sm text-ink-500 animate-pulse-soft mt-3">Working...</div>}
            {aiOutput && (
              <div className="mt-3 p-4 rounded-2xl bg-ink-50 dark:bg-ink-800">
                {aiOutput.kind === 'markdown' && <Markdown text={aiOutput.text} />}
                {aiOutput.kind === 'cards' && (
                  <div>
                    <div className="flex items-center mb-2">
                      <div className="font-semibold">{aiOutput.cards.length} flashcards</div>
                      <div className="flex-1" />
                      <button className="btn-primary" onClick={() => saveCardsToDeck(aiOutput.cards)}>
                        <Icon.download className="w-4 h-4" /> Save as deck
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {aiOutput.cards.map((c, i) => (
                        <div key={i} className="card p-3 !shadow-none">
                          <div className="text-xs text-ink-500">Front</div>
                          <Markdown text={c.front} />
                          <div className="text-xs text-ink-500 mt-2">Back</div>
                          <Markdown text={c.back} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {aiOutput.kind === 'quiz' && <QuizBlock questions={aiOutput.questions} />}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TagEditor({ tags, onChange }) {
  const [val, setVal] = useState('')
  return (
    <div className="flex flex-wrap gap-1 mb-3">
      {tags.map((t) => (
        <span key={t} className="chip gap-1">
          #{t}
          <button className="text-ink-400 hover:text-rose-500" onClick={() => onChange(tags.filter((x) => x !== t))}>x</button>
        </span>
      ))}
      <input
        value={val} onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ',') && val.trim()) {
            e.preventDefault()
            onChange([...new Set([...tags, val.trim().replace(/^#/, '')])])
            setVal('')
          }
        }}
        placeholder="add tag..." className="text-xs bg-transparent focus:outline-none px-2 py-1"
      />
    </div>
  )
}

function QuizBlock({ questions = [] }) {
  const [answers, setAnswers] = useState({})
  const [checked, setChecked] = useState(false)
  if (!questions.length) return <div className="text-sm text-ink-500">No questions generated.</div>
  const score = questions.filter((q, i) => answers[i] === q.answer).length
  return (
    <div>
      <ol className="space-y-3">
        {questions.map((q, i) => (
          <li key={i}>
            <div className="font-medium">{i + 1}. {q.q}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
              {q.choices.map((c, j) => {
                const picked = answers[i] === j
                const correct = checked && q.answer === j
                const wrong = checked && picked && q.answer !== j
                return (
                  <button key={j}
                    onClick={() => !checked && setAnswers({ ...answers, [i]: j })}
                    className={cx('text-left px-3 py-2 rounded-xl border',
                      correct ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/30' :
                      wrong ? 'border-rose-400 bg-rose-50 dark:bg-rose-900/30' :
                      picked ? 'border-brand-400 bg-brand-50 dark:bg-brand-900/30' :
                      'border-ink-200 dark:border-ink-700')}>
                    {c}
                  </button>
                )
              })}
            </div>
            {checked && q.explain && <div className="text-xs text-ink-500 mt-1">{q.explain}</div>}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex items-center gap-3">
        <button className="btn-primary" onClick={() => setChecked(true)}>Check answers</button>
        {checked && <div className="font-medium">Score: {score} / {questions.length}</div>}
      </div>
    </div>
  )
}

function titleFromContent(content) {
  const heading = content.match(/^\s*#{1,3}\s+(.+)$/m)?.[1]
  const source = heading || content.split(/\n+/).map((line) => line.trim()).find(Boolean)
  if (!source) return ''
  return source
    .replace(/[*_`>#\[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 60)
}
