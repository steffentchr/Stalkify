import { NextRequest, NextResponse } from 'next/server'

/**
 * Returns a 401 response if ADMIN_USERNAME / ADMIN_PASSWORD are set and the
 * request does not supply matching Basic Auth credentials. Returns null when
 * the request is allowed through.
 */
export function checkBasicAuth(request: NextRequest): NextResponse | null {
  const user = process.env.ADMIN_USERNAME
  const pass = process.env.ADMIN_PASSWORD

  if (!user || !pass) return null // guard disabled

  const header = request.headers.get('authorization') ?? ''
  const [scheme, encoded] = header.split(' ')

  if (scheme?.toLowerCase() === 'basic' && encoded) {
    const [u, p] = Buffer.from(encoded, 'base64').toString().split(':')
    if (u === user && p === pass) return null
  }

  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Stalkify Admin"' },
  })
}
