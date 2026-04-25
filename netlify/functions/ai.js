export default async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const provider = body.provider || 'openrouter'
  const key = Netlify.env.get(`${provider.toUpperCase()}_API_KEY`) || body.apiKey

  if (!key) {
    return json({ error: `Missing ${provider} API key` }, 400)
  }

  try {
    if (provider === 'openrouter') return json(await callOpenRouter({ ...body, apiKey: key }))
    if (provider === 'openai') return json(await callOpenAI({ ...body, apiKey: key }))
    if (provider === 'anthropic') return json(await callAnthropic({ ...body, apiKey: key }))
    return json({ error: `Unsupported provider: ${provider}` }, 400)
  } catch (error) {
    return json({ error: error.message || 'AI request failed' }, 500)
  }
}

export const config = {
  path: '/api/ai'
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

async function callOpenRouter({ model, system, messages, json: wantsJson, apiKey }) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://tomscholarai.netlify.app',
      'X-Title': 'ScholarAI'
    },
    body: JSON.stringify({
      model: model || 'anthropic/claude-sonnet-4-5',
      response_format: wantsJson ? { type: 'json_object' } : undefined,
      messages: [
        { role: 'system', content: wantsJson ? `${system}\n\nReturn ONLY valid JSON.` : system },
        ...(messages || [])
      ]
    })
  })

  if (!res.ok) throw new Error(`OpenRouter error: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return { text: data.choices?.[0]?.message?.content || '' }
}

async function callOpenAI({ model, system, messages, json: wantsJson, apiKey }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      response_format: wantsJson ? { type: 'json_object' } : undefined,
      messages: [{ role: 'system', content: system }, ...(messages || [])]
    })
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
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model || 'claude-3-5-sonnet-latest',
      max_tokens: 2048,
      system: wantsJson ? `${system}\n\nReturn ONLY valid JSON.` : system,
      messages: (messages || []).map((m) => ({ role: m.role, content: m.content }))
    })
  })

  if (!res.ok) throw new Error(`Anthropic error: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return { text: (data.content || []).map((c) => c.text || '').join('') }
}
