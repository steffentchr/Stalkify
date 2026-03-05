# Deploying Stalkify on Railway

Stalkify runs as four services on Railway: a Next.js web app, a BullMQ worker, PostgreSQL, and Redis.

## Architecture

```
                  ┌──────────────┐
  Browser ──────► │   Next.js    │ ◄──── API routes + frontend
                  │   (web)      │
                  └──────┬───────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
        ┌──────────┐ ┌───────┐ ┌──────────┐
        │ Postgres │ │ Redis │ │  Worker   │
        │          │ │       │ │ (BullMQ)  │
        └──────────┘ └───────┘ └──────────┘
```

## Step-by-step setup

### 1. Create a new Railway project

Go to [railway.com](https://railway.com) and create a new project.

### 2. Add PostgreSQL

- Click **+ New** → **Database** → **PostgreSQL**
- Railway provisions it automatically and sets `DATABASE_URL`

### 3. Add Redis

- Click **+ New** → **Database** → **Redis**
- Railway provisions it automatically and sets `REDIS_URL`

### 4. Deploy the web service

- Click **+ New** → **GitHub Repo** → select the `stalkify` repo
- Railway auto-detects Next.js and uses `railway.toml` for config
- This runs `npm run build && prisma db push` on deploy, then `npm run start`

Add these **environment variables** (Settings → Variables):

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | (auto-linked from PostgreSQL service) |
| `REDIS_URL` | (auto-linked from Redis service) |
| `LASTFM_API_KEY` | Your Last.fm API key |
| `SPOTIFY_CLIENT_ID` | Your Spotify app client ID |
| `SPOTIFY_CLIENT_SECRET` | Your Spotify app client secret |
| `SPOTIFY_REDIRECT_URI` | `https://stalkify.app/api/auth/spotify/callback` |
| `NODE_ENV` | `production` |

To link the database variables: click the variable value field, select **Reference** and pick the PostgreSQL/Redis service.

### 5. Deploy the worker service

- Click **+ New** → **GitHub Repo** → select the **same** `stalkify` repo again
- Go to **Settings** and override:
  - **Build Command**: `npm install && npx prisma generate`
  - **Start Command**: `npm run worker`
- Add the **same environment variables** as the web service (link the same PostgreSQL and Redis references)

### 6. Custom domain

- On the web service, go to **Settings** → **Networking** → **Custom Domain**
- Add `stalkify.app`
- Point your domain's DNS:
  - If using a root domain: CNAME to the Railway-provided domain (or use Railway's DNS instructions)
  - Railway handles TLS automatically

### 7. Spotify OAuth setup

After the first deploy:

1. Update your Spotify app's redirect URI to `https://stalkify.app/api/auth/spotify/callback`
2. Visit `https://stalkify.app/api/auth/spotify/authorize` to complete the OAuth flow
3. This stores the Spotify tokens in the database — both web and worker share them

## Environment variables reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `LASTFM_API_KEY` | Yes | [last.fm/api/account/create](https://www.last.fm/api/account/create) |
| `SPOTIFY_CLIENT_ID` | Yes | Spotify Developer Dashboard |
| `SPOTIFY_CLIENT_SECRET` | Yes | Spotify Developer Dashboard |
| `SPOTIFY_REDIRECT_URI` | Yes | OAuth callback URL |
| `NODE_ENV` | No | Set to `production` on Railway |
| `WORKER_CONCURRENCY` | No | Worker parallelism (default: 5) |

## Redeploying

Push to your main branch — Railway auto-deploys both services. The web service runs `prisma db push` on each deploy, so schema changes are applied automatically.

## Monitoring

- **Railway dashboard**: CPU, memory, and logs per service
- **Worker logs**: Show job processing in real-time
- **Prisma Studio**: Run locally with `DATABASE_URL=<railway-url> npx prisma studio` to inspect data
