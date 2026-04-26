import { json, methodNotAllowed } from '../../_shared/responses.js'
import { requireUser, supabaseRest } from '../../_shared/supabase.js'

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return methodNotAllowed()

  const checks = {
    supabaseUrl: Boolean(env.SUPABASE_URL),
    supabaseServiceRole: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    openRouterKey: Boolean(env.OPENROUTER_API_KEY),
    userSession: false,
    serviceRoleRest: false,
  }

  try {
    await requireUser(request, env)
    checks.userSession = true
  } catch (error) {
    return json({ ok: false, checks, error: 'Sign in before checking AI health' }, 401)
  }

  try {
    await supabaseRest(env, 'user_ai_usage?select=user_id&limit=1', {
      headers: { accept: 'application/json' },
    })
    checks.serviceRoleRest = true
  } catch (error) {
    return json({ ok: false, checks, error: error.message || 'Supabase service role check failed' }, 500)
  }

  if (!checks.openRouterKey) {
    return json({ ok: false, checks, error: 'OpenRouter key is missing on the server' }, 500)
  }

  return json({ ok: true, checks, modelRouting: 'server-side' })
}
