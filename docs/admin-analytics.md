# Admin Analytics (DB + Ingestion) — PenDemic

This document describes the analytics foundation already implemented for the Admin Dashboard.
Claude/UI work must NOT re-create or change DB analytics objects unless explicitly requested.

## Goals
- Professional Admin Dashboard metrics:
  - Traffic: pageviews, visits (sessions), bounce rate, avg session duration, unique users
  - Users: signups, active users (DAU/WAU/MAU-style timeseries), suspended/banned totals, system purges
  - Content: posts created/published/soft-deleted, hard purges (moderation)

## Security / RLS Requirements
- RLS must remain enabled.
- Public/anon clients must NOT be allowed to insert directly into analytics tables (prevents spam).
- Ingestion is done server-side via Next.js Route Handler using SUPABASE_SERVICE_ROLE_KEY.
- Admin dashboard reads data via RPC functions guarded by `assert_admin()` and `SECURITY DEFINER`.

---

## Tables

### 1) `public.analytics_pageviews`
Stores each page view.

Columns:
- `id bigserial PK`
- `created_at timestamptz default now()`
- `user_id uuid null`
- `session_id uuid null`
- `path text not null`
- `referrer text null`
- `user_agent text null`
- `ip inet null`

RLS:
- enabled
- no public policies (deny by default)

Indexes:
- created_at desc
- (path, created_at desc)
- (user_id, created_at desc) where user_id is not null
- (session_id, created_at desc) where session_id is not null

### 2) `public.analytics_sessions`
Stores sessions (visits) for better metrics: visits, bounce, avg session duration, active users.

Columns:
- `session_id uuid PK`
- `created_at timestamptz default now()`
- `last_seen_at timestamptz default now()`
- `user_id uuid null`
- `first_path text null`
- `referrer text null`
- `user_agent text null`
- `ip inet null`

RLS:
- enabled
- no public policies

Indexes:
- created_at desc
- last_seen_at desc
- user_id where user_id is not null

### 3) `public.analytics_event_type` (ENUM) and `public.analytics_events`
Optional foundation for business events / funnels.

Important: Postgres on Supabase does NOT support `CREATE TYPE IF NOT EXISTS`.
Enum creation uses a DO block.

Event enum values:
- login, signup, logout
- post_created, post_published, post_soft_deleted, post_restored, post_purged
- comment_created, reaction_created
- user_soft_deleted, user_purged, user_suspended, user_banned

`public.analytics_events` columns:
- `id bigserial PK`
- `created_at timestamptz default now()`
- `event_type analytics_event_type not null`
- `user_id uuid null`
- `session_id uuid null`
- `post_id bigint null`
- `comment_id bigint null`
- `path text null`
- `metadata jsonb default '{}'`

RLS:
- enabled
- no public policies

Indexes:
- created_at desc
- (event_type, created_at desc)
- (user_id, created_at desc) where user_id is not null
- (session_id, created_at desc) where session_id is not null
- post_id where post_id is not null

---

## Admin RPC Functions

All functions below:
- use `SECURITY DEFINER`
- call `public.assert_admin()` internally
- support date range: `[p_start, p_end)`

### Core helpers
- `public.assert_admin() -> void`
  - ensures `auth.uid()` exists and user is in `public.admins`
- `public.admin_bucket_interval(p_bucket text) -> interval`
  - accepts: 'day' | 'week' | 'month'

### Timeseries
- `public.admin_pageviews_timeseries(p_start, p_end, p_bucket)`
  - returns bucket_start, pageviews, sessions, unique_users
- `public.admin_signups_timeseries(p_start, p_end, p_bucket)`
  - returns bucket_start, signups (from `public.profiles.created_at`)
- `public.admin_posts_timeseries(p_start, p_end, p_bucket)`
  - returns bucket_start, posts_created, posts_published, posts_soft_deleted
- `public.admin_post_purges_timeseries(p_start, p_end, p_bucket)`
  - counts `public.moderation_actions` where action='post_purged'
- `public.admin_user_purges_timeseries(p_start, p_end, p_bucket)`
  - counts `public.user_moderation_events` where action='purge_content'
- `public.admin_active_users_timeseries(p_start, p_end, p_bucket)`
  - counts distinct session.user_id per bucket from `analytics_sessions`
- `public.admin_events_timeseries(p_start, p_end, p_bucket, p_event_type)`
  - counts `analytics_events` by type (optional)

### KPI snapshot
- `public.admin_kpis_v2(p_start, p_end)`
  - pageviews, visits, bounce_rate, avg_session_minutes, unique_users, signups
  - posts created/published/soft-deleted/purged
  - users suspended/banned (current state)
  - users_purged (range)

---

## Ingestion (Next.js)

### Why endpoint path is NOT `/api/analytics/...`
Ad blockers may block URLs containing `analytics`.
We use a neutral internal endpoint.

### Endpoint
- `POST /api/internal/pv`

Server-side inserts:
- upsert `public.analytics_sessions` (update last_seen_at)
- insert `public.analytics_pageviews`

### Client hook
A client component posts pageview on route changes.

---

## Existing project integration notes
- The ingestion endpoint uses `SUPABASE_SERVICE_ROLE_KEY` (server-only).
- Must not expose service role to client.
- Admin dashboard UI should query via internal API routes or directly call RPC (prefer internal API aggregation).
- Do not change RLS policies or existing moderation/admin business logic.

---

## SQL Notes (Enum Creation)
If enum is needed and not created yet, use:

```sql
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'analytics_event_type'
      and n.nspname = 'public'
  ) then
    create type public.analytics_event_type as enum (
      'login',
      'signup',
      'logout',
      'post_created',
      'post_published',
      'post_soft_deleted',
      'post_restored',
      'post_purged',
      'comment_created',
      'reaction_created',
      'user_soft_deleted',
      'user_purged',
      'user_suspended',
      'user_banned'
    );
  end if;
end $$;
