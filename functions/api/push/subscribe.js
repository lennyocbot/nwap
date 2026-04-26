import { json, methodNotAllowed } from '../../_shared/responses.js'
import { rateLimit, requireUser, supabaseRest } from '../../_shared/supabase.js'

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return methodNotAllowed()
  try {
    await rateLimit(env, request, 'push-subscribe', 5)
    const user = await requireUser(request, env)
    const body = await request.json()
    if (!body.subscription?.endpoint) return json({ error: 'Missing push subscription' }, 400)

    await supabaseRest(env, 'push_subscriptions?on_conflict=endpoint', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        user_id: user.id,
        endpoint: body.subscription.endpoint,
        subscription: body.subscription,
        device_label: body.deviceLabel || 'Device',
        user_agent: body.userAgent || request.headers.get('user-agent') || '',
        last_seen_at: new Date().toISOString(),
      }),
    })

    const devices = await supabaseRest(env, `push_subscriptions?user_id=eq.${user.id}&select=id,endpoint,device_label,last_seen_at&order=last_seen_at.desc`)
    return json({ ok: true, devices: devices || [] })
  } catch (error) {
    return json({ error: error.message || 'Could not subscribe' }, error.status || 500)
  }
}
