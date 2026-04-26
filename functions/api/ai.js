import { json, methodNotAllowed } from '../_shared/responses.js'

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return methodNotAllowed()

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const provider = body.provider || 'openrouter'
  const key = env[`${provider.toUpperCase()}_API_KEY`]
  if (!key) return json({ error: 'Server AI is not configured yet' }, 400)

  try {
    if (provider === 'openrouter') return json(await callOpenRouter({ ...body, apiKey: key, defaultModel: env.OPENROUTER_MODEL }))
    if (provider === 'openai') return json(await callOpenAI({ ...body, apiKey: key }))
    if (provider === 'anthropic') return json(await callAnthropic({ ...body, apiKey: key }))
    return json({ error: `Unsupported provider: ${provider}` }, 400)
  } catch (error) {
    return json({ error: error.message || 'AI request failed' }, 500)
  }
}

async function callOpenRouter({ model, system, messages, json: wantsJson, apiKey, defaultModel }) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://syllabi.cc',
      'X-Title': 'Syllabi',
    },
    body: JSON.stringify({
      model: model || defaultModel || 'deepseek/deepseek-r1',
      response_format: wantsJson ? { type: 'json_object' } : undefined,
      messages: [
        { role: 'system', content: wantsJson ? `${system}\n\nReturn ONLY valid JSON.` : system },
        ...(messages || []),
      ],
    }),
  })
  if (!res.ok) throw new Error(`OpenRouter error: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return { text: data.choices?.[0]?.message?.content || '' }
}

async function callOpenAI({ model, system, messages, json: wantsJson, apiKey }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      response_format: wantsJson ? { type: 'json_object' } : undefined,
      messages: [{ role: 'system', content: system }, ...(messages || [])],
    }),
  })
  if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return { text: data.choices?.[0]?.message?.content || '' }
}

async function callAnthropic({ model, system, messages, json: wantsJson, apiKey }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || 'claude-3-5-sonnet-latest',
      max_tokens: 2048,
      system: wantsJson ? `${system}\n\nReturn ONLY valid JSON.` : system,
      messages: (messages || []).map((message) => ({ role: message.role, content: message.content })),
    }),
  })
  if (!res.ok) throw new Error(`Anthropic error: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return { text: (data.content || []).map((item) => item.text || '').join('') }
}
