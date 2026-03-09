import { NextRequest, NextResponse } from 'next/server'
import { getAuthorizationUrl } from '@/lib/spotify/auth'
import { checkBasicAuth } from '@/lib/basicAuth'

/**
 * Admin route to initiate Spotify OAuth flow
 * Visit this URL once to authenticate the Stalkify Spotify account
 */
export async function GET(request: NextRequest) {
  const denied = checkBasicAuth(request)
  if (denied) return denied
  try {
    const authUrl = getAuthorizationUrl('stalkify_admin')
    return NextResponse.redirect(authUrl)
  } catch (error) {
    console.error('Error generating authorization URL:', error)
    return NextResponse.json(
      { error: 'Failed to generate authorization URL' },
      { status: 500 }
    )
  }
}
