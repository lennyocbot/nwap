import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import Modal from '../components/Modal.jsx'
import Markdown from '../components/Markdown.jsx'
import { cx, colorFor } from '../lib/utils.js'
import { aiGenerateFlashcards } from '../lib/ai.js'

// Very light SM-2 style scheduler
const schedule = (card, quality) => {
  let { ease = 2.5, interval = 1, reviews = 0 } = card
  if (quality < 3) {
    interval = 1
    ease = Math.max(1.3, ease - 0.2)
  } else {
    if (reviews === 0) interval = 1
    else if (reviews === 1) interval = 3
    else interval = Math.round(interval * ease)
    ease = Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
  }
  return {
    ease, interval, reviews: reviews + 1,
    due: Date.now() + interval * 86400000,
  }
}

export default function Revision() {
  const { state, add, update, remove, showToast } = useApp()
  const [deckId, setDeckId] = useState(state.decks[0]?.id || null)
  const [studying, setStudying] = useState(false)
  const [creatingDeck, setCreatingDeck] = useState(false)
  const [newDeckName, setNewDeckName] = useState('')
  const [genSource, setGenSource] = useState('')
  const [genOpen, setGenOpen] = useState(false)
  const [cardModal, setCardModal] = useState(null)

  const deck = state.decks.find((d) => d.id === deckId)
  const deckCards = state.flashcards.filter((c) => c.deckId === deckId)
  const dueCards = useMemo(() => deckCards.filter((c) => c.due <= Date.now()), [deckCards])

  const [queue, setQueue] = useState([])
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)

  const startStudy = () => {
    const q = deckCards.filter((c) => c.due <= Date.now()).slice().sort(() => Math.random() - 0.5)
    if (q.length === 0) return showToast('No cards due - add more or come back later!', 'info')
    setQueue(q); setIdx(0); setFlipped(false); setStudying(true)
  }

  const review = (quality) => {
    const card = queue[idx]
    update('flashcards', { id: card.id, ...schedule(card, quality) })
    if (idx + 1 >= queue.length) { setStudying(false); showToast('Session complete ', 'success') }
    else { setIdx(idx + 1); setFlipped(false) }
  }

  useEffect(() => {
    if (!studying) return
    const onKey = (e) => {
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return
      if (e.code === 'Space') {
        e.preventDefault()
        setFlipped((v) => !v)
      }
      if (flipped && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault()
        const quality = { 1: 1, 2: 3, 3: 4, 4: 5 }[e.key]
        review(quality)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [studying, flipped, idx, queue])

  const createDeck = () => {
    if (!newDeckName.trim()) return
    const d = add('decks', { name: newDeckName.trim(), subjectId: null, color: 'brand' })
    setNewDeckName(''); setCreatingDeck(false); setDeckId(d.id)
  }

  const generate = async () => {
    if (!deck || !genSource.trim()) return
    try {
      const cards = await aiGenerateFlashcards({ settings: state.settings, state, source: genSource })
      cards.forEach((c) => add('flashcards', {
        deckId: deck.id, front: c.front, back: c.back,
        ease: 2.5, interval: 1, due: Date.now(), reviews: 0,
      }))
      showToast(`Added ${cards.length} cards`, 'success')
      setGenOpen(false); setGenSource('')
    } catch (e) { showToast(e.message || 'AI error', 'error') }
  }

  if (studying) {
    const card = queue[idx]
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center text-sm text-ink-500 mb-3">
          Card {idx + 1} / {queue.length}
          <div className="flex-1" />
          <button className="btn-ghost" onClick={() => setStudying(false)}>Exit</button>
        </div>
        <div className="h-2 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden mb-4">
          <div className="h-full bg-brand-500 transition-all" style={{ width: `${((idx + 1) / queue.length) * 100}%` }} />
        </div>
        <div onClick={() => setFlipped((v) => !v)} className="card p-8 min-h-[320px] flex items-center justify-center text-center cursor-pointer select-none">
          <div className="text-xl md:text-2xl font-display font-semibold max-w-full">
            <Markdown text={flipped ? card.back : card.front} />
          </div>
        </div>
        <div className="text-center text-xs text-ink-500 mt-2">
          {flipped ? 'Click to flip back, or press 1-4 to rate.' : 'Click to flip, or press Space.'}
        </div>
        {flipped && (
          <div className="grid grid-cols-4 gap-2 mt-4">
            <button className="btn-soft !bg-rose-100 !text-rose-700 dark:!bg-rose-900/40 dark:!text-rose-200" onClick={() => review(1)}>1 Again</button>
            <button className="btn-soft !bg-amber-100 !text-amber-700 dark:!bg-amber-900/40 dark:!text-amber-200" onClick={() => review(3)}>2 Hard</button>
            <button className="btn-soft !bg-emerald-100 !text-emerald-700 dark:!bg-emerald-900/40 dark:!text-emerald-200" onClick={() => review(4)}>3 Good</button>
            <button className="btn-soft !bg-brand-100 !text-brand-700 dark:!bg-brand-900/40 dark:!text-brand-200" onClick={() => review(5)}>4 Easy</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
      <div className="card p-3">
        <div className="flex items-center justify-between px-1 mb-2">
          <div className="font-display font-semibold">Decks</div>
          <button className="btn-ghost" onClick={() => setCreatingDeck(true)}><Icon.plus className="w-4 h-4" /></button>
        </div>
        <ul className="space-y-1">
          {state.decks.map((d) => {
            const s = state.subjects.find((x) => x.id === d.subjectId)
            const c = colorFor(d.color || s?.color || 'brand')
            const total = state.flashcards.filter((f) => f.deckId === d.id).length
            const due = state.flashcards.filter((f) => f.deckId === d.id && f.due <= Date.now()).length
            return (
              <li key={d.id}>
                <button onClick={() => setDeckId(d.id)}
                  className={cx('w-full text-left p-3 rounded-2xl transition flex items-center gap-3',
                    deckId === d.id ? 'bg-brand-50 dark:bg-brand-900/30' : 'hover:bg-ink-50 dark:hover:bg-ink-800')}>
                  <span className={cx('w-8 h-8 rounded-xl flex items-center justify-center text-white', c.bg)}>
                    <Icon.cards className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{d.name}</div>
                    <div className="text-xs text-ink-500">{total} cards - {due} due</div>
                  </div>
                </button>
              </li>
            )
          })}
          {state.decks.length === 0 && <li className="text-center text-sm text-ink-500 py-6">No decks yet</li>}
        </ul>
      </div>

      <div className="card p-5">
        {!deck ? (
          <div className="text-ink-500 text-center py-10">Create or select a deck</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <input
                className="text-xl font-display font-semibold bg-transparent focus:outline-none flex-1 min-w-[180px]"
                value={deck.name}
                onChange={(e) => update('decks', { id: deck.id, name: e.target.value })}
              />
              <button className="btn-soft" onClick={() => setGenOpen(true)}><Icon.sparkle className="w-4 h-4" /> AI generate</button>
              <button className="btn-primary" onClick={startStudy}><Icon.play className="w-4 h-4" /> Study ({dueCards.length})</button>
              <button className="btn-ghost text-rose-600" onClick={() => { remove('decks', deck.id); setDeckId(state.decks.find((d) => d.id !== deck.id)?.id || null) }}>
                <Icon.trash className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between mb-3 text-sm">
              <div className="text-ink-500">{deckCards.length} cards - {dueCards.length} due now</div>
              <button className="btn-ghost" onClick={() => setCardModal({ front: '', back: '' })}><Icon.plus className="w-4 h-4" /> Card</button>
            </div>

            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
              {deckCards.map((c) => (
                <li key={c.id} className="py-3 flex items-start gap-3 hover:bg-ink-50 dark:hover:bg-ink-800 rounded-xl px-2 cursor-pointer"
                  onClick={() => setCardModal(c)}>
                  <Icon.cards className="w-4 h-4 text-ink-400 mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{c.front}</div>
                    <div className="text-xs text-ink-500 truncate">{c.back}</div>
                  </div>
                  <div className="text-[11px] text-ink-500">
                    {c.due <= Date.now() ? <span className="text-brand-600">due</span> : new Date(c.due).toLocaleDateString()}
                  </div>
                </li>
              ))}
              {deckCards.length === 0 && <li className="text-center text-sm text-ink-500 py-10">No cards yet - add one or generate with AI.</li>}
            </ul>
          </>
        )}
      </div>

      <Modal open={creatingDeck} onClose={() => setCreatingDeck(false)} title="New deck"
        footer={<><button className="btn-ghost" onClick={() => setCreatingDeck(false)}>Cancel</button>
        <button className="btn-primary" onClick={createDeck}>Create</button></>}>
        <input className="input" autoFocus placeholder="Deck name" value={newDeckName} onChange={(e) => setNewDeckName(e.target.value)} />
      </Modal>

      <Modal open={genOpen} onClose={() => setGenOpen(false)} title="Generate flashcards from..."
        footer={<><button className="btn-ghost" onClick={() => setGenOpen(false)}>Cancel</button>
        <button className="btn-primary" onClick={generate}><Icon.sparkle className="w-4 h-4" /> Generate</button></>}>
        <div className="text-sm text-ink-500 mb-2">Paste notes, a paragraph, or type a topic like "photosynthesis":</div>
        <textarea className="input min-h-[180px]" value={genSource} onChange={(e) => setGenSource(e.target.value)} />
      </Modal>

      <Modal open={!!cardModal} onClose={() => setCardModal(null)} title={cardModal?.id ? 'Edit card' : 'New card'}
        footer={
          <>
            {cardModal?.id && (
              <button className="btn-ghost text-rose-600" onClick={() => { remove('flashcards', cardModal.id); setCardModal(null) }}>
                <Icon.trash className="w-4 h-4" /> Delete
              </button>
            )}
            <button className="btn-primary" onClick={() => {
              if (!cardModal.front.trim()) return
              if (cardModal.id) update('flashcards', cardModal)
              else add('flashcards', { deckId: deck.id, front: cardModal.front, back: cardModal.back, ease: 2.5, interval: 1, due: Date.now(), reviews: 0 })
              setCardModal(null)
            }}>Save</button>
          </>
        }>
        {cardModal && (
          <div className="space-y-3">
            <div>
              <div className="text-xs text-ink-500 mb-1">Front</div>
              <textarea className="input min-h-[80px]" value={cardModal.front} onChange={(e) => setCardModal({ ...cardModal, front: e.target.value })} />
            </div>
            <div>
              <div className="text-xs text-ink-500 mb-1">Back</div>
              <textarea className="input min-h-[80px]" value={cardModal.back} onChange={(e) => setCardModal({ ...cardModal, back: e.target.value })} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
