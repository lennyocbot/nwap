import { json, methodNotAllowed } from '../../_shared/responses.js'
import { rateLimit, requireUser, supabaseRest } from '../../_shared/supabase.js'
import { sendPush } from '../../_shared/webpush.js'

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return methodNotAllowed()
  try {
    await rateLimit(env, request, 'push-test', 5)
    const user = await requireUser(request, env)
    const subscriptions = await supabaseRest(env, `push_subscriptions?user_id=eq.${user.id}&select=id,subscription`)
    if (!subscriptions?.length) return json({ error: 'No push devices registered' }, 404)

    const payload = {
      title: 'Syllabi reminders are ready',
      body: 'This is a test notification from your study workspace.',
      tag: 'syllabi-test',
      route: 'dashboard',
      createdAt: new Date().toISOString(),
    }
    await Promise.allSettled(subscriptions.map((item) => sendPush(env, item.subscription, payload)))
    return json({ ok: true, sent: subscriptions.length })
  } catch (error) {
    return json({ error: error.message || 'Test notification failed' }, error.status || 500)
  }
}
