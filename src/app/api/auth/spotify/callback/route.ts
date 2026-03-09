import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, storeTokens } from '@/lib/spotify/auth'
import { checkBasicAuth } from '@/lib/basicAuth'

/**
 * Spotify OAuth callback handler
 * This receives the authorization code and exchanges it for tokens
 */
export async function GET(request: NextRequest) {
  const denied = checkBasicAuth(request)
  if (denied) return denied

  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const state = searchParams.get('state')

  if (error) {
    return new NextResponse(
      `
      <!DOCTYPE html>
      <html>
        <head><title>Stalkify - OAuth Error</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
          <h1>Authorization Failed</h1>
          <p>Error: ${error}</p>
          <p><a href="/">Return to homepage</a></p>
        </body>
      </html>
      `,
      {
        status: 400,
        headers: { 'Content-Type': 'text/html' },
      }
    )
  }

  if (!code) {
    return new NextResponse(
      `
      <!DOCTYPE html>
      <html>
        <head><title>Stalkify - OAuth Error</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
          <h1>Authorization Failed</h1>
          <p>No authorization code provided.</p>
          <p><a href="/api/auth/spotify/authorize">Try again</a></p>
        </body>
      </html>
      `,
      {
        status: 400,
        headers: { 'Content-Type': 'text/html' },
      }
    )
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code)

    // Store in database
    await storeTokens(tokens)

    return new NextResponse(
      `
      <!DOCTYPE html>
      <html>
        <head><title>Stalkify - OAuth Success</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
          <h1>✓ Authorization Successful!</h1>
          <p>Spotify account authenticated successfully.</p>
          <p>Stalkify can now create and manage playlists.</p>
          <p><a href="/">Go to homepage</a></p>
        </body>
      </html>
      `,
      {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }
    )
  } catch (error) {
    console.error('Error exchanging code for tokens:', error)

    return new NextResponse(
      `
      <!DOCTYPE html>
      <html>
        <head><title>Stalkify - OAuth Error</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
          <h1>Authorization Failed</h1>
          <p>Failed to exchange authorization code for tokens.</p>
          <p>Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
          <p><a href="/api/auth/spotify/authorize">Try again</a></p>
        </body>
      </html>
      `,
      {
        status: 500,
        headers: { 'Content-Type': 'text/html' },
      }
    )
  }
}
