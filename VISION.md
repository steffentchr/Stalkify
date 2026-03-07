# Stalkify

**Tagline:** Last.fm + Spotify bundled into goodness

## What It Is

Stalkify bridges Last.fm's listening history and Spotify's playlist ecosystem. Visit the site, enter any Last.fm username, and get a set of automatically-maintained Spotify playlists reflecting that user's listening taste — updated daily, no login required.

The product is deliberately frictionless: no account, no OAuth, no configuration. Just a username and a set of playlist links.

---

## Playlists Created

### Standard Playlists (6, auto-updating)

Named `@<username> / <period>` — e.g. `@steffentchr / all-time`

| Label | Feed Type | Content | Update Frequency |
|-------|-----------|---------|-----------------|
| live | RECENT | Last 20 scrobbles | Every update cycle |
| all-time | ALL_TIME | All-time top 50 tracks | Daily |
| this week | WEEKLY | Top 50 tracks, 7-day window | Daily |
| 3 months | THREE_MONTH | Top 50 tracks, 3-month window | Daily |
| 6 months | SIX_MONTH | Top 50 tracks, 6-month window | Daily |
| this year | YEARLY | Top 50 tracks, rolling 12 months | Daily |

### Year Playlists (per-year historical archive)

Named `@<username> / <year>` — e.g. `@steffentchr / 2019`

- Created on first process, covering every calendar year from account creation to now
- Top 100 tracks for each year, aggregated from full scrobble history
- Years with fewer than 10 unique tracks are skipped
- Current year updates daily; past years are static
- Displayed in reverse chronological order on the results page

---

## User Journey

1. **Visit** `stalkify.app/<username>` or enter a username on the landing page
2. **Processing screen** appears immediately — shows live status (step name + progress)
3. **Initial processing** takes a few minutes on first visit:
   - Fetches Last.fm data (recent + top tracks across all periods + top artists)
   - Creates Spotify playlists and begins filling them
   - Standard playlists become available as soon as tracks are matched
   - Year playlists are built in the background and appear on next visit
4. **Results page** shows the playlist table and top artist grid as soon as standard playlists are ready
5. **Return visits** show results immediately — no waiting state unless reprocessing

---

## Technical Architecture

### Stack

- **Frontend:** Next.js (App Router), React, plain CSS — no UI framework
- **Backend:** Next.js API routes + BullMQ worker processes
- **Database:** PostgreSQL via Prisma ORM
- **Queue/Cache:** Redis (BullMQ jobs + Last.fm API cache)
- **Deployment:** Railway (web + worker services)

### Worker Pipeline

Jobs flow through four queues:

```
fetch-lastfm → match-tracks → sync-playlist
                    ↑
              auto-update (daily scheduler)
```

**fetch-lastfm**: Entry point for a new or updating user. Fetches all Last.fm data, syncs the Spotify playlist index, creates empty playlists eagerly (so Spotify links are available immediately), queues match-tracks jobs.

**match-tracks**: Searches Spotify for each track by `track:<name> artist:<name>`. Stores matched URIs in DB. On completion, queues a sync-playlist job.

**sync-playlist**: Calls Spotify's replace-tracks API to fill the playlist. Marks the processing job COMPLETED once all standard playlists are synced (year playlists continue in background).

**auto-update**: Runs on a schedule, finds stale playlists (`nextUpdateAt < now`), and re-runs the fetch → match → sync pipeline for each.

### Spotify Playlist Index

An index table (`spotify_account_playlists`) tracks all playlists owned by the service's Spotify account. On each fetch-lastfm run:

1. Paginate through `/me/playlists` and upsert into the index
2. Build a name → ID map
3. For each playlist to create: if the name already exists in the map, reuse the existing playlist (clear and repopulate it); otherwise create a new one

This enables backward compatibility — playlists created by old versions of the service are automatically picked up and kept in sync.

### Rate Limiting

- **Spotify:** Queue-based slot reservation at ~2 req/s. 429 responses back off per `Retry-After`. 403 errors are hard failures (auth/allowlist issue, not rate limiting).
- **Last.fm:** Cached responses with 24h TTL for year scrobbles; shorter TTL for live data.
- **Worker concurrency:** fetch=2, match=3, sync=2 (configurable via env vars)

---

## Data Model (Key Entities)

- **LastfmUser** — tracks username, process count, last processed date
- **Playlist** — one row per playlist; holds feedType, year (for YEAR type), spotifyId, spotifyUri, trackCount, nextUpdateAt
- **PlaylistTrack** — one row per track per playlist; holds position, spotifyUri (null if unmatched)
- **UserArtist** — top 30 artists with Spotify image URLs and play counts
- **SpotifyAccountPlaylist** — index of all playlists on the Spotify account, keyed by name for deduplication
- **ProcessingJob** — tracks lifecycle of a fetch job (status, progress, currentStep, error)

---

## UI Design

- **Layout:** Fixed 380px centered container
- **Typography:** Helvetica/Arial, large uppercase logo (80px), clean table presentation
- **Colors:** Black/dark gray primary, sage green and mustard yellow accents
- **Components:**
  - Landing page: username input form + "Listen in" feed of recently processed users
  - Processing page: status message + animated spinner + live status table
  - Results page: playlist table (label → Spotify link) + top artist grid (images with play count overlay)

Visual design follows the legacy Stalkify service. Reference: `design-reference/` folder.

---

## Product Principles

- **Zero friction.** No account needed. Any Last.fm username works.
- **Always available.** Return visits show results instantly. Waiting states only appear during initial creation.
- **Idempotent.** Re-processing a user reuses existing Spotify playlists rather than creating duplicates.
- **Resilient.** Per-year failures don't abort the whole job. Year playlists build silently in the background.
- **Transparent.** Processing screen shows live step and progress so users know something is happening.

---

## Forward Direction

- **Public "listen in" feed** on the landing page — recently processed users as social proof / discovery
- **Shareable profile pages** that anyone can visit to follow that user's playlists
- **Collaborative playlists** — merge listening histories of two users
- **Notification support** — email or webhook when playlists update
- **Wider Last.fm compatibility** — loved tracks playlist, tag-based playlists
