import { useRef, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import { cx, downloadJSON, subjectColors } from '../lib/utils.js'

export default function Settings() {
  const { state, setSettings, setUser, showToast, reset, replaceAll, account, signIn, signOut } = useApp()
  const [showKey, setShowKey] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const fileRef = useRef(null)

  const doExport = () => {
    downloadJSON(state, `scholarai-${new Date().toISOString().slice(0, 10)}.json`)
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
            <div className="text-sm">
              Signed in as <span className="font-semibold">{account.user.email}</span>
            </div>
            <div className="text-xs text-ink-500">Sync status: {account.sync}</div>
            <button className="btn-soft" onClick={signOut}>Sign out</button>
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
            <div className="text-xs text-ink-500">
              {account.sync}. Your workspace syncs across devices after Supabase is connected. AI keys stay on this device.
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
              ? 'Get a key at openrouter.ai. It stays on this device unless you add OPENROUTER_API_KEY in Netlify.'
              : 'Stored only on this device. For deployed secrets, add the provider key in Netlify environment variables.'}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.settings.useServerProxy !== false}
            onChange={(e) => setSettings({ useServerProxy: e.target.checked })}
          />
          Use Netlify AI proxy when available
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
        ScholarAI - Install to iPad via Safari Share, then Add to Home Screen.
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
