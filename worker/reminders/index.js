import webpush from 'web-push'

export default {
  async fetch() {
    return Response.json({ ok: true, worker: 'syllabi-reminders' })
  },

  async scheduled(controller, env, ctx) {
    if (controller.cron === '*/15 * * * *') {
      ctx.waitUntil(runReminderSweep(env))
      return
    }
    ctx.waitUntil(runCoachSweep(env))
  },
}

async function runReminderSweep(env) {
  const rows = await rest(env, 'app_states?select=user_id,state')
  for (const row of rows || []) {
    const state = row.state || {}
    const reminders = state.settings?.reminders || {}
    if (reminders.enabled === false) continue
    if (isQuiet(reminders)) continue

    if (reminders.assignments !== false) await assignmentReminders(env, row.user_id, state)
    if (reminders.flashcards !== false) await flashcardReminders(env, row.user_id, state)
    if (reminders.habits === true) await habitReminders(env, row.user_id, state)
  }
}

async function runCoachSweep(env) {
  const rows = await rest(env, 'app_states?select=user_id,state')
  for (const row of rows || []) {
    const state = row.state || {}
    const reminders = state.settings?.reminders || {}
    if (reminders.enabled === false || reminders.coach === false) continue
    if (!isCoachTime(state.settings?.coachBriefTime || reminders.coachBriefTime || '07:00')) continue
    const key = `coach:${row.user_id}:${today()}`
    if (await delivered(env, key)) continue

    const brief = env.OPENROUTER_API_KEY ? await aiCoachBrief(env, state) : localCoachBrief(state)
    const nextState = upsertCoachBrief(state, brief)
    await rest(env, `app_states?user_id=eq.${row.user_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: nextState, updated_at: new Date().toISOString() }),
    })
    await sendToUser(env, row.user_id, {
      title: 'Your Syllabi coach brief is ready',
      body: brief.nextAction || brief.summary || 'Open Dashboard for your study plan.',
      tag: key,
      route: 'dashboard',
      createdAt: new Date().toISOString(),
    })
    await markDelivered(env, row.user_id, 'coach', today(), key)
  }
}

async function assignmentReminders(env, userId, state) {
  const now = Date.now()
  for (const assignment of state.assignments || []) {
    if (assignment.status === 'done' || !assignment.due) continue
    const hours = (new Date(assignment.due).getTime() - now) / 3600000
    const kind = hours <= 0 ? 'assignment-overdue' : hours <= 3 ? 'assignment-3h' : hours <= 24 ? 'assignment-24h' : ''
    if (!kind) continue
    const key = `${kind}:${userId}:${assignment.id}:${today()}`
    if (await delivered(env, key)) continue
    await sendToUser(env, userId, {
      title: hours <= 0 ? 'Assignment overdue' : 'Assignment due soon',
      body: `${assignment.title} ${hours <= 0 ? 'is overdue' : `is due in ${Math.ceil(hours)}h`}.`,
      tag: key,
      route: 'assignments',
      entityId: assignment.id,
      createdAt: new Date().toISOString(),
    })
    await markDelivered(env, userId, kind, assignment.id, key)
  }
}

async function flashcardReminders(env, userId, state) {
  const due = (state.flashcards || []).filter((card) => card.due <= Date.now()).length
  if (!due) return
  const key = `flashcards:${userId}:${today()}`
  if (await delivered(env, key)) return
  await sendToUser(env, userId, {
    title: 'Flashcards due',
    body: `${due} card${due === 1 ? '' : 's'} ready for review.`,
    tag: key,
    route: 'revision',
    createdAt: new Date().toISOString(),
  })
  await markDelivered(env, userId, 'flashcards', today(), key)
}

async function habitReminders(env, userId, state) {
  const date = today()
  const missed = (state.habits || []).filter((habit) => !habit.log?.[date])
  if (!missed.length) return
  const hour = new Date().getHours()
  if (hour < 17) return
  const key = `habits:${userId}:${date}`
  if (await delivered(env, key)) return
  await sendToUser(env, userId, {
    title: 'Habit rescue',
    body: `${missed[0].name} is still open today.`,
    tag: key,
    route: 'habits',
    createdAt: new Date().toISOString(),
  })
  await markDelivered(env, userId, 'habits', date, key)
}

async function sendToUser(env, userId, payload) {
  configurePush(env)
  const subscriptions = await rest(env, `push_subscriptions?user_id=eq.${userId}&select=id,subscription`)
  const settled = await Promise.allSettled((subscriptions || []).map((item) => (
    webpush.sendNotification(item.subscription, JSON.stringify(payload), { TTL: 3600 })
  )))
  await Promise.all(settled.map((result, index) => {
    if (result.status !== 'rejected') return null
    const status = result.reason?.statusCode
    if (status !== 404 && status !== 410) return null
    const id = subscriptions[index]?.id
    return id ? rest(env, `push_subscriptions?id=eq.${id}`, { method: 'DELETE' }) : null
  }).filter(Boolean))
}

function configurePush(env) {
  webpush.setVapidDetails(
    env.VAPID_SUBJECT || 'mailto:admin@syllabi.cc',
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  )
}

async function delivered(env, key) {
  const rows = await rest(env, `notification_deliveries?delivery_key=eq.${encodeURIComponent(key)}&select=id`)
  return Boolean(rows?.length)
}

async function markDelivered(env, userId, kind, entityId, key) {
  await rest(env, 'notification_deliveries', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, kind, entity_id: entityId, delivery_key: key }),
  })
}

async function rest(env, path, options = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=minimal',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`Supabase REST error ${res.status}: ${await res.text()}`)
  if (res.status === 204) return null
  return res.json().catch(() => null)
}

async function aiCoachBrief(env, state) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://syllabi.cc',
      'X-Title': 'Syllabi',
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4-5',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Create concise JSON for a student study coach brief. Return JSON only.' },
        { role: 'user', content: JSON.stringify(summaryState(state)).slice(0, 12000) },
      ],
    }),
  })
  if (!res.ok) return localCoachBrief(state)
  const data = await res.json()
  const parsed = safeJSON(data.choices?.[0]?.message?.content || '')
  return {
    id: `coach-${today()}`,
    date: today(),
    source: 'ai',
    title: parsed?.title || "Today's study brief",
    summary: parsed?.summary || 'Open Dashboard for your study plan.',
    priorities: (parsed?.priorities || []).slice(0, 4),
    risks: (parsed?.risks || []).slice(0, 4),
    nextAction: parsed?.nextAction || 'Start one focused block.',
    dismissed: false,
    createdAt: Date.now(),
  }
}

function localCoachBrief(state) {
  const open = (state.assignments || []).filter((assignment) => assignment.status !== 'done')
  const due = open.slice().sort((a, b) => new Date(a.due) - new Date(b.due))[0]
  const cards = (state.flashcards || []).filter((card) => card.due <= Date.now()).length
  return {
    id: `coach-${today()}`,
    date: today(),
    source: 'local',
    title: "Today's study brief",
    summary: due ? `${due.title} is your highest priority.` : 'No urgent assignment is blocking today.',
    priorities: [due ? `Work on ${due.title}` : 'Do one consolidation block', cards ? `Review ${cards} due flashcards` : 'Create or review one note'].filter(Boolean),
    risks: due ? [`${due.title} due ${new Date(due.due).toLocaleDateString()}`] : ['No urgent risk flagged'],
    nextAction: due ? `Start 25 minutes on ${due.title}.` : 'Choose one subject and revise for 25 minutes.',
    dismissed: false,
    createdAt: Date.now(),
  }
}

function upsertCoachBrief(state, brief) {
  const list = state.coachBriefs || []
  return {
    ...state,
    coachBriefs: list.some((item) => item.date === brief.date)
      ? list.map((item) => item.date === brief.date ? { ...item, ...brief, id: item.id || brief.id } : item)
      : [...list, brief],
  }
}

function summaryState(state) {
  return {
    user: state.user,
    subjects: state.subjects,
    assignments: (state.assignments || []).filter((item) => item.status !== 'done').slice(0, 12),
    flashcardsDue: (state.flashcards || []).filter((item) => item.due <= Date.now()).length,
    habits: state.habits,
    goals: state.goals,
    grades: state.grades,
    timetable: state.timetable,
  }
}

function isQuiet(reminders) {
  const start = minutes(reminders.quietStart || '21:30')
  const end = minutes(reminders.quietEnd || '07:00')
  const now = new Date()
  const current = now.getHours() * 60 + now.getMinutes()
  return start > end ? current >= start || current <= end : current >= start && current <= end
}

function isCoachTime(time) {
  const [hour] = String(time || '07:00').split(':').map(Number)
  return new Date().getHours() === hour
}

function minutes(time) {
  const [hour, minute] = String(time).split(':').map(Number)
  return (hour || 0) * 60 + (minute || 0)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function safeJSON(text) {
  try { return JSON.parse(text) } catch {}
  const match = text.match(/\{[\s\S]*\}/)
  if (match) {
    try { return JSON.parse(match[0]) } catch {}
  }
  return null
}
