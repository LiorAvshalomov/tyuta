# tyuta.net

A Hebrew-first writing and publishing platform. Mobile-first, RTL-native, with rich text editing, community features, moderation, and analytics.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Styling**: Tailwind CSS v4, mobile-first RTL
- **Editor**: TipTap (rich text)
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Realtime)
- **Charts**: Recharts (admin dashboard)
- **Hosting**: Vercel

## Local Development

### Prerequisites

- Node.js 20+
- npm
- A Supabase project

### Setup

```bash
# Install dependencies
npm install

# Copy env template and fill in values
cp .env.example .env.local

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Required Environment Variables

```env
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...          # public anon key
SUPABASE_SERVICE_ROLE_KEY=eyJ...              # server-only, never expose to client

# System user for inbox/notifications (required)
NEXT_PUBLIC_SYSTEM_USER_ID=<uuid>

# Admin access (comma-separated UUIDs)
ADMIN_USER_IDS=<uuid1>,<uuid2>

# External APIs (optional)
PIXABAY_API_KEY=<key>                         # auto cover images
DEEPL_API_KEY=<key>                           # Hebrew-to-English translation for image search
```

**Security notes:**

- `SUPABASE_SERVICE_ROLE_KEY` is server-only. Never prefix with `NEXT_PUBLIC_`.
- `.env.local` is in `.gitignore`. Never commit secrets.
- Only `NEXT_PUBLIC_*` vars are shipped to the browser.

## Scripts

| Command         | Description             |
| --------------- | ----------------------- |
| `npm run dev`   | Start dev server        |
| `npm run build` | Production build        |
| `npm run start` | Start production server |
| `npm run lint`  | Run ESLint              |

## Project Structure

```
src/
  app/                      # Next.js App Router pages
    admin/                  # Admin panel pages
    api/                    # API routes
      admin/                # Admin-only API (auth-gated)
      internal/pv/          # Analytics pageview ingestion
      health/               # Health check endpoint
      storage/              # File storage operations
    auth/                   # Auth pages (login, signup)
    write/                  # Post editor
  components/               # React components
    admin/                  # Admin-specific components
    analytics/              # Analytics client
    moderation/             # Moderation sync (ban/suspend)
  lib/                      # Shared utilities
    admin/                  # Admin auth & helpers
    auth/                   # User auth helpers
    rateLimit.ts            # In-memory rate limiter
    supabaseClient.ts       # Browser Supabase client
    moderation.ts           # Client-side moderation state
```

## Admin Panel

Accessible at `/admin` (requires `ADMIN_USER_IDS` env var). Features:

- **Dashboard**: Analytics charts (pageviews, sessions, users)
- **Users**: Search, suspend, ban, delete
- **Posts**: List, soft-delete, restore, purge
- **Reports**: User reports with resolution workflow
- **Inbox**: System message threads with users
- **Contact**: Contact form submissions
- **System**: Broadcast notifications to users

All admin API routes are gated by `requireAdminFromRequest` which verifies:

1. Valid Bearer token
2. User ID in `ADMIN_USER_IDS` allowlist

## Analytics

Pageviews are tracked via `POST /api/internal/pv`:

- Bot detection (user-agent filtering)
- Rate limited (60 req/min per IP)
- Session tracking via `pd_sid` cookie
- Stored in `analytics_sessions` + `analytics_pageviews` tables
- Dashboard aggregation via `GET /api/admin/dashboard`

## Health Check

`GET /api/health` returns:

```json
{ "status": "ok", "timestamp": "...", "services": { "supabase": "connected" } }
```

## Deployment (Vercel)

1. Connect repo to Vercel
2. Set all env vars in Vercel dashboard (see above)
3. Deploy via `git push` or Vercel CLI
4. Verify: `curl https://your-domain.com/api/health`

## Security

- **Auth**: Supabase JWT + RLS on all tables
- **Admin**: Server-side ID allowlist check
- **Headers**: CSP, HSTS, X-Frame-Options, etc. (via `next.config.ts`)
- **Rate limiting**: In-memory sliding window on analytics endpoint
- **Storage**: Post ownership verified before cover promotion
- **No secrets in client**: Service role key is server-only
