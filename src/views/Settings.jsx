import { useRef, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import { cx, downloadJSON, subjectColors } from '../lib/utils.js'
import { pushSupport, sendTestPush, subscribeToPush, unsubscribeFromPush } from '../lib/push.js'

export default function Settings() {
  const { state, setSettings, setUser, showToast, reset, replaceAll, account, signIn, signOut, retrySync } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pushBusy, setPushBusy] = useState(false)
  const fileRef = useRef(null)
  const push = typeof window === 'undefined' ? { supported: false, permission: 'unsupported' } : pushSupport()
  const reminders = state.settings.reminders || {}

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
    setPushBusy(true)
    try {
      const data = await subscribeToPush()
      updateReminders({ enabled: true, devices: data.devices || reminders.devices || [] })
      showToast('Push reminders enabled', 'success')
    } catch (error) {
      showToast(error.message || 'Notifications were not enabled', 'error')
    } finally {
      setPushBusy(false)
    }
  }

  const disableNotifications = async () => {
    setPushBusy(true)
    try {
      await unsubscribeFromPush()
      updateReminders({ enabled: false })
      showToast('Push reminders disabled', 'success')
    } catch (error) {
      showToast(error.message || 'Could not disable reminders', 'error')
    } finally {
      setPushBusy(false)
    }
  }

  const testNotification = async () => {
    setPushBusy(true)
    try {
      await sendTestPush()
      showToast('Test notification sent', 'success')
    } catch (error) {
      showToast(error.message || 'Test notification failed', 'error')
    } finally {
      setPushBusy(false)
    }
  }

  const updateReminders = (patch) => setSettings({ reminders: { ...reminders, ...patch } })

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
        <div className="rounded-2xl bg-brand-50 p-3 text-sm text-ink-700 ring-1 ring-brand-100 dark:bg-brand-900/30 dark:text-brand-100 dark:ring-brand-800">
          Choose the interface style that works best for your eyes. System follows the device setting.
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'light', label: 'Light' },
            { key: 'dark', label: 'Dark' },
            { key: 'system', label: 'System' },
          ].map((theme) => (
            <button
              key={theme.key}
              className={cx('btn-soft', state.settings.theme === theme.key && 'ring-2 ring-brand-400')}
              onClick={() => setSettings({ theme: theme.key })}
              type="button"
            >
              {theme.label}
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
              Local demo mode. Nothing here is shared across devices until you sign in.
            </div>
            <div className="text-xs text-ink-500">
              Status: {account.sync}
            </div>
          </form>
        )}
      </Section>

      <Section title="AI" icon="sparkle">
        <div className="rounded-2xl bg-brand-50 p-3 text-sm text-brand-900 ring-1 ring-brand-100 dark:bg-brand-900/30 dark:text-brand-100 dark:ring-brand-800">
          Syllabi AI is built into this workspace. Choose the model you want it to use.
        </div>
        <Field label="Model">
          <input className="input font-mono" value={state.settings.aiModel}
            onChange={(e) => setSettings({ aiProvider: 'openrouter', aiModel: e.target.value })}
            placeholder={defaultModel()} />
          <div className="text-xs text-ink-500 mt-2">
            Popular picks:{' '}
            {[
              ['deepseek/deepseek-r1', 'DeepSeek R1'],
              ['anthropic/claude-sonnet-4-5', 'Claude Sonnet'],
              ['openai/gpt-4o', 'GPT-4o'],
              ['google/gemini-2.5-pro', 'Gemini Pro'],
              ['meta-llama/llama-3.3-70b-instruct', 'Llama 70B'],
            ].map(([model, label]) => (
              <button key={model} className="font-semibold underline text-brand-600 mr-2"
                onClick={() => setSettings({ aiProvider: 'openrouter', aiModel: model })}>{label}</button>
            ))}
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

      <Section title="Reminders" icon="flag">
        {push.ipadSafari && !push.standalone && (
          <div className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-100 dark:bg-amber-900/20 dark:text-amber-100 dark:ring-amber-800">
            Install Syllabi to your Home Screen to enable iPad notifications.
          </div>
        )}
        <div className="rounded-2xl bg-ink-50 p-3 text-sm dark:bg-ink-800">
          Syllabi can send reminders for deadlines, due flashcards, habit rescue, and your daily coach brief. Push reminders sync to signed-in devices.
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-soft" onClick={enableNotifications} disabled={pushBusy || !account.user} type="button">
            <Icon.flag className="w-4 h-4" /> {pushBusy ? 'Working...' : 'Enable push reminders'}
          </button>
          <button className="btn-soft" onClick={testNotification} disabled={pushBusy || !account.user || push.permission !== 'granted'} type="button">
            Send test
          </button>
          <button className={cx('btn-soft', reminders.enabled && 'ring-2 ring-brand-400')}
            onClick={() => reminders.enabled ? disableNotifications() : updateReminders({ enabled: true })}
            disabled={pushBusy}
            type="button">
            {reminders.enabled ? 'Reminders on' : 'Reminders off'}
          </button>
        </div>
        {!account.user && <div className="text-xs text-amber-700 dark:text-amber-200">Sign in before enabling synced push reminders.</div>}
        <div className="grid grid-cols-2 gap-2">
          {[
            ['assignments', 'Assignment deadlines'],
            ['flashcards', 'Flashcards due'],
            ['habits', 'Habit rescue'],
            ['coach', 'Daily coach brief'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 rounded-2xl bg-ink-50 px-3 py-2 text-sm dark:bg-ink-800">
              <input type="checkbox" checked={reminders[key] !== false} onChange={(e) => updateReminders({ [key]: e.target.checked })} />
              {label}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Field label="Quiet from">
            <input className="input" type="time" value={reminders.quietStart || '21:30'} onChange={(e) => updateReminders({ quietStart: e.target.value })} />
          </Field>
          <Field label="Quiet until">
            <input className="input" type="time" value={reminders.quietEnd || '07:00'} onChange={(e) => updateReminders({ quietEnd: e.target.value })} />
          </Field>
          <Field label="Coach brief">
            <input className="input" type="time" value={state.settings.coachBriefTime || '07:00'} onChange={(e) => setSettings({ coachBriefTime: e.target.value })} />
          </Field>
        </div>
        <div className="text-xs text-ink-500">
          Browser permission: {push.permission}. Timezone: {reminders.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'}.
        </div>
        {(reminders.devices || []).length > 0 && (
          <div className="rounded-2xl bg-white/70 p-3 ring-1 ring-ink-100 dark:bg-ink-900/70 dark:ring-ink-800">
            <div className="text-xs font-semibold text-ink-500 mb-2">Devices</div>
            <div className="space-y-1 text-sm">
              {reminders.devices.map((device) => (
                <div key={device.id || device.endpoint} className="flex items-center justify-between gap-2">
                  <span>{device.device_label || device.deviceLabel || 'Device'}</span>
                  <span className="text-xs text-ink-500">{device.last_seen_at ? new Date(device.last_seen_at).toLocaleDateString() : 'active'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="text-xs text-ink-500">
          iPad notifications require Safari, iPadOS 16.4+, and opening Syllabi from the Home Screen icon.
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

function defaultModel() {
  return 'deepseek/deepseek-r1'
}
