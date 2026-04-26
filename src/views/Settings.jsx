import { useRef, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import { cx, downloadJSON, subjectColors } from '../lib/utils.js'

export default function Settings() {
  const { state, setSettings, setUser, showToast, reset, replaceAll, account, signIn, signOut, retrySync } = useApp()
  const [showKey, setShowKey] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const fileRef = useRef(null)

  const doExport = () => {
    downloadJSON(state, `syllabi-${new Date().toISOString().slice(0, 10)}.json`)
    showToast('Exported backup', 'success')
  }

  const doImport = async (ev) => {
    const f = ev.target.files?.[0]
    if (!f) return
    try {
      const text = await f.text()
      const data = JSON.parse(text)
      replaceAll(data)
      showToast('Imported backup', 'success')
    } catch {
      showToast('Invalid file', 'error')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const enableNotifications = async () => {
    if (!('Notification' in window)) {
      showToast('Browser notifications are not supported here', 'error')
      return
    }
    const permission = await Notification.requestPermission()
    if (permission === 'granted') {
      setSettings({ notifications: true })
      showToast('Reminders enabled', 'success')
      try { new Notification('Syllabi reminders enabled', { body: 'Assignment and flashcard reminders can now appear while the app is open.' }) } catch {}
    } else {
      setSettings({ notifications: false })
      showToast('Notifications were not enabled', 'info')
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <Section title="Profile" icon="subject">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
      </Section>

      <Section title="Appearance" icon="sparkle">
        <div className="flex flex-wrap gap-2">
          {['light', 'dark', 'system'].map((t) => (
            <button key={t} onClick={() => setSettings({ theme: t })}
              className={cx('btn-soft capitalize', state.settings.theme === t && 'ring-2 ring-brand-400')}>
              {t}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Account sync" icon="settings">
        {account.user ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-900/20">
              <div className="text-sm font-semibold">Cloud workspace</div>
              <div className="text-sm mt-1">
                Signed in as <span className="font-semibold">{account.user.email}</span>
              </div>
              <div className="text-xs text-ink-500 mt-1">This dashboard, notes, files, chats, and settings sync across devices.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
              <span className="chip">Sync: {account.sync}</span>
              {account.error && <span className="text-rose-600">{account.error}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-soft" onClick={retrySync} type="button">Retry sync</button>
              <button className="btn-soft" onClick={signOut} type="button">Sign out</button>
            </div>
          </div>
        ) : (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              signIn(email, password)
            }}
          >
            <Field label="Email">
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <button className="btn-primary">Sign in or create account</button>
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
              Local demo mode. Nothing here is shared across devices until you sign in. AI keys stay on this device and are never synced to Supabase.
            </div>
            <div className="text-xs text-ink-500">
              Status: {account.sync}
            </div>
          </form>
        )}
      </Section>

      <Section title="AI" icon="sparkle">
        <Field label="Provider">
          <div className="flex flex-wrap gap-2">
            {[
              { k: 'openrouter', label: 'OpenRouter' },
              { k: 'anthropic',  label: 'Anthropic' },
              { k: 'openai',     label: 'OpenAI' },
              { k: 'mock',       label: 'Offline demo' },
            ].map((p) => (
              <button key={p.k}
                onClick={() => setSettings({ aiProvider: p.k, aiModel: defaultModel(p.k) })}
                className={cx('btn-soft', state.settings.aiProvider === p.k && 'ring-2 ring-brand-400')}>
                {p.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Model">
          <input className="input font-mono" value={state.settings.aiModel}
            onChange={(e) => setSettings({ aiModel: e.target.value })}
            placeholder={defaultModel(state.settings.aiProvider)} />
          <div className="text-xs text-ink-500 mt-1">
            {state.settings.aiProvider === 'openrouter' && (
              <>
                Any model slug from openrouter.ai/models. Popular picks:{' '}
                {['anthropic/claude-opus-4', 'anthropic/claude-sonnet-4-5', 'openai/gpt-4o', 'google/gemini-2.5-pro', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-r1'].map((m) => (
                  <button key={m} className="font-mono underline text-brand-600 mr-2"
                    onClick={() => setSettings({ aiModel: m })}>{m}</button>
                ))}
              </>
            )}
            {state.settings.aiProvider === 'anthropic' && (
              <>Suggestions: {['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'].map((m) => (
                <button key={m} className="font-mono underline text-brand-600 mr-2" onClick={() => setSettings({ aiModel: m })}>{m}</button>
              ))}</>
            )}
            {state.settings.aiProvider === 'openai' && (
              <>Suggestions: {['gpt-4o', 'gpt-4o-mini', 'o3-mini'].map((m) => (
                <button key={m} className="font-mono underline text-brand-600 mr-2" onClick={() => setSettings({ aiModel: m })}>{m}</button>
              ))}</>
            )}
          </div>
        </Field>
        <Field label={state.settings.aiProvider === 'openrouter' ? 'OpenRouter API key' : 'API key'}>
          <div className="flex gap-2">
            <input className="input font-mono" type={showKey ? 'text' : 'password'}
              value={state.settings.aiKey} onChange={(e) => setSettings({ aiKey: e.target.value })}
              placeholder={state.settings.aiProvider === 'openrouter' ? 'sk-or-v1-...' : state.settings.aiProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...'} />
            <button className="btn-ghost" onClick={() => setShowKey((v) => !v)}>{showKey ? 'Hide' : 'Show'}</button>
          </div>
          <div className="text-xs text-ink-500 mt-1">
            {state.settings.aiProvider === 'openrouter'
              ? 'Paste your OpenRouter key here to enable Syllabi on this device. It is not synced to your account.'
              : 'Paste your API key here to enable Syllabi on this device. It is not synced to your account.'}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.settings.useServerProxy !== false}
            onChange={(e) => setSettings({ useServerProxy: e.target.checked })}
          />
          Use secure AI connection when available
        </label>
      </Section>

      <Section title="Pomodoro" icon="timer">
        <div className="grid grid-cols-3 gap-2">
          <Field label="Focus (min)">
            <input type="number" className="input" value={state.settings.pomodoro.focus}
              onChange={(e) => setSettings({ pomodoro: { ...state.settings.pomodoro, focus: Number(e.target.value) || 25 } })} />
          </Field>
          <Field label="Short break">
            <input type="number" className="input" value={state.settings.pomodoro.short}
              onChange={(e) => setSettings({ pomodoro: { ...state.settings.pomodoro, short: Number(e.target.value) || 5 } })} />
          </Field>
          <Field label="Long break">
            <input type="number" className="input" value={state.settings.pomodoro.long}
              onChange={(e) => setSettings({ pomodoro: { ...state.settings.pomodoro, long: Number(e.target.value) || 15 } })} />
          </Field>
        </div>
      </Section>

      <Section title="Reminders" icon="flag">
        <div className="rounded-2xl bg-ink-50 p-3 text-sm dark:bg-ink-800">
          Syllabi can send browser reminders for assignments due within 24 hours and flashcards due for review while the app is open.
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-soft" onClick={enableNotifications} type="button">
            <Icon.flag className="w-4 h-4" /> Enable browser reminders
          </button>
          <button className={cx('btn-soft', state.settings.notifications && 'ring-2 ring-brand-400')}
            onClick={() => setSettings({ notifications: !state.settings.notifications })}
            type="button">
            {state.settings.notifications ? 'Reminders on' : 'Reminders off'}
          </button>
        </div>
        <div className="text-xs text-ink-500">
          Browser permission: {typeof Notification === 'undefined' ? 'unsupported' : Notification.permission}
        </div>
      </Section>

      <Section title="Data" icon="files">
        <div className="flex flex-wrap gap-2">
          <button className="btn-soft" onClick={doExport}><Icon.download className="w-4 h-4" /> Export backup</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={doImport} />
          <button className="btn-soft" onClick={() => fileRef.current?.click()}><Icon.upload className="w-4 h-4" /> Import backup</button>
          <button className="btn-ghost text-rose-600" onClick={() => { if (confirm('Reset everything? This will restore sample data.')) reset() }}>
            <Icon.trash className="w-4 h-4" /> Reset app
          </button>
        </div>
        <div className="text-xs text-ink-500 mt-2">When signed in, app data syncs to your account. Backups are still useful before big edits.</div>
      </Section>

      <div className="text-center text-xs text-ink-400 pt-4">
        Syllabi - Install to iPad via Safari Share, then Add to Home Screen.
      </div>
    </div>
  )
}

function Section({ title, icon, children }) {
  const Ic = Icon[icon]
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        {Ic && <Ic className="w-4 h-4 text-ink-400" />}
        <h3 className="font-display font-semibold">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs text-ink-500 mb-1">{label}</div>
      {children}
    </div>
  )
}

function defaultModel(provider) {
  switch (provider) {
    case 'anthropic':  return 'claude-opus-4-7'
    case 'openai':     return 'gpt-4o-mini'
    case 'openrouter': return 'anthropic/claude-sonnet-4-5'
    default:           return ''
  }
}
