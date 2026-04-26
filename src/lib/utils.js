export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export const cx = (...args) => args.filter(Boolean).join(' ')

export const fmtDate = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export const fmtDateTime = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  return dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export const fmtTime = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const dt = new Date()
  dt.setHours(h, m || 0)
  return dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export const daysUntil = (d) => {
  if (!d) return null
  const ms = new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)
  return Math.round(ms / 86400000)
}

export const relative = (d) => {
  const days = daysUntil(d)
  if (days === null) return ''
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days < 0) return `${Math.abs(days)}d ago`
  if (days < 7) return `In ${days}d`
  return fmtDate(d)
}

export const todayISO = () => new Date().toISOString().slice(0, 10)

export const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString()

export const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const subjectColors = [
  { name: 'brand',   bg: 'bg-brand-500',   soft: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200', hex: '#4d73f4' },
  { name: 'violet',  bg: 'bg-violet-500',  soft: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200', hex: '#8b5cf6' },
  { name: 'pink',    bg: 'bg-pink-500',    soft: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-200', hex: '#ec4899' },
  { name: 'teal',    bg: 'bg-teal-500',    soft: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200', hex: '#14b8a6' },
  { name: 'amber',   bg: 'bg-amber-500',   soft: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200', hex: '#f59e0b' },
  { name: 'emerald', bg: 'bg-emerald-500', soft: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200', hex: '#10b981' },
  { name: 'rose',    bg: 'bg-rose-500',    soft: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200', hex: '#f43f5e' },
  { name: 'sky',     bg: 'bg-sky-500',     soft: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200', hex: '#0ea5e9' },
]

export const colorFor = (name) => subjectColors.find((c) => c.name === name) || subjectColors[0]

export const subjectInitial = (name = '') => {
  const cleaned = String(name || '').trim()
  const match = cleaned.match(/[A-Za-z0-9]/)
  return (match?.[0] || 'S').toUpperCase()
}

export const sortBy = (key, dir = 1) => (a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0)

export const groupBy = (arr, key) =>
  arr.reduce((acc, item) => {
    const k = typeof key === 'function' ? key(item) : item[key]
    ;(acc[k] = acc[k] || []).push(item)
    return acc
  }, {})

export const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

export const downloadJSON = (data, filename) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const fileToDataURL = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result)
    r.onerror = rej
    r.readAsDataURL(file)
  })
