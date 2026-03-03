import { NextResponse } from 'next/server'
import { getAuthorizationUrl } from '@/lib/spotify/auth'

/**
 * Admin route to initiate Spotify OAuth flow
 * Visit this URL once to authenticate the Stalkify Spotify account
 */
export async function GET() {
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
