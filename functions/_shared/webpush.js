import webpush from 'web-push'

export function configureWebPush(env) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) throw new Error('VAPID keys are not configured')
  webpush.setVapidDetails(
    env.VAPID_SUBJECT || 'mailto:admin@syllabi.cc',
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  )
  return webpush
}

export async function sendPush(env, subscription, payload) {
  const push = configureWebPush(env)
  await push.sendNotification(subscription, JSON.stringify(payload), {
    TTL: 60 * 60,
    urgency: 'normal',
  })
}
