import { useMemo, useRef, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import Avatar from '../components/Avatar.jsx'
import { Icon } from '../components/Icons.jsx'
import { ACHIEVEMENTS, achievementStats } from '../lib/achievements.js'
import { supabase } from '../lib/supabase.js'
import { cx, fileToDataURL, uid } from '../lib/utils.js'

export default function Account() {
  const { state, setUser, account, signOut, retrySync, showToast } = useApp()
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const stats = useMemo(() => achievementStats(state), [state])
  const unlocked = new Map((state.achievements || []).map((achievement) => [achievement.id, achievement]))

  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('Choose an image for your profile picture', 'error')
      return
    }
    setUploading(true)
    try {
      const localData = await fileToDataURL(file)
      if (supabase && account.user) {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
        const path = `${account.user.id}/profile/avatar-${uid()}.${ext}`
        const { error } = await supabase.storage.from('user-files').upload(path, file, {
          contentType: file.type,
          upsert: true,
        })
        if (error) throw error
        setUser({ avatarStoragePath: path, avatarLocalData: localData })
      } else {
        setUser({ avatarLocalData: localData })
      }
      showToast('Profile picture updated', 'success')
    } catch (error) {
      showToast(error.message || 'Could not upload avatar', 'error')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const resetPassword = async () => {
    if (!supabase || !account.user?.email) {
      showToast('Sign in with Supabase first', 'info')
      return
    }
    const { error } = await supabase.auth.resetPasswordForEmail(account.user.email, {
      redirectTo: window.location.origin,
    })
    if (error) showToast(error.message, 'error')
    else showToast('Password reset email sent', 'success')
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <section className="card p-5 md:p-7">
        <div className="flex flex-col md:flex-row md:items-center gap-5">
          <Avatar className="w-24 h-24 rounded-[30px]" />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-ink-500">Account</div>
            <h2 className="font-display text-3xl font-extrabold tracking-tight">{state.user.name || 'Student'}</h2>
            <div className="mt-1 text-sm text-ink-500">
              {account.user?.email || 'Local demo workspace'} · {state.user.year || 'A-level'}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="chip">Sync: {account.sync}</span>
              {account.user ? <span className="chip text-emerald-700">Cloud workspace</span> : <span className="chip text-amber-700">Local demo</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadAvatar} />
            <button className="btn-soft" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Icon.upload className="w-4 h-4" /> {uploading ? 'Uploading...' : 'Profile picture'}
            </button>
            {account.user && <button className="btn-soft" onClick={retrySync}>Retry sync</button>}
            {account.user && <button className="btn-soft" onClick={resetPassword}>Reset password</button>}
            {account.user && <button className="btn-ghost text-rose-600" onClick={signOut}>Sign out</button>}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Study time" value={`${stats.studyMinutes}m`} icon="timer" />
        <Stat label="Assignments done" value={stats.assignmentsDone} icon="task" />
        <Stat label="Cards reviewed" value={stats.cardsReviewed} icon="cards" />
        <Stat label="Best streak" value={stats.habitStreak} icon="fire" />
        <Stat label="Notes" value={stats.notes} icon="note" />
        <Stat label="Files" value={stats.files} icon="files" />
        <Stat label="Mind maps" value={stats.mindmaps} icon="mindmap" />
        <Stat label="Grades" value={stats.grades} icon="grade" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Icon.subject className="w-4 h-4 text-ink-400" />
            <h3 className="font-display font-semibold">Profile</h3>
          </div>
          <div className="grid gap-3">
            <Field label="Name">
              <input className="input" value={state.user.name} onChange={(e) => setUser({ name: e.target.value })} />
            </Field>
            <Field label="School">
              <input className="input" value={state.user.school} onChange={(e) => setUser({ school: e.target.value })} />
            </Field>
            <Field label="Year / grade">
              <input className="input" value={state.user.year} onChange={(e) => setUser({ year: e.target.value })} />
            </Field>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Icon.grade className="w-4 h-4 text-ink-400" />
            <h3 className="font-display font-semibold">Achievements</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ACHIEVEMENTS.map((achievement) => {
              const item = unlocked.get(achievement.id)
              const Ic = Icon[achievement.icon] || Icon.grade
              return (
                <div key={achievement.id} className={cx(
                  'rounded-2xl border p-3 transition',
                  item ? 'border-brand-200 bg-brand-50 text-ink-900 dark:border-brand-800 dark:bg-brand-900/30 dark:text-ink-50' : 'border-ink-100 bg-white/60 opacity-70 dark:border-ink-800 dark:bg-ink-900/60'
                )}>
                  <div className="flex items-center gap-2">
                    <div className={cx('w-9 h-9 rounded-2xl flex items-center justify-center', item ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-400 dark:bg-ink-800')}>
                      <Ic className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold line-clamp-1">{achievement.name}</div>
                      <div className="text-xs text-ink-500 line-clamp-1">{item ? new Date(item.unlockedAt).toLocaleDateString() : achievement.detail}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value, icon }) {
  const Ic = Icon[icon]
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-ink-500">
        <Ic className="w-4 h-4" />
        <span className="text-xs">{label}</span>
      </div>
      <div className="font-display text-2xl font-extrabold mt-2">{value}</div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-xs text-ink-500 mb-1">{label}</div>
      {children}
    </label>
  )
}
