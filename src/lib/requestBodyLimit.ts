import { NextResponse } from 'next/server'

export function rejectLargeRequestBody(req: Request, maxBytes: number): NextResponse | null {
  const rawLength = req.headers.get('content-length')
  if (!rawLength) return null

  const length = Number(rawLength)
  if (!Number.isFinite(length) || length < 0) {
    return NextResponse.json({ error: 'invalid request size' }, { status: 400 })
  }

  if (length > maxBytes) {
    return NextResponse.json({ error: 'request body too large' }, { status: 413 })
  }

  return null
}
