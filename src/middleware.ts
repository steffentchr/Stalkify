import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const user = process.env.ADMIN_USERNAME
  const pass = process.env.ADMIN_PASSWORD

  if (!user || !pass) return NextResponse.next() // guard disabled

  const auth = request.headers.get('authorization') ?? ''
  const [scheme, encoded] = auth.split(' ')
  if (scheme?.toLowerCase() === 'basic' && encoded) {
    const [u, p] = Buffer.from(encoded, 'base64').toString().split(':')
    if (u === user && p === pass) return NextResponse.next()
  }

  return new NextResponse('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Stalkify Admin"' },
  })
}

export const config = {
  matcher: ['/admin/:path*'],
}
