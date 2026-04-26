export async function requireUser(request, env) {
  const auth = request.headers.get('authorization') || ''
  if (!auth.toLowerCase().startsWith('bearer ')) throw new Error('Missing Supabase session')
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: auth,
    },
  })
  if (!res.ok) throw new Error('Invalid Supabase session')
  return res.json()
}

export async function supabaseRest(env, path, options = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`Supabase REST error ${res.status}: ${await res.text()}`)
  if (res.status === 204) return null
  return res.json().catch(() => null)
}

export async function rateLimit(env, request, key, limit, windowSeconds = 60) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown'
  const windowStart = Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds
  const id = `${key}:${ip}:${windowStart}`
  const encoded = encodeURIComponent(id)
  const existing = await supabaseRest(env, `api_rate_limits?key=eq.${encoded}&select=key,count`, {
    headers: { accept: 'application/json' },
  })
  const count = existing?.[0]?.count || 0
  if (count >= limit) {
    const error = new Error('Rate limit exceeded')
    error.status = 429
    throw error
  }
  await supabaseRest(env, 'api_rate_limits?on_conflict=key', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      key: id,
      count: count + 1,
      reset_at: new Date((windowStart + windowSeconds) * 1000).toISOString(),
    }),
  })
}
