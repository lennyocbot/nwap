import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import Modal from '../components/Modal.jsx'
import { cx, colorFor, fmtDate, todayISO } from '../lib/utils.js'

export default function Grades() {
  const { state, add, update, remove } = useApp()
  const [edit, setEdit] = useState(null)

  const bySubject = useMemo(() => {
    const m = {}
    state.grades.forEach((g) => { (m[g.subjectId] = m[g.subjectId] || []).push(g) })
    return m
  }, [state.grades])

  const overall = useMemo(() => {
    if (!state.grades.length) return null
    let wSum = 0, num = 0
    state.grades.forEach((g) => { const pct = (g.score / g.outOf) * 100; const w = g.weight || 1; wSum += w; num += pct * w })
    return Math.round(num / wSum)
  }, [state.grades])

  const create = () => {
    const g = add('grades', { name: 'Assessment', subjectId: state.subjects[0]?.id || null, score: 0, outOf: 100, weight: 10, date: new Date().toISOString() })
    setEdit(g)
  }

  return (
    <div className="space-y-4">
      <div className="card p-6 flex items-center">
        <div>
          <div className="text-sm text-ink-500">Overall weighted average</div>
          <div className="text-4xl font-display font-semibold">{overall != null ? `${overall}%` : '-'}</div>
          <div className="text-xs text-ink-500 mt-1">{state.grades.length} assessments</div>
        </div>
        <div className="flex-1" />
        <button className="btn-primary" onClick={create}><Icon.plus className="w-4 h-4" /> Add grade</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {state.subjects.map((s) => {
          const grades = bySubject[s.id] || []
          const avg = grades.length ? Math.round(grades.reduce((a, g) => a + g.score / g.outOf * 100, 0) / grades.length) : null
          const c = colorFor(s.color)
          const target = s.target || 0
          return (
            <div key={s.id} className="card p-4">
              <div className="flex items-center gap-3">
                <div className={cx('w-10 h-10 rounded-2xl flex items-center justify-center text-white text-xl', c.bg)}>{s.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-semibold truncate">{s.name}</div>
                  <div className="text-xs text-ink-500">{grades.length} entries - avg {avg != null ? `${avg}%` : '-'}</div>
                </div>
                {target ? <span className={cx('pill', avg >= target ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>target {target}%</span> : null}
              </div>
              <ul className="mt-3 divide-y divide-ink-100 dark:divide-ink-800">
                {grades.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).map((g) => {
                  const pct = (g.score / g.outOf) * 100
                  return (
                    <li key={g.id} className="py-2 flex items-center gap-3 cursor-pointer" onClick={() => setEdit(g)}>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{g.name}</div>
                        <div className="text-xs text-ink-500">{fmtDate(g.date)} - weight {g.weight}</div>
                      </div>
                      <div className={cx('text-base font-display font-semibold', pct >= (target || 70) ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-rose-600')}>{Math.round(pct)}%</div>
                    </li>
                  )
                })}
                {grades.length === 0 && <li className="text-center text-xs text-ink-500 py-3">No grades yet</li>}
              </ul>
            </div>
          )
        })}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title="Grade"
        footer={
          <>
            <button className="btn-ghost text-rose-600" onClick={() => { remove('grades', edit.id); setEdit(null) }}><Icon.trash className="w-4 h-4" /> Delete</button>
            <button className="btn-primary" onClick={() => setEdit(null)}>Done</button>
          </>
        }>
        {edit && (
          <div className="space-y-3">
            <input className="input text-lg" value={edit.name}
              onChange={(e) => { update('grades', { id: edit.id, name: e.target.value }); setEdit({ ...edit, name: e.target.value }) }} />
            <select className="input" value={edit.subjectId || ''}
              onChange={(e) => { const v = e.target.value || null; update('grades', { id: edit.id, subjectId: v }); setEdit({ ...edit, subjectId: v }) }}>
              <option value="">None</option>
              {state.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="text-xs text-ink-500 mb-1">Score</div>
                <input type="number" className="input" value={edit.score}
                  onChange={(e) => { update('grades', { id: edit.id, score: Number(e.target.value) }); setEdit({ ...edit, score: Number(e.target.value) }) }} />
              </div>
              <div>
                <div className="text-xs text-ink-500 mb-1">Out of</div>
                <input type="number" className="input" value={edit.outOf}
                  onChange={(e) => { update('grades', { id: edit.id, outOf: Number(e.target.value) || 100 }); setEdit({ ...edit, outOf: Number(e.target.value) || 100 }) }} />
              </div>
              <div>
                <div className="text-xs text-ink-500 mb-1">Weight</div>
                <input type="number" className="input" value={edit.weight}
                  onChange={(e) => { update('grades', { id: edit.id, weight: Number(e.target.value) }); setEdit({ ...edit, weight: Number(e.target.value) }) }} />
              </div>
            </div>
            <input type="date" className="input" value={edit.date?.slice(0, 10) || todayISO()}
              onChange={(e) => { const v = new Date(e.target.value).toISOString(); update('grades', { id: edit.id, date: v }); setEdit({ ...edit, date: v }) }} />
          </div>
        )}
      </Modal>
    </div>
  )
}
