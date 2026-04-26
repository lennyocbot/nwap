import { supabase } from './supabase.js'

export function isStandalonePWA() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function isIPadSafari() {
  const ua = navigator.userAgent || ''
  const iPad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
  return iPad && safari
}

export function pushSupport() {
  return {
    supported: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    permission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
    standalone: isStandalonePWA(),
    ipadSafari: isIPadSafari(),
  }
}

export async function getSupabaseAccessToken() {
  if (!supabase) return ''
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

export async function subscribeToPush(deviceLabel = deviceName()) {
  const support = pushSupport()
  if (!support.supported) throw new Error('Push notifications are not supported in this browser.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted.')

  const publicKeyRes = await fetch('/api/push/public-key')
  if (!publicKeyRes.ok) throw new Error('Push service is not configured yet.')
  const { publicKey } = await publicKeyRes.json()
  if (!publicKey) throw new Error('Missing VAPID public key.')

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicKey),
    })
  }

  const token = await getSupabaseAccessToken()
  if (!token) throw new Error('Sign in before enabling synced push reminders.')
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      deviceLabel,
      userAgent: navigator.userAgent,
    }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Could not save push subscription.')
  return res.json()
}

export async function unsubscribeFromPush() {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  const token = await getSupabaseAccessToken()
  if (subscription && token) {
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })
  }
  if (subscription) await subscription.unsubscribe()
}

export async function sendTestPush() {
  const token = await getSupabaseAccessToken()
  if (!token) throw new Error('Sign in before sending a test notification.')
  const res = await fetch('/api/push/test', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Test notification failed.')
  return res.json()
}

function base64UrlToUint8Array(base64Url) {
  const padded = `${base64Url}${'='.repeat((4 - base64Url.length % 4) % 4)}`
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function deviceName() {
  const ua = navigator.userAgent || ''
  if (/iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iPad'
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/Android/.test(ua)) return 'Android'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Mac/.test(ua)) return 'Mac'
  return 'This device'
}
