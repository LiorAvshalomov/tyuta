# CLAUDE.md - Tyuta Project Guide

## Architecture

- **Next.js 16 App Router** with TypeScript strict mode
- **Supabase** for auth, database (PostgreSQL), storage, and realtime
- **TipTap** rich text editor with custom metadata storage
- **Tailwind CSS v4**, mobile-first, RTL (Hebrew)
- **Vercel** deployment

## Do Not Break

1. **RLS policies** - All Supabase tables use Row Level Security. Never bypass.
2. **Auth flow** - Login/signup/signout with cross-tab sync and redirect hardening.
3. **Moderation system** - Ban/suspend flows with real-time sync (`SuspensionSync` component).
4. **Admin auth** - `requireAdminFromRequest()` gates all `/api/admin/*` routes.
5. **Analytics ingestion** - `POST /api/internal/pv` is rate-limited and bot-filtered.

## Key Conventions

- **No new npm packages** without explicit approval.
- **No `any` in TypeScript** - use proper types or `unknown` with type guards.
- **No TipTap Node extensions for metadata** - store structured data as JSON in doc content array.
- **Data fetching in page.tsx** - Editor is a pure UI component.
- **Boolean props** for visibility, not translated strings.

## Where Things Live

### Admin APIs (`src/app/api/admin/`)
All require `requireAdminFromRequest` (Bearer token + ADMIN_USER_IDS check).
- `dashboard/` - Analytics aggregation
- `users/` - ban, suspend, delete, search, status
- `posts/` - list, delete, restore, purge
- `reports/` - user reports CRUD
- `inbox/` - system-to-user messaging
- `contact/` - contact form submissions
- `system/send` - broadcast notifications

### Auth (`src/lib/auth/`)
- `requireUserFromRequest.ts` - Validates user JWT, returns RLS-scoped Supabase client
- `requireAdminFromRequest.ts` (in `lib/admin/`) - Admin-only equivalent with service role

### Analytics (`src/app/api/internal/pv/`)
- Ingests pageviews from `AnalyticsPageviewClient` component
- Rate limited via `src/lib/rateLimit.ts`
- Stores to `analytics_sessions` + `analytics_pageviews`
- Dashboard reads via `GET /api/admin/dashboard?start=&end=&bucket=`

### Moderation
- `src/components/moderation/SuspensionSync.tsx` - Polls `user_moderation` table, redirects banned/suspended users
- `src/lib/moderation.ts` - Client-side moderation state (sessionStorage)
- Ban/suspend API routes verify admin, update `user_moderation` table

## Known Gotchas

1. **`ClientChrome` / hydration** - Components using `usePathname()` or browser APIs must be client components.
2. **Editor `getPos()` TS errors** - Lines in `Editor.tsx` with `getPos()` calls have pre-existing TS errors from TipTap types. These don't affect the build.
3. **Supabase generic types** - Without generated DB types, `SupabaseClient<any, any, any>` is used in `requireAdminFromRequest.ts` (ESLint-suppressed). This is expected.
4. **`<img>` in Editor/RichText** - These components render user-generated content and must use native `<img>` (not `next/image`). ESLint warnings are expected.

## Security

- Service role key (`SUPABASE_SERVICE_ROLE_KEY`) is server-only, used in API routes only.
- Client gets only `NEXT_PUBLIC_SUPABASE_ANON_KEY` (RLS-restricted).
- Security headers configured in `next.config.ts` (CSP, HSTS, X-Frame-Options, etc.).
- Rate limiting on `/api/internal/pv` (in-memory, best-effort for Vercel serverless).
- All admin routes double-check: valid JWT + user ID in allowlist.
- Post ownership verified before storage operations.
