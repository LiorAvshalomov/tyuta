# Admin Panel UI Spec (Hybrid: Linear/Vercel shell + Stripe/Shopify dashboard)

Project: PenDemic (Next.js App Router + TypeScript + Supabase)

## Non-negotiables

- Must NOT break existing admin functionality (all current /admin sections must keep working).
- Must NOT change business logic.
- Must NOT change DB schema, RLS, or existing RPC logic.
- No `any` in TS/TSX.
- Must be mobile-first and fully responsive.
- Avoid hydration issues (use existing ClientChrome patterns).
- Accessibility: keyboard focus styles, aria labels, proper button semantics.

## Current Admin Sections (must exist in new UI)

- סקירה (Dashboard / Overview)
- דיווחים (Reports)
- צור קשר (Contact)
- פוסטים (Posts)
- משתמשים (Users)
- אינבוקס (Inbox)
- הודעת מערכת (System Message)

## IA / Navigation

### Route structure (recommended)

- `/admin` -> redirects or renders Dashboard (סקירה)
- `/admin/reports` -> דיווחים
- `/admin/contact` -> צור קשר
- `/admin/posts` -> פוסטים
- `/admin/users` -> משתמשים
- `/admin/inbox` -> אינבוקס
- `/admin/system-message` -> הודעת מערכת

### Layout

Hybrid shell:

- Desktop: left sidebar (icon + label), topbar (search, quick actions, profile).
- Mobile: topbar + hamburger opens drawer sidebar.
- Content area uses consistent spacing and card patterns.

## Visual Style

### Shell (Linear/Vercel)

- Minimal, clean, premium
- Subtle borders, soft shadows (only where needed)
- Clear typography hierarchy
- Neutral palette, avoid over-coloring
- Consistent iconography (lucide icons preferred)

### Dashboard (Stripe/Shopify)

- KPI cards grid
- Clear section headings
- Graph blocks with filters
- “Insights” small callouts (optional)

## Dashboard: Data + Components

### Filters (top of dashboard)

- Date range picker: start/end
- Bucket selector: day/week/month
- Apply / Reset buttons
- Presets: Today / 7d / 30d / 90d

### KPI Cards (must)

- Pageviews
- Visits (sessions)
- Bounce rate
- Avg session duration (minutes)
- Unique users
- Signups
- Posts created/published/soft-deleted/purged
- Users suspended/banned
- Users purged (range)

### Graphs (must)

- Traffic: pageviews + visits (area/line combo)
- Active users: line
- Signups: bar
- Posts: stacked bar (created/published/soft-deleted)
  Optional:
- Purges: small line/bar chart

### States (must)

- Loading skeletons
- Empty states (“No data for selected range”)
- Error state with retry
- Disabled state when not admin

## Admin Section UX requirements (existing functionality preserved)

### Reports (דיווחים)

- List view: searchable, filter by status/date
- Details drawer/modal: report content, related post/user, actions
- Actions: resolve/unresolve, navigate to target, moderation action (if exists)

### Contact (צור קשר)

- List incoming messages
- Details view
- Actions: mark handled, reply flow (if exists), archive (only if already supported)

### Posts (פוסטים)

- Must keep all moderation actions working:
  - soft delete (moderated)
  - restore
  - hard purge (if exists)
- Add quality-of-life:
  - search by title/author/id
  - filters: status (published/deleted/moderated), date range
  - bulk select (only if safe and already supported—otherwise omit)

### Users (משתמשים)

- Must keep existing moderation actions:
  - suspend/unsuspend
  - ban/unban
  - full delete/purge (system)
- Add UI clarity:
  - status chips (active/suspended/banned/deleted)
  - confirm dialogs with clear copy

### Inbox (אינבוקס)

- Must keep existing thread/message flows working
- Improve UI: conversation list + message panel (desktop), single column (mobile)
- Unread badge counts (if available)

### System Message (הודעת מערכת)

- Must keep existing system message send/edit features
- Editor must remain stable (no hydration issues)
- Preview panel (optional)

## Technical constraints

- Use server components where possible, client components only for interactive parts.
- Prefer internal API aggregation routes for dashboard data (single fetch):
  - `/api/admin/dashboard?start=...&end=...&bucket=...`
- Do not call service role from client. Service role only in server route handlers.
- Keep existing auth redirect logic and admin checks intact.
- Do not modify RLS or policies.

## Component guidelines

- Shared components under `src/components/admin/*`
- Suggested components:
  - `AdminShell` (sidebar + topbar + content)
  - `AdminSidebar`
  - `AdminTopbar`
  - `KpiCard`
  - `ChartCard`
  - `DateRangeBar`
  - `AdminTable` (responsive)
  - `ConfirmDialog`
  - `EmptyState`
  - `Skeleton`

## Responsiveness rules

- Mobile-first:
  - Sidebar is drawer
  - Tables collapse to cards
  - Action buttons become dropdown/bottom-sheet
- Touch-friendly hit targets (>=44px)
- No horizontal scroll unless absolutely required

## “Do not touch”

- DB/RLS/SQL objects already added for analytics
- Existing moderation actions logic
- Auth redirect/cross-tab signout logic
- ClientChrome architecture (avoid hydration regressions)
