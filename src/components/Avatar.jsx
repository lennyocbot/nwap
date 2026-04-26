import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { supabase } from '../lib/supabase.js'
import { cx } from '../lib/utils.js'

export default function Avatar({ className = 'w-10 h-10', label = true }) {
  const { state, account } = useApp()
  const [signedUrl, setSignedUrl] = useState('')
  const src = state.user.avatarLocalData || signedUrl
  const initials = initialsFor(state.user.name || account.user?.email || 'Student')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!state.user.avatarStoragePath || !supabase || !account.user) {
        setSignedUrl('')
        return
      }
      const { data } = await supabase.storage.from('user-files').createSignedUrl(state.user.avatarStoragePath, 60 * 60)
      if (!cancelled) setSignedUrl(data?.signedUrl || '')
    }
    load()
    return () => { cancelled = true }
  }, [state.user.avatarStoragePath, account.user?.id])

  return (
    <div className={cx('rounded-[18px] bg-gradient-to-br from-brand-100 to-white shadow-card ring-1 ring-brand-100 flex items-center justify-center overflow-hidden shrink-0', className)} aria-label={label ? 'Profile picture' : undefined}>
      {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : <span className="font-display font-extrabold text-brand-700">{initials}</span>}
    </div>
  )
}

function initialsFor(name) {
  return String(name)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'S'
}
