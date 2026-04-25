import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import Modal from '../components/Modal.jsx'
import Markdown from '../components/Markdown.jsx'
import { cx, colorFor } from '../lib/utils.js'
import { buildSystemPrompt, callAI } from '../lib/ai.js'
import { normalizeAIText } from '../lib/text.js'

const statuses = [
  { key: 'queued', label: 'Queued' },
  { key: 'reading', label: 'Reading' },
  { key: 'done', label: 'Done' },
]

export default function Reading() {
  const { state, add, update, remove, showToast } = useApp()
  const [edit, setEdit] = useState(null)
  const [filter, setFilter] = useState('all')
  const [recommendations, setRecommendations] = useState([])
  const [recommendationText, setRecommendationText] = useState('')
  const [busy, setBusy] = useState(false)

  const items = useMemo(() => {
    return state.reading
      .slice()
      .sort((a, b) => statusWeight(a.status) - statusWeight(b.status) || (a.title || '').localeCompare(b.title || ''))
      .filter((r) => filter === 'all' || r.subjectId === filter || r.status === filter)
  }, [state.reading, filter])

  const create = () => {
    const r = add('reading', {
      title: 'New reading',
      author: '',
      url: '',
      status: 'queued',
      subjectId: state.subjects[0]?.id || null,
      notes: '',
      summary: '',
      rating: 0,
      progress: 0,
      type: 'article',
      difficulty: 'medium',
      estMinutes: 30,
      tags: [],
      why: '',
    })
    setEdit(r)
  }

  const patchEdit = (patch) => {
    update('reading', { id: edit.id, ...patch })
    setEdit({ ...edit, ...patch })
  }

  const summarize = async () => {
    if (!edit) return
    setBusy(true)
    try {
      const subject = state.subjects.find((s) => s.id === edit.subjectId)?.name || 'General'
      const summary = await callAI({
        settings: state.settings,
        system: buildSystemPrompt(state, `Summarizing a reading item for ${subject}.`),
        messages: [{
          role: 'user',
          content: `Summarize this reading item for an A-level student. Include: key idea, 3 useful takeaways, and how it connects to ${subject}.\n\nTitle: ${edit.title}\nAuthor: ${edit.author || 'unknown'}\nURL: ${edit.url || 'none'}\nNotes:\n${edit.notes || 'none'}`
        }],
      })
      patchEdit({ summary: normalizeAIText(summary) })
      showToast('Reading summary saved', 'success')
    } catch (e) {
      showToast(e.message || 'AI error', 'error')
    } finally {
      setBusy(false)
    }
  }

  const recommend = async () => {
    setBusy(true)
    setRecommendations([])
    setRecommendationText('')
    try {
      const data = await callAI({
        settings: state.settings,
        system: buildSystemPrompt(state, 'Recommending targeted reading for A-level study.'),
        json: true,
        messages: [{
          role: 'user',
          content: `Recommend 6 high-value reading items for my subjects and goals. Prefer concise, useful resources, not random books. Return JSON only: {"items":[{"title":"...","author":"...","url":"...","subjectId":"existing subject id or null","type":"article|book|video|paper|website","difficulty":"easy|medium|hard","estMinutes":30,"why":"why this helps me","tags":["..."]}]}.\n\nSubjects: ${JSON.stringify(state.subjects.map((s) => ({ id: s.id, name: s.name, target: s.target })))}\nGoals: ${state.goals.map((g) => g.title).join(', ') || 'none'}\nOpen assignments: ${state.assignments.filter((a) => a.status !== 'done').map((a) => a.title).join(', ') || 'none'}\nCurrent reading: ${state.reading.map((r) => `${r.title} (${r.status})`).join(', ') || 'none'}`
        }],
      })
      const items = (data?.items || []).slice(0, 8).map((item) => cleanRecommendation(item, state.subjects))
      if (items.length) {
        setRecommendations(items)
      } else {
        const text = await callAI({
          settings: state.settings,
          system: buildSystemPrompt(state, 'Recommending targeted reading for A-level study.'),
          messages: [{
            role: 'user',
            content: `Recommend 6 high-value reading items for my subjects and goals. Use concise markdown with subject, why it matters, and estimated reading time.`
          }],
        })
        setRecommendationText(normalizeAIText(text))
      }
    } catch (e) {
      showToast(e.message || 'AI error', 'error')
    } finally {
      setBusy(false)
    }
  }

  const saveRecommendation = (item) => {
    const { key, ...readingItem } = item
    const saved = add('reading', {
      ...readingItem,
      status: 'queued',
      notes: item.why || '',
      summary: '',
      rating: 0,
      progress: 0,
      createdAt: Date.now(),
    })
    setRecommendations((current) => current.filter((rec) => rec.key !== item.key))
    showToast(`Saved "${saved.title}"`, 'success')
  }

  const saveAllRecommendations = () => {
    recommendations.forEach((item) => {
      const { key, ...readingItem } = item
      add('reading', {
      ...readingItem,
      status: 'queued',
      notes: item.why || '',
      summary: '',
      rating: 0,
      progress: 0,
      createdAt: Date.now(),
      })
    })
    showToast(`Saved ${recommendations.length} reading items`, 'success')
    setRecommendations([])
  }

  const saveSummaryAsNote = () => {
    if (!edit?.summary) return
    const note = add('notes', {
      title: `${edit.title} - reading notes`,
      content: [
        `# ${edit.title}`,
        '',
        edit.url ? `[Source](${edit.url})` : '',
        '',
        edit.summary,
        '',
        edit.notes ? `## My notes\n\n${edit.notes}` : '',
      ].filter(Boolean).join('\n'),
      subjectId: edit.subjectId || null,
      tags: ['reading', ...(edit.tags || [])].slice(0, 8),
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    showToast(`Saved "${note.title}" to Notes`, 'success')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input max-w-[210px]" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All reading</option>
          {statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          {state.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="text-sm text-ink-500">{state.reading.length} items</div>
        <div className="flex-1" />
        <button className="btn-soft" onClick={recommend} disabled={busy}><Icon.sparkle className="w-4 h-4" /> AI recommendations</button>
        <button className="btn-primary" onClick={create}><Icon.plus className="w-4 h-4" /> Add reading</button>
      </div>

      {recommendations.length > 0 && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="font-display font-semibold">AI recommendations</div>
            <div className="flex-1" />
            <button className="btn-primary" onClick={saveAllRecommendations}>
              <Icon.download className="w-4 h-4" /> Save all
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {recommendations.map((item) => {
              const subject = state.subjects.find((s) => s.id === item.subjectId)
              return (
                <div key={item.key} className="rounded-2xl border border-ink-100 bg-white p-3 dark:border-ink-800 dark:bg-ink-900">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{item.title}</div>
                      <div className="text-xs text-ink-500 truncate">{item.author || item.type} - {subject?.name || 'General'}</div>
                    </div>
                    <span className="chip">{item.estMinutes}m</span>
                  </div>
                  <div className="text-xs text-ink-500 mt-2 line-clamp-2">{item.why || 'Recommended for your current study plan.'}</div>
                  <div className="flex flex-wrap items-center gap-1 mt-3">
                    <span className="chip capitalize">{item.type}</span>
                    <span className="chip capitalize">{item.difficulty}</span>
                    {(item.tags || []).slice(0, 3).map((tag) => <span key={tag} className="chip">#{tag}</span>)}
                    <div className="flex-1" />
                    <button className="btn-soft" onClick={() => saveRecommendation(item)}>
                      <Icon.plus className="w-4 h-4" /> Save
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {recommendationText && (
        <div className="card p-4">
          <div className="font-display font-semibold mb-2">AI recommendations</div>
          <Markdown text={recommendationText} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {items.map((r) => {
          const subject = state.subjects.find((s) => s.id === r.subjectId)
          const color = colorFor(subject?.color)
          return (
            <button key={r.id} className="card p-4 text-left hover:shadow-pop transition" onClick={() => setEdit(r)}>
              <div className="flex items-start gap-3">
                <div className={cx('w-10 h-10 rounded-2xl flex items-center justify-center text-white shrink-0', color.bg)}>
                  <Icon.book className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-semibold truncate">{r.title}</div>
                  <div className="text-xs text-ink-500 truncate">{r.author || 'No author'} - {subject?.name || 'General'}</div>
                </div>
                <span className="chip capitalize">{r.status}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {r.type && <span className="chip capitalize">{r.type}</span>}
                {r.difficulty && <span className="chip capitalize">{r.difficulty}</span>}
                {r.estMinutes ? <span className="chip"><Icon.clock className="w-3 h-3" /> {r.estMinutes}m</span> : null}
              </div>
              <div className="mt-3 h-2 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden">
                <div className="h-full bg-brand-500" style={{ width: `${r.status === 'done' ? 100 : r.progress || 0}%` }} />
              </div>
              <div className="text-xs text-ink-500 mt-2 line-clamp-3">
                {r.summary ? stripMarkdown(r.summary) : r.notes || 'No notes yet'}
              </div>
            </button>
          )
        })}
        {items.length === 0 && (
          <div className="card p-10 text-center text-ink-500 md:col-span-2 xl:col-span-3">No reading items here yet.</div>
        )}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title="Reading item"
        footer={
          <>
            <button className="btn-ghost text-rose-600" onClick={() => { remove('reading', edit.id); setEdit(null) }}><Icon.trash className="w-4 h-4" /> Delete</button>
            <button className="btn-primary" onClick={() => setEdit(null)}>Done</button>
          </>
        }>
        {edit && (
          <div className="space-y-3">
            <input className="input text-lg" value={edit.title}
              onChange={(e) => patchEdit({ title: e.target.value })} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input className="input" placeholder="Author" value={edit.author || ''}
                onChange={(e) => patchEdit({ author: e.target.value })} />
              <select className="input" value={edit.subjectId || ''}
                onChange={(e) => patchEdit({ subjectId: e.target.value || null })}>
                <option value="">No subject</option>
                {state.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <input className="input" placeholder="URL (optional)" value={edit.url || ''}
              onChange={(e) => patchEdit({ url: e.target.value })} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <select className="input" value={edit.status} onChange={(e) => patchEdit({ status: e.target.value })}>
                {statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <select className="input" value={edit.type || 'article'} onChange={(e) => patchEdit({ type: e.target.value })}>
                {['article', 'book', 'video', 'paper', 'website'].map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <select className="input" value={edit.difficulty || 'medium'} onChange={(e) => patchEdit({ difficulty: e.target.value })}>
                {['easy', 'medium', 'hard'].map((level) => <option key={level} value={level}>{level}</option>)}
              </select>
              <input type="number" min={0} max={100} className="input" value={edit.progress || 0}
                onChange={(e) => patchEdit({ progress: Number(e.target.value) })}
                placeholder="Progress %" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input type="number" min={0} className="input" value={edit.estMinutes || 0}
                onChange={(e) => patchEdit({ estMinutes: Number(e.target.value) || 0 })}
                placeholder="Estimated minutes" />
              <input className="input" value={(edit.tags || []).join(', ')}
                onChange={(e) => patchEdit({ tags: e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 8) })}
                placeholder="Tags, comma-separated" />
            </div>
            <div className="flex items-center gap-1 text-2xl">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => patchEdit({ rating: n })}
                  className={cx(n <= (edit.rating || 0) ? 'text-amber-400' : 'text-ink-300')}>*</button>
              ))}
            </div>
            <textarea className="input min-h-[120px]" placeholder="Reading notes, quotes, or questions" value={edit.notes || ''}
              onChange={(e) => patchEdit({ notes: e.target.value })} />
            <textarea className="input min-h-[80px]" placeholder="Why this matters / where it fits" value={edit.why || ''}
              onChange={(e) => patchEdit({ why: e.target.value })} />
            <div className="flex flex-wrap gap-2">
              <button className="btn-soft" onClick={summarize} disabled={busy}><Icon.sparkle className="w-4 h-4" /> AI summary</button>
              {edit.summary && <button className="btn-soft" onClick={saveSummaryAsNote}><Icon.note className="w-4 h-4" /> Save summary to Notes</button>}
              {edit.url && <a className="btn-ghost" href={edit.url} target="_blank" rel="noreferrer"><Icon.link className="w-4 h-4" /> Open source</a>}
            </div>
            {busy && <div className="text-sm text-ink-500 animate-pulse-soft">Working...</div>}
            {edit.summary && (
              <div className="rounded-2xl bg-ink-50 dark:bg-ink-800 p-3">
                <div className="font-display font-semibold mb-2">Summary</div>
                <Markdown text={edit.summary} />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

function statusWeight(status) {
  return { reading: 0, queued: 1, done: 2 }[status] ?? 3
}

function stripMarkdown(text = '') {
  return text.replace(/[#>*_`[\]()]/g, '').replace(/\s+/g, ' ').trim()
}

function cleanRecommendation(item, subjects) {
  const subjectId = subjects.some((subject) => subject.id === item?.subjectId) ? item.subjectId : null
  const type = ['article', 'book', 'video', 'paper', 'website'].includes(item?.type) ? item.type : 'article'
  const difficulty = ['easy', 'medium', 'hard'].includes(item?.difficulty) ? item.difficulty : 'medium'
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: normalizeAIText(item?.title || 'Recommended reading').slice(0, 120),
    author: normalizeAIText(item?.author || ''),
    url: normalizeAIText(item?.url || ''),
    subjectId,
    type,
    difficulty,
    estMinutes: Math.max(5, Number(item?.estMinutes) || 30),
    why: normalizeAIText(item?.why || ''),
    tags: Array.isArray(item?.tags) ? item.tags.map((tag) => normalizeAIText(tag).replace(/^#/, '')).filter(Boolean).slice(0, 6) : [],
  }
}
