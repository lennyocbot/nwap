import { json, methodNotAllowed } from '../../_shared/responses.js'
import { rateLimit, requireUser, supabaseRest } from '../../_shared/supabase.js'

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return methodNotAllowed()
  try {
    await rateLimit(env, request, 'push-unsubscribe', 10)
    const user = await requireUser(request, env)
    const body = await request.json().catch(() => ({}))
    const endpoint = body.endpoint
    if (endpoint) {
      await supabaseRest(env, `push_subscriptions?user_id=eq.${user.id}&endpoint=eq.${encodeURIComponent(endpoint)}`, {
        method: 'DELETE',
      })
    }
    return json({ ok: true })
  } catch (error) {
    return json({ error: error.message || 'Could not unsubscribe' }, error.status || 500)
  }
}
