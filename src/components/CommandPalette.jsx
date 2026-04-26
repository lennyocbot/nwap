import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from './Icons.jsx'

const typeRoute = {
  note: 'notes',
  assignment: 'assignments',
  flashcard: 'revision',
  journal: 'journal',
  file: 'files',
  reading: 'reading',
  subject: 'subjects',
  mindmap: 'mindmap',
  goal: 'goals',
}

export default function CommandPalette() {
  const { state, navigate } = useApp()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((current) => !current)
      }
      if (event.key === 'Escape') setOpen(false)
    }
    const onOpenSearch = () => setOpen(true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('scholarai:open-search', onOpenSearch)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scholarai:open-search', onOpenSearch)
    }
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
    else setQuery('')
  }, [open])

  const results = useMemo(() => searchState(state, query), [state, query])

  const choose = (result) => {
    navigate(typeRoute[result.type] || 'dashboard', result.params || {})
    setOpen(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-3 pt-[10vh] animate-fade-in">
      <div className="w-full max-w-2xl rounded-3xl border border-ink-200 bg-white shadow-pop dark:border-ink-700 dark:bg-ink-900">
        <div className="flex items-center gap-3 border-b border-ink-100 px-4 py-3 dark:border-ink-800">
          <Icon.search className="w-5 h-5 text-ink-400" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-base outline-none"
            placeholder="Search notes, assignments, files, flashcards..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button className="btn-ghost" onClick={() => setOpen(false)} type="button">
            <Icon.x className="w-4 h-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="py-10 text-center text-sm text-ink-500">No results</div>
          ) : (
            results.map((result) => (
              <button
                key={`${result.type}:${result.id}`}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-ink-50 dark:hover:bg-ink-800"
                onClick={() => choose(result)}
                type="button"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-100">
                  <ResultIcon type={result.type} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{result.title}</span>
                  <span className="block truncate text-xs text-ink-500">{result.type} - {result.subtitle}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function ResultIcon({ type }) {
  const map = {
    note: Icon.note,
    assignment: Icon.task,
    flashcard: Icon.cards,
    journal: Icon.journal,
    file: Icon.files,
    reading: Icon.book,
    subject: Icon.subject,
    mindmap: Icon.mindmap,
    goal: Icon.goal,
  }
  const Component = map[type] || Icon.search
  return <Component className="w-4 h-4" />
}

function searchState(state, query) {
  const q = query.trim().toLowerCase()
  const haystacks = [
    ...state.notes.map((note) => ({
      id: note.id,
      type: 'note',
      title: note.title || 'Untitled note',
      subtitle: preview([note.content, ...(note.tags || [])]),
      text: [note.title, note.content, ...(note.tags || [])].join(' '),
      params: { id: note.id },
    })),
    ...state.assignments.map((assignment) => ({
      id: assignment.id,
      type: 'assignment',
      title: assignment.title || 'Untitled assignment',
      subtitle: assignment.due ? `Due ${new Date(assignment.due).toLocaleDateString()}` : assignment.status,
      text: [assignment.title, assignment.notes, assignment.status, assignment.priority].join(' '),
      params: { id: assignment.id },
    })),
    ...state.flashcards.map((card) => ({
      id: card.id,
      type: 'flashcard',
      title: card.front || 'Flashcard',
      subtitle: card.back || 'Revision card',
      text: [card.front, card.back].join(' '),
      params: { deckId: card.deckId, cardId: card.id },
    })),
    ...state.journal.map((entry) => ({
      id: entry.id,
      type: 'journal',
      title: new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      subtitle: preview([entry.content, entry.gratitude, entry.tomorrow]),
      text: [entry.date, entry.content, entry.gratitude, entry.tomorrow].join(' '),
      params: { date: entry.date },
    })),
    ...state.files.map((file) => ({
      id: file.id,
      type: 'file',
      title: file.name || 'File',
      subtitle: file.type || 'Uploaded file',
      text: [file.name, file.type].join(' '),
    })),
    ...state.reading.map((item) => ({
      id: item.id,
      type: 'reading',
      title: item.title || 'Reading item',
      subtitle: preview([item.notes, item.summary, item.url]),
      text: [item.title, item.notes, item.summary, item.url].join(' '),
    })),
    ...state.subjects.map((subject) => ({
      id: subject.id,
      type: 'subject',
      title: subject.name || 'Subject',
      subtitle: subject.teacher || 'Subject hub',
      text: [subject.name, subject.teacher, subject.examBoard].join(' '),
      params: { subject: subject.id },
    })),
    ...state.mindmaps.flatMap((map) => flattenMap(map).map((node) => ({
      id: `${map.id}:${node.id}`,
      type: 'mindmap',
      title: node.label || map.title || 'Mind map',
      subtitle: map.title || 'Mind map',
      text: [map.title, node.label, node.path].join(' '),
      params: { id: map.id, nodeId: node.id },
    }))),
    ...state.goals.map((goal) => ({
      id: goal.id,
      type: 'goal',
      title: goal.title || 'Goal',
      subtitle: goal.targetDate ? `Target ${goal.targetDate}` : 'Goal',
      text: [goal.title, goal.notes, goal.status].join(' '),
    })),
  ]

  if (!q) return haystacks.slice(0, 12)
  return haystacks
    .map((item) => ({ item, score: score(item.text, q) + score(item.title, q) * 2 }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 18)
    .map(({ item }) => item)
}

function score(text = '', query) {
  const clean = String(text).toLowerCase()
  if (clean.includes(query)) return query.length + 8
  return query.split(/\s+/).filter((part) => clean.includes(part)).length
}

function preview(parts) {
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 110) || 'Open'
}

function flattenMap(map) {
  const out = []
  const walk = (node, path = []) => {
    if (!node) return
    const nextPath = [...path, node.label]
    out.push({ ...node, path: nextPath.join(' > ') })
    ;(node.children || []).forEach((child) => walk(child, nextPath))
  }
  walk(map.root)
  return out
}
