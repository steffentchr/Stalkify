# Stalkify Setup Guide

## Phase 1, 2 & 3 Complete ✅

### What's Been Built

#### Phase 1: Foundation
- ✅ Next.js 14 with TypeScript and App Router
- ✅ PostgreSQL database with 7 tables via Prisma
- ✅ Redis for caching and job queues
- ✅ Docker Compose setup for local development
- ✅ Environment configuration

#### Phase 2: External APIs
- ✅ Last.fm API client with rate limiting (5 req/sec)
- ✅ Redis caching layer for Last.fm responses
- ✅ Spotify OAuth flow for admin authentication
- ✅ Spotify API client (search, playlists)
- ✅ Track matching with cache-first strategy

#### Phase 3: Background Jobs (BullMQ)
- ✅ Queue setup with Redis backend
- ✅ 4 worker processors with retry logic
- ✅ fetch-lastfm: Entry point, fetches all Last.fm data
- ✅ match-tracks: Matches tracks to Spotify (cache-first)
- ✅ sync-playlist: Creates/updates Spotify playlists
- ✅ auto-update: Keeps playlists fresh via cron
- ✅ Job progress tracking and error handling

## Getting Started

### 1. Start Docker Services

```bash
docker compose up -d
```

This starts PostgreSQL and Redis containers.

### 2. Get API Keys

#### Last.fm API Key
1. Go to https://www.last.fm/api/account/create
2. Create an API account
3. Copy the API Key

#### Spotify App Credentials
1. Go to https://developer.spotify.com/dashboard
2. Create a new app
3. Set Redirect URI to: `http://localhost:3000/api/auth/spotify/callback`
4. Copy Client ID and Client Secret

### 3. Configure Environment

Edit `.env.local`:

```bash
# Last.fm
LASTFM_API_KEY="your_lastfm_api_key"

# Spotify
SPOTIFY_CLIENT_ID="your_spotify_client_id"
SPOTIFY_CLIENT_SECRET="your_spotify_client_secret"
SPOTIFY_REDIRECT_URI="http://localhost:3000/api/auth/spotify/callback"
```

### 4. Authenticate Stalkify Spotify Account

**One-time setup:**

1. Start the dev server:
   ```bash
   npm run dev
   ```

2. Visit: http://localhost:3000/api/auth/spotify/authorize

3. Log in with the Spotify account that will own all Stalkify playlists

4. Authorize the app

5. You should see "Authorization Successful!" message

**Done!** The tokens are now stored in the database and will auto-refresh.

## Project Structure

```
stalkify/
├── src/
│   ├── app/
│   │   ├── api/auth/spotify/  # OAuth routes
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   └── lib/
│       ├── lastfm/
│       │   ├── cache.ts       # Redis caching
│       │   ├── client.ts      # API client
│       │   └── types.ts       # TypeScript types
│       ├── spotify/
│       │   ├── auth.ts        # OAuth & token management
│       │   ├── client.ts      # API client
│       │   ├── search.ts      # Track matching
│       │   └── types.ts       # TypeScript types
│       ├── prisma.ts          # Database client
│       └── redis.ts           # Redis client
├── prisma/
│   └── schema.prisma          # Database schema
├── docker-compose.yml
├── .env.local
└── package.json
```

## Database Schema

### Tables Created
1. **lastfm_users** - Last.fm user profiles
2. **playlists** - Spotify playlists (6 per user)
3. **playlist_tracks** - Tracks in playlists
4. **track_cache** - Last.fm → Spotify match cache
5. **user_artists** - Top artists from Last.fm
6. **processing_jobs** - Background job tracking
7. **spotify_auth** - OAuth tokens (singleton)

## API Clients

### Last.fm Client

```typescript
import { cachedLastfmClient } from '@/lib/lastfm/cache'

// Get recent tracks (cached for 5 minutes)
const tracks = await cachedLastfmClient.getRecentTracks('username', 20)

// Get top tracks for a period (cached for 1 hour)
const topTracks = await cachedLastfmClient.getTopTracks('username', '7day', 50)

// Get top artists (cached for 1 hour)
const artists = await cachedLastfmClient.getTopArtists('username', 'overall', 48)
```

### Spotify Client

```typescript
import { spotifyClient } from '@/lib/spotify/client'

// Search for a track
const track = await spotifyClient.searchTrack('Creep', 'Radiohead')

// Create a playlist
const playlist = await spotifyClient.createPlaylist(
  userId,
  'My Playlist',
  'Description',
  true // public
)

// Update playlist tracks
await spotifyClient.replacePlaylistTracks(playlistId, trackUris)
```

### Track Matching

```typescript
import { matchTrackToSpotify } from '@/lib/spotify/search'

// Cache-first matching (checks DB before API)
const result = await matchTrackToSpotify('Creep', 'Radiohead')

if (result.spotifyUri) {
  console.log('Match found:', result.spotifyUri)
  console.log('Confidence:', result.confidence)
  console.log('From cache:', result.fromCache)
}
```

## Background Workers

The workers process jobs asynchronously:

### Job Flow

```
1. User searches for Last.fm username
   ↓
2. fetch-lastfm job queued
   → Fetches recent + top tracks (6 periods)
   → Fetches top 48 artists
   → Creates 6 playlist records
   → Queues 6 match-tracks jobs
   ↓
3. match-tracks jobs (parallel)
   → Cache-first track matching
   → Stores matched tracks in DB
   → Queues sync-playlist job
   ↓
4. sync-playlist jobs (parallel)
   → Creates Spotify playlist
   → Adds matched tracks
   → Updates playlist metadata
   ↓
5. Complete! User sees 6 playlist links
```

### Starting Workers

In a separate terminal:

```bash
npm run worker        # Production
npm run worker:dev    # Development (watch mode)
```

Workers will process jobs from all 4 queues:
- `fetch-lastfm` - Entry point
- `match-tracks` - Track matching (runs in parallel)
- `sync-playlist` - Spotify sync (runs in parallel)
- `auto-update` - Cron-triggered updates

## Next Steps (Phase 4)

- [ ] Build frontend pages (landing, processing, results)
- [ ] Create API routes for user lookup
- [ ] Implement status polling
- [ ] Add auto-redirect when complete

## Useful Commands

```bash
# Development
npm run dev                 # Start dev server
npm run worker:dev         # Start worker in watch mode

# Database
npm run db:studio          # Open Prisma Studio
docker exec -it stalkify-postgres psql -U postgres -d stalkify

# Docker
docker compose up -d       # Start services
docker compose down        # Stop services
docker compose logs -f     # View logs
```

## Testing the APIs

You can test the clients once you've set up your API keys:

```bash
npm run dev
```

Then create a test file or use the Next.js API routes to verify everything works.
