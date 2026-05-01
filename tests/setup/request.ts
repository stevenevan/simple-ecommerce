import { NextRequest } from 'next/server'

type JsonInit = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  contentLengthOverride?: string
}

export function makeJsonRequest(url: string, init: JsonInit = {}): NextRequest {
  const method = init.method ?? 'GET'
  const headers = new Headers({ 'content-type': 'application/json' })

  let body: BodyInit | undefined
  if (init.body !== undefined) {
    body = typeof init.body === 'string' ? init.body : JSON.stringify(init.body)
    const len = init.contentLengthOverride ?? String(Buffer.byteLength(body))
    headers.set('content-length', len)
  } else if (init.contentLengthOverride !== undefined) {
    headers.set('content-length', init.contentLengthOverride)
  }

  const req = new NextRequest(`http://test.local${url}`, {
    method,
    headers,
    body,
  })

  // Single failure point: confirm the content-length header survives
  // NextRequest construction. Architect-review directive.
  if (headers.has('content-length')) {
    const got = req.headers.get('content-length')
    if (got !== headers.get('content-length')) {
      throw new Error(
        `content-length not preserved by NextRequest: set ${String(headers.get('content-length'))}, got ${String(got)}`,
      )
    }
  }

  return req
}
