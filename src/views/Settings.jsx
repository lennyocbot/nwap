import { useRef, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import { cx, downloadJSON, subjectColors } from '../lib/utils.js'

export default function Settings() {
  const { state, setSettings, setUser, showToast, reset, replaceAll } = useApp()
  const [showKey, setShowKey] = useState(false)
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

      <Section title="AI" icon="sparkle">
        <Field label="Provider">
          <div className="flex gap-2">
            {[
              { k: 'anthropic', label: 'Anthropic (Claude)' },
              { k: 'openai',    label: 'OpenAI' },
              { k: 'mock',      label: 'Offline demo' },
            ].map((p) => (
              <button key={p.k} onClick={() => setSettings({ aiProvider: p.k })}
                className={cx('btn-soft', state.settings.aiProvider === p.k && 'ring-2 ring-brand-400')}>{p.label}</button>
            ))}
          </div>
        </Field>
        <Field label="Model">
          <input className="input" value={state.settings.aiModel} onChange={(e) => setSettings({ aiModel: e.target.value })}
            placeholder={state.settings.aiProvider === 'anthropic' ? 'claude-opus-4-7' : 'gpt-4o-mini'} />
          <div className="text-xs text-ink-500 mt-1">
            Default Anthropic model: <code>claude-opus-4-7</code>. Other suggestions: <code>claude-sonnet-4-6</code>, <code>claude-haiku-4-5-20251001</code>.
          </div>
        </Field>
        <Field label="API key">
          <div className="flex gap-2">
            <input className="input font-mono" type={showKey ? 'text' : 'password'}
              value={state.settings.aiKey} onChange={(e) => setSettings({ aiKey: e.target.value })}
              placeholder={state.settings.aiProvider === 'anthropic' ? 'sk-ant-…' : 'sk-…'} />
            <button className="btn-ghost" onClick={() => setShowKey((v) => !v)}>{showKey ? 'Hide' : 'Show'}</button>
          </div>
          <div className="text-xs text-ink-500 mt-1">
            Stored only on this device. Requests go directly from your browser to the provider.
            For Anthropic, this uses <code>anthropic-dangerous-direct-browser-access</code>.
          </div>
        </Field>
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
        <div className="text-xs text-ink-500 mt-2">All data is stored in your browser. Export regularly if this device matters.</div>
      </Section>

      <div className="text-center text-xs text-ink-400 pt-4">
        ScholarAI · Install to iPad via Safari → Share → Add to Home Screen.
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
