import { useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from './Icons.jsx'

export default function Onboarding() {
  const { state, account, signIn, signUp, signOut, setUser, setSettings, showToast } = useApp()
  const [step, setStep] = useState(0)
  const [authMode, setAuthMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState(state.user.name === 'Student' ? '' : state.user.name)
  const [year, setYear] = useState(state.user.year || 'A-level')
  const [busy, setBusy] = useState(false)
  const [authMessage, setAuthMessage] = useState('')

  const finish = () => {
    setUser({ name: name.trim() || 'Student', year: year.trim() || 'A-level' })
    setSettings({ onboardingComplete: true })
    showToast('Welcome to Syllabi', 'success')
  }

  const doSignIn = async (event) => {
    event.preventDefault()
    if (!email.trim() || !password.trim()) return
    setBusy(true)
    setAuthMessage('')
    try {
      const result = authMode === 'signup'
        ? await signUp(email.trim(), password)
        : await signIn(email.trim(), password)
      if (result?.ok) setStep(2)
      else if (result?.needsEmailConfirmation) setAuthMessage('Check your email to confirm your account, then return here and sign in.')
      else setAuthMessage(result?.error || 'Could not sign in yet.')
    } finally {
      setBusy(false)
    }
  }

  const switchAccount = async () => {
    setBusy(true)
    try {
      await signOut()
      setEmail('')
      setPassword('')
      setAuthMessage('Signed out. Enter the new account details to continue.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[radial-gradient(circle_at_top,#dfe8ff_0%,#f7faff_42%,#eef4ff_100%)] dark:bg-[radial-gradient(circle_at_top,#1c2d62_0%,#09142c_55%,#050b18_100%)]">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="liquid-glass-strong w-full max-w-xl rounded-[30px] p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-[20px] bg-white shadow-card ring-1 ring-brand-100 flex items-center justify-center overflow-hidden">
              <img src="/icon-192.png" alt="" className="w-11 h-11 object-cover" />
            </div>
            <div>
              <div className="text-xs text-ink-500">Step {step + 1} of 4</div>
              <div className="font-display text-xl font-extrabold">Set up Syllabi</div>
            </div>
          </div>

          <div className="h-2 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden mb-6">
            <div className="h-full bg-brand-600 transition-all" style={{ width: `${((step + 1) / 4) * 100}%` }} />
          </div>

          {step === 0 && (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-3xl font-extrabold tracking-tight">Your study command center.</h1>
                <p className="mt-3 text-ink-600 dark:text-ink-300">
                  Notes, assignments, timetable, revision, files, habits, and AI tools in one workspace that follows you across devices.
                </p>
              </div>
              <div className="rounded-3xl bg-brand-50 p-4 text-sm text-brand-900 ring-1 ring-brand-100 dark:bg-brand-900/30 dark:text-brand-100 dark:ring-brand-800">
                Your AI tools, timetable, notes, assignments, revision, and files are ready as soon as you enter.
              </div>
              <button className="btn-primary w-full" onClick={() => setStep(1)}>
                Continue <Icon.chevron className="w-4 h-4" />
              </button>
            </div>
          )}

          {step === 1 && account.user && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-2xl font-bold">You're already signed in</h2>
                <p className="mt-2 text-sm text-ink-500">
                  This browser is currently connected to the cloud workspace for:
                </p>
              </div>
              <div className="rounded-3xl bg-brand-50 p-4 text-sm text-brand-900 ring-1 ring-brand-100 dark:bg-brand-900/30 dark:text-brand-100 dark:ring-brand-800">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">Active account</div>
                <div className="mt-1 font-semibold break-all">{account.user.email}</div>
              </div>
              <button className="btn-primary w-full" type="button" onClick={() => setStep(2)}>
                Continue as {account.user.email}
              </button>
              <button className="btn-soft w-full" type="button" onClick={switchAccount} disabled={busy}>
                {busy ? 'Signing out...' : 'Use a different account'}
              </button>
              {authMessage && (
                <div className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-100 dark:bg-amber-900/20 dark:text-amber-100 dark:ring-amber-800">
                  {authMessage}
                </div>
              )}
            </div>
          )}

          {step === 1 && !account.user && (
            <form className="space-y-4" onSubmit={doSignIn}>
              <div>
                <h2 className="font-display text-2xl font-bold">Create your cloud workspace</h2>
                <p className="mt-2 text-sm text-ink-500">Sign in to sync your dashboard between iPad, laptop, and school computers.</p>
              </div>
              <div className="inline-flex w-full rounded-2xl bg-ink-100 p-1 text-sm dark:bg-ink-800">
                <button
                  type="button"
                  className={`flex-1 rounded-xl px-4 py-2 font-semibold transition ${authMode === 'signin' ? 'bg-white text-brand-700 shadow-sm dark:bg-ink-900 dark:text-brand-100' : 'text-ink-500'}`}
                  onClick={() => { setAuthMode('signin'); setAuthMessage('') }}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-xl px-4 py-2 font-semibold transition ${authMode === 'signup' ? 'bg-white text-brand-700 shadow-sm dark:bg-ink-900 dark:text-brand-100' : 'text-ink-500'}`}
                  onClick={() => { setAuthMode('signup'); setAuthMessage('') }}
                >
                  Create account
                </button>
              </div>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
              <button className="btn-primary w-full" disabled={busy || !email.trim() || !password.trim()}>
                {busy ? 'Working...' : authMode === 'signup' ? 'Create account' : 'Sign in'}
              </button>
              {authMode === 'signup' && (
                <div className="text-xs text-ink-500">
                  After creating an account, confirm your email first. Syllabi will not open the cloud workspace until you sign in with a confirmed account.
                </div>
              )}
              {authMessage && (
                <div className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-100 dark:bg-amber-900/20 dark:text-amber-100 dark:ring-amber-800">
                  {authMessage}
                </div>
              )}
              <button className="btn-soft w-full" type="button" onClick={() => setStep(2)}>
                Continue in local demo mode
              </button>
              <div className="text-xs text-ink-500">Local demo mode stays on this device until you sign in.</div>
            </form>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-2xl font-bold">What should Syllabi call you?</h2>
                <p className="mt-2 text-sm text-ink-500">Keep it short. You can complete subjects, targets, reminders, and AI later.</p>
              </div>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
              <input className="input" value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year / grade" />
              <button className="btn-primary w-full" onClick={() => setStep(3)}>Continue</button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="text-center">
                <div className="w-16 h-16 rounded-[24px] bg-brand-600 text-white flex items-center justify-center mx-auto shadow-pop">
                  <Icon.check className="w-8 h-8" />
                </div>
                <h2 className="font-display text-2xl font-bold mt-4">You're in.</h2>
                <p className="mt-2 text-sm text-ink-500">
                  The Dashboard will show quick nudges for reminders, targets, and profile polish. None of it blocks studying.
                </p>
              </div>
              <button className="btn-primary w-full" onClick={finish}>Go to Dashboard</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
