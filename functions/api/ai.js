import { json, methodNotAllowed } from '../_shared/responses.js'
import { requireUser, supabaseRest } from '../_shared/supabase.js'

const MODELS = {
  normal: 'meta-llama/llama-3.3-70b-instruct',
  high: 'google/gemini-2.5-flash-lite',
}

const LIMITS = {
  high5hBoosts: 35,
  high168hBoosts: 175,
  high5hCost: 0.10,
  high168hCost: 0.50,
  normal5hRequests: 300,
  normal168hRequests: 1500,
  burstPerMinute: 10,
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return methodNotAllowed()

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const key = env.OPENROUTER_API_KEY
  if (!key) return json({ error: 'Server AI is not configured yet' }, 400)

  let user
  try {
    user = await requireUser(request, env)
  } catch (error) {
    return json({ error: 'Sign in to use Syllabi AI' }, 401)
  }

  const aiMode = body.aiMode === 'high' ? 'high' : 'normal'
  const model = env.OPENROUTER_MODEL || MODELS[aiMode]

  try {
    await checkBurst(env, user.id)
    const usage = await getUsage(env, user.id)
    const resetUsage = resetWindows(usage)
    const quotaError = quotaFor(resetUsage, aiMode)
    if (quotaError) return quotaResponse(quotaError)

    const result = await callOpenRouter({
      apiKey: key,
      model,
      system: body.system,
      messages: body.messages,
      json: body.json,
    })

    const usagePatch = usagePatchFromResult(resetUsage, result.usage, aiMode)
    await saveUsage(env, user.id, usagePatch)

    return json({
      text: result.text,
      usage: usageSummary(usagePatch, aiMode),
    })
  } catch (error) {
    if (error.status === 429) return json(error.body, 429)
    return json({ error: error.message || 'AI request failed' }, 500)
  }
}

async function callOpenRouter({ model, system, messages, json: wantsJson, apiKey }) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://syllabi.cc',
      'X-Title': 'Syllabi',
    },
    body: JSON.stringify({
      model,
      response_format: wantsJson ? { type: 'json_object' } : undefined,
      messages: [
        { role: 'system', content: wantsJson ? `${system}\n\nReturn ONLY valid JSON.` : system },
        ...(messages || []),
      ],
    }),
  })
  if (!res.ok) throw new Error(`OpenRouter error: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return {
    text: data.choices?.[0]?.message?.content || '',
    usage: data.usage || {},
  }
}

async function checkBurst(env, userId) {
  if (!env.AI_BURST_KV) return
  const key = `ai:${userId}:${Math.floor(Date.now() / 60000)}`
  const current = Number(await env.AI_BURST_KV.get(key)) || 0
  if (current >= LIMITS.burstPerMinute) {
    const error = new Error('Burst limit')
    error.status = 429
    error.body = {
      error: 'BURST_LIMIT',
      message: 'Slow down a little — try again in under a minute.',
      reset_in: 'under a minute',
    }
    throw error
  }
  await env.AI_BURST_KV.put(key, String(current + 1), { expirationTtl: 70 })
}

async function getUsage(env, userId) {
  const rows = await supabaseRest(env, `user_ai_usage?user_id=eq.${encodeURIComponent(userId)}&select=*`, {
    headers: { accept: 'application/json' },
  })
  if (rows?.[0]) return rows[0]
  const now = new Date().toISOString()
  const row = {
    user_id: userId,
    requests_total: 0,
    normal_requests_5hr: 0,
    normal_requests_168hr: 0,
    high_boosts_5hr: 0,
    high_boosts_168hr: 0,
    window_5hr_start: now,
    window_168hr_start: now,
    tokens_input_total: 0,
    tokens_output_total: 0,
    cost_usd_total: 0,
    cost_usd_5hr: 0,
    cost_usd_168hr: 0,
    updated_at: now,
  }
  await saveUsage(env, userId, row)
  return row
}

function resetWindows(row) {
  const now = Date.now()
  const fiveStart = new Date(row.window_5hr_start || now).getTime()
  const weekStart = new Date(row.window_168hr_start || now).getTime()
  const next = { ...row }
  if (!fiveStart || now - fiveStart >= 5 * 60 * 60 * 1000) {
    next.window_5hr_start = new Date(now).toISOString()
    next.normal_requests_5hr = 0
    next.high_boosts_5hr = 0
    next.cost_usd_5hr = 0
  }
  if (!weekStart || now - weekStart >= 168 * 60 * 60 * 1000) {
    next.window_168hr_start = new Date(now).toISOString()
    next.normal_requests_168hr = 0
    next.high_boosts_168hr = 0
    next.cost_usd_168hr = 0
  }
  return next
}

function quotaFor(row, aiMode) {
  if (aiMode === 'high') {
    if (Number(row.high_boosts_5hr) >= LIMITS.high5hBoosts || Number(row.cost_usd_5hr) >= LIMITS.high5hCost) {
      return { code: 'QUOTA_5HR', resetAt: addHours(row.window_5hr_start, 5) }
    }
    if (Number(row.high_boosts_168hr) >= LIMITS.high168hBoosts || Number(row.cost_usd_168hr) >= LIMITS.high168hCost) {
      return { code: 'QUOTA_WEEKLY', resetAt: addHours(row.window_168hr_start, 168) }
    }
  } else {
    if (Number(row.normal_requests_5hr) >= LIMITS.normal5hRequests) return { code: 'QUOTA_5HR', resetAt: addHours(row.window_5hr_start, 5) }
    if (Number(row.normal_requests_168hr) >= LIMITS.normal168hRequests) return { code: 'QUOTA_WEEKLY', resetAt: addHours(row.window_168hr_start, 168) }
  }
  return null
}

function usagePatchFromResult(row, usage, aiMode) {
  const input = Number(usage?.prompt_tokens || 0)
  const output = Number(usage?.completion_tokens || 0)
  const estimated = aiMode === 'high' && !input && !output
  const cost = aiMode === 'high'
    ? estimated ? 0.001 : (input / 1_000_000) * 0.10 + (output / 1_000_000) * 0.40
    : 0
  const patch = {
    ...row,
    requests_total: Number(row.requests_total || 0) + 1,
    tokens_input_total: Number(row.tokens_input_total || 0) + input,
    tokens_output_total: Number(row.tokens_output_total || 0) + output,
    cost_usd_total: Number(row.cost_usd_total || 0) + cost,
    updated_at: new Date().toISOString(),
  }
  if (aiMode === 'high') {
    patch.high_boosts_5hr = Number(row.high_boosts_5hr || 0) + 1
    patch.high_boosts_168hr = Number(row.high_boosts_168hr || 0) + 1
    patch.cost_usd_5hr = Number(row.cost_usd_5hr || 0) + cost
    patch.cost_usd_168hr = Number(row.cost_usd_168hr || 0) + cost
  } else {
    patch.normal_requests_5hr = Number(row.normal_requests_5hr || 0) + 1
    patch.normal_requests_168hr = Number(row.normal_requests_168hr || 0) + 1
  }
  return patch
}

async function saveUsage(env, userId, row) {
  await supabaseRest(env, 'user_ai_usage?on_conflict=user_id', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ ...row, user_id: userId }),
  })
}

function usageSummary(row, aiMode) {
  return {
    aiMode,
    high_boosts_5hr: Number(row.high_boosts_5hr || 0),
    high_boosts_168hr: Number(row.high_boosts_168hr || 0),
    high_limit_5hr: LIMITS.high5hBoosts,
    high_limit_168hr: LIMITS.high168hBoosts,
    reset_5hr_at: addHours(row.window_5hr_start, 5).toISOString(),
    reset_168hr_at: addHours(row.window_168hr_start, 168).toISOString(),
  }
}

function quotaResponse({ code, resetAt }) {
  const message = code === 'QUOTA_WEEKLY'
    ? `You've hit your weekly AI limit — resets in ${formatRemaining(resetAt)}.`
    : `You've used your AI boost for now — resets in ${formatRemaining(resetAt)}.`
  return json({
    error: code,
    message,
    reset_in: formatRemaining(resetAt),
    reset_at: resetAt.toISOString(),
  }, 429)
}

function addHours(value, hours) {
  return new Date(new Date(value).getTime() + hours * 60 * 60 * 1000)
}

function formatRemaining(date) {
  const ms = Math.max(0, date.getTime() - Date.now())
  const minutes = Math.ceil(ms / 60000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours < 24) return `${hours}h ${mins}m`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}
