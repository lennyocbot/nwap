export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
  })
}

export function methodNotAllowed() {
  return json({ error: 'Method not allowed' }, 405)
}
