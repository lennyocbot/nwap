import { uid } from './utils.js'

export const SCHOOL_TIMETABLE_ROWS = [
  { id: 'early1', label: 'Early slot 1', start: '06:30', end: '07:00', kind: 'before' },
  { id: 'early2', label: 'Early slot 2', start: '07:00', end: '07:30', kind: 'before' },
  { id: 'before1', label: 'Before school 1', start: '07:30', end: '08:00', kind: 'before' },
  { id: 'form', label: 'Form', start: '08:00', end: '08:15', kind: 'form', defaultTitle: 'Form time' },
  { id: 'p1', label: 'Period 1', start: '08:15', end: '09:15', kind: 'lesson' },
  { id: 'p2', label: 'Period 2', start: '09:15', end: '10:15', kind: 'lesson' },
  { id: 'break', label: 'Break', start: '10:15', end: '10:35', kind: 'break', defaultTitle: 'Break' },
  { id: 'p3', label: 'Period 3', start: '10:35', end: '11:35', kind: 'lesson' },
  { id: 'p4', label: 'Period 4', start: '11:35', end: '12:35', kind: 'lesson' },
  { id: 'lunch', label: 'Lunch', start: '12:35', end: '13:30', kind: 'lunch', defaultTitle: 'Lunch' },
  { id: 'p5', label: 'Period 5', start: '13:30', end: '14:30', kind: 'lesson' },
  { id: 'p6', label: 'Period 6', start: '14:30', end: '15:30', kind: 'lesson' },
  { id: 'after1', label: 'After school', start: '15:30', end: '16:30', kind: 'after' },
  { id: 'after2', label: 'After school 2', start: '16:30', end: '17:30', kind: 'after' },
  { id: 'after3', label: 'After school 3', start: '17:30', end: '18:30', kind: 'after' },
  { id: 'after4', label: 'Evening slot', start: '18:30', end: '19:30', kind: 'after' },
]

export const TIMETABLE_KIND_OPTIONS = [
  ['lesson', 'Lesson'],
  ['study', 'Study block'],
  ['form', 'Form time'],
  ['break', 'Break'],
  ['lunch', 'Lunch'],
  ['club', 'Club / activity'],
  ['before', 'Before school'],
  ['after', 'After school'],
]

export function mergedTimetableRows(customRows = []) {
  const byTime = new Map()
  ;[...SCHOOL_TIMETABLE_ROWS, ...(customRows || [])].forEach((row) => {
    if (!row?.start || !row?.end) return
    const key = `${row.start}-${row.end}`
    const existing = byTime.get(key)
    byTime.set(key, existing ? { ...existing, ...row, custom: Boolean(row.custom || existing.custom) } : row)
  })
  return [...byTime.values()].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))
}

export function ensureTimetableRow(settings, slot) {
  if (!slot?.start || !slot?.end) return settings
  const rows = mergedTimetableRows(settings?.timetableRows || [])
  if (rows.some((row) => row.start === slot.start && row.end === slot.end)) return settings
  const customRow = {
    id: uid(),
    custom: true,
    label: slot.title?.trim() || labelForSlot(slot),
    start: slot.start,
    end: slot.end,
    kind: slot.kind || 'study',
  }
  return {
    ...settings,
    timetableRows: [...(settings?.timetableRows || []), customRow],
  }
}

function labelForSlot(slot) {
  if (slot.kind === 'club') return 'Activity'
  if (slot.kind === 'study') return 'Study block'
  if (slot.kind === 'before') return 'Before school'
  if (slot.kind === 'after') return 'After school'
  return 'Custom slot'
}
