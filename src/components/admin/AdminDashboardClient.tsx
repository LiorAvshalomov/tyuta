"use client";

import Link from "next/link";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Eye,
  MousePointerClick,
  ArrowUpRight,
  Clock,
  Users,
  UserPlus,
  FileText,
  BookOpen,
  Trash2,
  XCircle,
  UserX,
  Ban,
  UserMinus,
  Flag,
  Mail,
  RefreshCw,
  MessageCircle,
} from "lucide-react";

import { adminFetch } from "@/lib/admin/adminFetch";
import { getAdminErrorMessage } from "@/lib/admin/adminUi";
import { useAdminBadges } from "@/lib/admin/AdminBadgesContext";

/* ── palettes ── */

const P = {
  ink: "#1a1a18",
  slate: "#6b7a8d",
  mist: "#a1a1aa",
  emerald: "#4a7c59",
  amber: "#c4923a",
  red: "#b5534a",
  blue: "#2d5a8e",
  grid: "#e8e5df",
} as const;

const darkP = {
  ink: "#e4e4e7",
  slate: "#8a9ab0",
  mist: "#71717a",
  emerald: "#6dbb8a",
  amber: "#e0ad5a",
  red: "#e07470",
  blue: "#6496c8",
  grid: "#2a2a2a",
} as const;

/* ── types ── */

type Bucket = "day" | "week" | "month";

type DashboardKpis = {
  pageviews: number;
  visits: number;
  signedInVisits: number;
  guestVisits: number;
  bounceRate: number;
  avgSessionMinutes: number;
  uniqueUsers: number;
  signups: number;
  commentsTotal: number;
  postsCreated: number;
  postsPublished: number;
  postsSoftDeleted: number;
  postsPurged: number;
  usersSuspended: number;
  usersBanned: number;
  usersPurged: number;
};

type TrafficPoint = { bucketStart: string; pageviews: number; sessions: number; uniqueUsers: number };
type AudiencePoint = { bucketStart: string; signedInVisits: number; guestVisits: number; signedInUsers: number };
type SignupsPoint = { bucketStart: string; signups: number };
type CommentsPoint = { bucketStart: string; commentsTotal: number; repliesTotal: number };
type PostsPoint = { bucketStart: string; postsCreated: number; postsPublished: number; postsSoftDeleted: number; postsHardDeleted: number };
type PurgesPoint = { bucketStart: string; postsPurged: number; usersPurged: number };

type DashboardSeries = {
  traffic: TrafficPoint[];
  audience: AudiencePoint[];
  signups: SignupsPoint[];
  comments: CommentsPoint[];
  posts: PostsPoint[];
  purges: PurgesPoint[];
};

type DashboardResponse = {
  kpis?: unknown;
  series?: unknown;
  trafficSeries?: unknown;
  audienceSeries?: unknown;
  signupsSeries?: unknown;
  commentsSeries?: unknown;
  postsSeries?: unknown;
  purgesSeries?: unknown;
};

type AdminDashboardClientProps = {
  initialQuickCounts: {
    openReports: number | null
    openContact: number | null
  }
  initialRange: {
    bucket: Bucket
    start: string
    end: string
  }
  initialDash: { kpis: DashboardKpis; series: DashboardSeries } | null
  initialDashErr: string | null
}

/* ── utils ── */

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function formatInt(n: number): string {
  return new Intl.NumberFormat("he-IL").format(n);
}
function formatPct(n: number): string {
  return `${new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 }).format(n)}%`;
}
function formatMinutes(n: number): string {
  return new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 }).format(n);
}

function isoStartOfDay(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}
function isoEndOfDay(d: Date): string {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
}

function isSeriesEmpty<T extends Record<string, unknown>>(arr: T[], keys: Array<keyof T>): boolean {
  if (arr.length === 0) return true;
  return arr.every((row) => keys.every((k) => toNum(row[k]) === 0));
}

function fmtTick(iso: string | number): string {
  try {
    const d = new Date(String(iso));
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}`;
  } catch {
    return "";
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return hex;

  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ── normalization ── */

function normalizeDashboard(payload: DashboardResponse): { kpis: DashboardKpis; series: DashboardSeries } {
  const rawKpis = (payload.kpis ?? {}) as Record<string, unknown>;

  const kpis: DashboardKpis = {
    pageviews: toNum(rawKpis.pageviews ?? rawKpis.page_views),
    visits: toNum(rawKpis.visits ?? rawKpis.sessions ?? rawKpis.session_count),
    signedInVisits: toNum(rawKpis.signedInVisits ?? rawKpis.signed_in_visits),
    guestVisits: toNum(rawKpis.guestVisits ?? rawKpis.guest_visits),
    bounceRate: toNum(rawKpis.bounceRate ?? rawKpis.bounce_rate),
    avgSessionMinutes: toNum(rawKpis.avgSessionMinutes ?? rawKpis.avg_session_minutes),
    uniqueUsers: toNum(rawKpis.uniqueUsers ?? rawKpis.unique_users),
    signups: toNum(rawKpis.signups),
    commentsTotal: toNum(rawKpis.commentsTotal ?? rawKpis.comments_total),
    postsCreated: toNum(rawKpis.postsCreated ?? rawKpis.posts_created),
    postsPublished: toNum(rawKpis.postsPublished ?? rawKpis.posts_published),
    postsSoftDeleted: toNum(rawKpis.postsSoftDeleted ?? rawKpis.posts_soft_deleted),
    postsPurged: toNum(rawKpis.postsPurged ?? rawKpis.posts_purged),
    usersSuspended: toNum(rawKpis.usersSuspended ?? rawKpis.users_suspended),
    usersBanned: toNum(rawKpis.usersBanned ?? rawKpis.users_banned),
    usersPurged: toNum(rawKpis.usersPurged ?? rawKpis.users_purged),
  };

  const rawSeries = (payload.series ?? {}) as Record<string, unknown>;

  const trafficSrc = (rawSeries.traffic as unknown[]) ?? (payload.trafficSeries as unknown[]) ?? [];
  const audienceSrc = (rawSeries.audience as unknown[]) ?? (payload.audienceSeries as unknown[]) ?? [];
  const signupsSrc = (rawSeries.signups as unknown[]) ?? (payload.signupsSeries as unknown[]) ?? [];
  const commentsSrc = (rawSeries.comments as unknown[]) ?? (payload.commentsSeries as unknown[]) ?? [];
  const postsSrc = (rawSeries.posts as unknown[]) ?? (payload.postsSeries as unknown[]) ?? [];
  const purgesSrc = (rawSeries.purges as unknown[]) ?? (payload.purgesSeries as unknown[]) ?? [];

  const traffic: TrafficPoint[] = (Array.isArray(trafficSrc) ? trafficSrc : []).map((r) => {
    const row = (r ?? {}) as Record<string, unknown>;
    return {
      bucketStart: String(row.bucketStart ?? row.bucket_start ?? ""),
      pageviews: toNum(row.pageviews),
      sessions: toNum(row.sessions ?? row.visits),
      uniqueUsers: toNum(row.uniqueUsers ?? row.unique_users),
    };
  });

  const audience: AudiencePoint[] = (Array.isArray(audienceSrc) ? audienceSrc : []).map((r) => {
    const row = (r ?? {}) as Record<string, unknown>;
    return {
      bucketStart: String(row.bucketStart ?? row.bucket_start ?? ""),
      signedInVisits: toNum(row.signedInVisits ?? row.signed_in_visits),
      guestVisits: toNum(row.guestVisits ?? row.guest_visits),
      signedInUsers: toNum(row.signedInUsers ?? row.signed_in_users),
    };
  });

  const signups: SignupsPoint[] = (Array.isArray(signupsSrc) ? signupsSrc : []).map((r) => {
    const row = (r ?? {}) as Record<string, unknown>;
    return {
      bucketStart: String(row.bucketStart ?? row.bucket_start ?? ""),
      signups: toNum(row.signups),
    };
  });

  const comments: CommentsPoint[] = (Array.isArray(commentsSrc) ? commentsSrc : []).map((r) => {
    const row = (r ?? {}) as Record<string, unknown>;
    return {
      bucketStart: String(row.bucketStart ?? row.bucket_start ?? ""),
      commentsTotal: toNum(row.commentsTotal ?? row.comments_total),
      repliesTotal: toNum(row.repliesTotal ?? row.replies_total),
    };
  });

  const posts: PostsPoint[] = (Array.isArray(postsSrc) ? postsSrc : []).map((r) => {
    const row = (r ?? {}) as Record<string, unknown>;
    return {
      bucketStart: String(row.bucketStart ?? row.bucket_start ?? ""),
      postsCreated: toNum(row.postsCreated ?? row.posts_created),
      postsPublished: toNum(row.postsPublished ?? row.posts_published),
      postsSoftDeleted: toNum(row.postsSoftDeleted ?? row.posts_soft_deleted),
      postsHardDeleted: toNum(row.postsHardDeleted ?? row.posts_hard_deleted ?? row.postsPurged ?? row.posts_purged),
    };
  });

  const purges: PurgesPoint[] = (Array.isArray(purgesSrc) ? purgesSrc : []).map((r) => {
    const row = (r ?? {}) as Record<string, unknown>;
    return {
      bucketStart: String(row.bucketStart ?? row.bucket_start ?? ""),
      postsPurged: toNum(row.postsPurged ?? row.posts_purged),
      usersPurged: toNum(row.usersPurged ?? row.users_purged),
    };
  });

  return { kpis, series: { traffic, audience, signups, comments, posts, purges } };
}

/* ── presentational components ── */

const LABEL_MAP: Record<string, string> = {
  pageviews: "צפיות",
  sessions: "ביקורים",
  uniqueUsers: "ייחודיים",
  activeUsers: "פעילים",
  signups: "הרשמות",
  commentsTotal: "תגובות",
  repliesTotal: "תגובות תשובה",
  postsCreated: "נוצרו",
  postsPublished: "פורסמו",
  postsSoftDeleted: "נמחקו (soft)",
  postsHardDeleted: "נמחקו לצמיתות",
  postsPurged: "נמחקו לצמיתות",
  usersPurged: "משתמשים נוקו",
};

type TtPayloadEntry = { dataKey?: string | number; name?: string | number; value?: string | number; color?: string };
type TtProps = { active?: boolean; payload?: TtPayloadEntry[]; label?: string | number };
type ChartChip = { label: string; color: string };

const StyledTooltip = memo(function StyledTooltip({ active, payload, label }: TtProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[170px] rounded-2xl border border-neutral-200/90 dark:border-white/10 bg-white/95 dark:bg-neutral-950/95 px-3.5 py-3 shadow-[0_18px_40px_-22px_rgba(0,0,0,0.45)] backdrop-blur-md">
      <div className="mb-2 border-b border-neutral-200/70 pb-2 text-[11px] font-semibold tracking-[0.18em] text-neutral-500 dark:border-white/10 dark:text-muted-foreground">
        {fmtTick(String(label ?? ""))}
      </div>
      {payload.map((entry) => (
        <div key={String(entry.dataKey)} className="flex items-center gap-2.5 py-0.5 text-[12px] leading-5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full ring-4 ring-white/30 dark:ring-white/5"
            style={{ backgroundColor: String(entry.color ?? P.ink) }}
          />
          <span className="text-neutral-600 dark:text-muted-foreground">{LABEL_MAP[String(entry.dataKey)] ?? String(entry.name)}</span>
          <span className="mr-auto font-semibold text-neutral-950 dark:text-foreground">{formatInt(toNum(entry.value))}</span>
        </div>
      ))}
    </div>
  );
});

const ChartChips = memo(function ChartChips({ items }: { items?: ChartChip[] }) {
  if (!items?.length) return null;

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {items.map((item) => (
        <span
          key={`${item.label}-${item.color}`}
          className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold text-neutral-700 dark:text-neutral-200"
          style={{
            borderColor: hexToRgba(item.color, 0.18),
            backgroundColor: hexToRgba(item.color, 0.08),
          }}
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
});

function SkeletonCard() {
  return (
    <div className="h-[100px] animate-pulse rounded-xl border border-neutral-100 dark:border-border/50 bg-white dark:bg-card" />
  );
}

const KpiCard = memo(function KpiCard({
  label,
  value,
  sub,
  icon,
  accent = false,
  accentColor,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  accent?: boolean;
  accentColor?: string;
}) {
  return (
    <div
      className={
        "group relative overflow-hidden rounded-xl border bg-white dark:bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-shadow hover:shadow-md " +
        (accent ? "border-neutral-200 dark:border-border" : "border-neutral-100 dark:border-border/50")
      }
      style={accentColor ? { borderTop: `3px solid ${accentColor}` } : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-muted-foreground">{label}</span>
        {icon && (
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={accentColor ? { backgroundColor: `${accentColor}18`, color: accentColor } : { color: '#a1a1aa' }}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-foreground">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-neutral-400 dark:text-muted-foreground">{sub}</div>}
    </div>
  );
});

const DashChartCard = memo(function DashChartCard({
  title,
  subtitle,
  chips,
  children,
}: {
  title: string;
  subtitle?: string;
  chips?: ChartChip[];
  children: React.ReactNode;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-neutral-200/70 dark:border-border/60 bg-white/95 dark:bg-card/95 p-4 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.28)] sm:p-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.9),transparent_40%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_38%)]" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[28rem]">
          <h3 className="text-sm font-black tracking-tight text-neutral-900 dark:text-foreground">{title}</h3>
          {subtitle ? (
            <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <ChartChips items={chips} />
      </div>
      <div className="relative mt-4 h-[240px] w-full overflow-hidden rounded-2xl border border-neutral-200/70 bg-neutral-50/80 px-2 pt-2 dark:border-white/5 dark:bg-neutral-950/30 sm:h-[260px]">
        {children}
      </div>
    </div>
  );
});

function EmptyChart() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-neutral-300 dark:text-muted-foreground/30">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" /><path d="m7 16 4-8 4 4 4-6" />
      </svg>
      <span className="text-xs font-medium text-neutral-400 dark:text-muted-foreground/50">אין נתונים בטווח הנבחר</span>
    </div>
  );
}

const chartMargin = { top: 14, right: 10, left: -16, bottom: 6 };

/* ── retention panel ── */

type RetentionData = {
  dau: number
  wau: number
  mau: number
  d7_cohort: number
  d7_retained: number
  d30_cohort: number
  d30_retained: number
}

function retPct(retained: number, cohort: number): string {
  if (cohort === 0) return '—'
  return `${Math.round((retained / cohort) * 100)}%`
}

function RetentionStat({
  label,
  sub,
  value,
  pctRatio,
}: {
  label: string
  sub: string
  value: string
  pctRatio?: number
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] font-semibold text-neutral-500 dark:text-muted-foreground">{label}</div>
      <div className="text-xl font-extrabold tracking-tight text-neutral-900 dark:text-foreground">{value}</div>
      {pctRatio !== undefined && pctRatio >= 0 && (
        <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-muted/40">
          <div
            className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400 transition-[width] duration-500"
            style={{ width: `${Math.min(100, pctRatio * 100)}%` }}
          />
        </div>
      )}
      <div className="text-[10px] text-neutral-400 dark:text-muted-foreground">{sub}</div>
    </div>
  )
}

function RetentionPanel() {
  const [data, setData] = useState<RetentionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    adminFetch('/api/admin/retention')
      .then(async (res) => {
        const body = await res.json() as unknown
        if (!res.ok) throw new Error(getAdminErrorMessage(body, 'שגיאה בטעינת נתוני שימור'))
        if (!cancelled) setData(body as RetentionData)
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'שגיאה')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const d7ratio  = data && data.d7_cohort  > 0 ? data.d7_retained  / data.d7_cohort  : undefined
  const d30ratio = data && data.d30_cohort > 0 ? data.d30_retained / data.d30_cohort : undefined

  return (
    <div className="rounded-xl border border-neutral-100 dark:border-border/50 bg-white dark:bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black tracking-tight text-neutral-900 dark:text-foreground">שימור משתמשים</h3>
          <p className="mt-0.5 text-[11px] text-neutral-400 dark:text-muted-foreground">
            פעילים יומיים, שבועיים וחודשיים · שיעור חזרה אחרי 7 ו-30 יום
          </p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-neutral-100 dark:bg-muted/30" />
          ))}
        </div>
      ) : err ? (
        <div className="text-xs text-red-400 dark:text-red-500">{err}</div>
      ) : data ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-5">
          <RetentionStat label="פעילים יומיים" sub="היום" value={formatInt(data.dau)} />
          <RetentionStat label="פעילים שבועיים" sub="7 ימים אחרונים" value={formatInt(data.wau)} />
          <RetentionStat label="פעילים חודשיים" sub="30 ימים אחרונים" value={formatInt(data.mau)} />
          <RetentionStat
            label="שימור 7 ימים"
            sub={`${data.d7_retained} מתוך ${data.d7_cohort} שנרשמו לפני 7–14 יום`}
            value={retPct(data.d7_retained, data.d7_cohort)}
            pctRatio={d7ratio}
          />
          <RetentionStat
            label="שימור 30 יום"
            sub={`${data.d30_retained} מתוך ${data.d30_cohort} שנרשמו לפני 30–60 יום`}
            value={retPct(data.d30_retained, data.d30_cohort)}
            pctRatio={d30ratio}
          />
        </div>
      ) : null}
    </div>
  )
}

/* ── top profiles panel ── */

type TopProfileRow = {
  username: string
  display_name: string | null
  views: number
}

const TOP_PAGE_SIZE = 5

function TopProfilesPanel({ start, end }: { start: string; end: string }) {
  const [rows, setRows] = useState<TopProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ start, end, limit: '50' })
    adminFetch(`/api/admin/profiles/top?${params}`)
      .then(async (res) => {
        const body = await res.json() as unknown
        if (!res.ok) throw new Error(getAdminErrorMessage(body, 'שגיאה בטעינת פרופילים מובילים'))
        if (!cancelled) { setErr(null); setRows(Array.isArray(body) ? (body as TopProfileRow[]) : []); setPage(0) }
      })
      .catch((e: unknown) => { if (!cancelled) setErr(e instanceof Error ? e.message : 'שגיאה') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [start, end])

  const totalPages = Math.ceil(rows.length / TOP_PAGE_SIZE)
  const pageRows = rows.slice(page * TOP_PAGE_SIZE, (page + 1) * TOP_PAGE_SIZE)

  return (
    <div className="rounded-xl border border-neutral-100 dark:border-border/50 bg-white dark:bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-neutral-800 dark:text-foreground">פרופילים מובילים</h3>
          <p className="text-[11px] text-neutral-400 dark:text-muted-foreground mt-0.5">לפי צפיות בטווח הנבחר</p>
        </div>
        {loading && <RefreshCw size={13} className="animate-spin text-neutral-300 dark:text-muted-foreground/40" />}
      </div>
      {err ? (
        <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
          <Users size={22} strokeWidth={1.5} className="text-red-300 dark:text-red-500/50" />
          <p className="text-xs text-red-500 dark:text-red-400">{err}</p>
        </div>
      ) : !loading && rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
          <Users size={22} strokeWidth={1.5} className="text-neutral-200 dark:text-muted-foreground/30" />
          <p className="text-xs font-medium text-neutral-400 dark:text-muted-foreground">אין נתוני צפיות בטווח הנבחר</p>
          <p className="text-[11px] text-neutral-300 dark:text-muted-foreground/50">הנתונים יופיעו כשיצטברו צפיות בפרופילים</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-100 dark:border-border/40">
                  <th className="pb-2 text-start font-semibold text-neutral-400 dark:text-muted-foreground w-8">#</th>
                  <th className="pb-2 text-start font-semibold text-neutral-400 dark:text-muted-foreground">משתמש</th>
                  <th className="pb-2 text-end font-semibold text-neutral-400 dark:text-muted-foreground">צפיות</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, i) => (
                  <tr key={row.username} className="border-b border-neutral-50 dark:border-border/20 last:border-0 hover:bg-neutral-50 dark:hover:bg-muted/20 transition-colors">
                    <td className="py-2 text-neutral-300 dark:text-muted-foreground/40 font-mono">{page * TOP_PAGE_SIZE + i + 1}</td>
                    <td className="py-2 max-w-[200px]">
                      <Link
                        href={`/u/${row.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-neutral-800 dark:text-foreground hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {row.display_name ?? `@${row.username}`}
                      </Link>
                      <div className="text-[11px] text-neutral-400 dark:text-muted-foreground">@{row.username}</div>
                    </td>
                    <td className="py-2 text-end font-mono font-semibold text-neutral-700 dark:text-foreground">{formatInt(row.views)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between border-t border-neutral-100 dark:border-border/30 pt-2.5">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="text-[11px] px-2 py-1 rounded text-neutral-500 dark:text-muted-foreground hover:bg-neutral-100 dark:hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                הקודם
              </button>
              <span className="text-[11px] text-neutral-400 dark:text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="text-[11px] px-2 py-1 rounded text-neutral-500 dark:text-muted-foreground hover:bg-neutral-100 dark:hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                הבא
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ── top posts panel ── */

type TopPostRow = {
  post_id: string
  title: string
  slug: string
  author_username: string | null
  published_at: string | null
  views: number
  comments: number
  reactions: number
}

function TopPostsPanel({ start, end }: { start: string; end: string }) {
  const [rows, setRows] = useState<TopPostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ start, end, limit: '50' })
    adminFetch(`/api/admin/posts/top?${params}`)
      .then(async (res) => {
        const body = await res.json() as unknown
        if (!res.ok) throw new Error(getAdminErrorMessage(body, 'שגיאה בטעינת פוסטים מובילים'))
        if (!cancelled) { setErr(null); setRows(Array.isArray(body) ? (body as TopPostRow[]) : []); setPage(0) }
      })
      .catch((e: unknown) => { if (!cancelled) setErr(e instanceof Error ? e.message : 'שגיאה') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [start, end])

  const totalPages = Math.ceil(rows.length / TOP_PAGE_SIZE)
  const pageRows = rows.slice(page * TOP_PAGE_SIZE, (page + 1) * TOP_PAGE_SIZE)

  return (
    <div className="rounded-xl border border-neutral-100 dark:border-border/50 bg-white dark:bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-neutral-800 dark:text-foreground">פוסטים מובילים</h3>
          <p className="text-[11px] text-neutral-400 dark:text-muted-foreground mt-0.5">לפי צפיות בטווח הנבחר</p>
        </div>
        {loading && <RefreshCw size={13} className="animate-spin text-neutral-300 dark:text-muted-foreground/40" />}
      </div>
      {err ? (
        <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
          <FileText size={22} strokeWidth={1.5} className="text-red-300 dark:text-red-500/50" />
          <p className="text-xs text-red-500 dark:text-red-400">{err}</p>
        </div>
      ) : !loading && rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
          <FileText size={22} strokeWidth={1.5} className="text-neutral-200 dark:text-muted-foreground/30" />
          <p className="text-xs font-medium text-neutral-400 dark:text-muted-foreground">אין נתוני צפיות בטווח הנבחר</p>
          <p className="text-[11px] text-neutral-300 dark:text-muted-foreground/50">הנתונים יופיעו כשיצטברו צפיות בפוסטים</p>
        </div>
      ) : (
        <>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-100 dark:border-border/40">
                <th className="pb-2 text-start font-semibold text-neutral-400 dark:text-muted-foreground w-8">#</th>
                <th className="pb-2 text-start font-semibold text-neutral-400 dark:text-muted-foreground">כותרת</th>
                <th className="pb-2 text-start font-semibold text-neutral-400 dark:text-muted-foreground hidden sm:table-cell">מחבר</th>
                <th className="pb-2 text-end font-semibold text-neutral-400 dark:text-muted-foreground">צפיות</th>
                <th className="pb-2 text-end font-semibold text-neutral-400 dark:text-muted-foreground hidden sm:table-cell">תגובות</th>
                <th className="pb-2 text-end font-semibold text-neutral-400 dark:text-muted-foreground hidden sm:table-cell">ריאקציות</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, i) => (
                <tr key={row.post_id} className="border-b border-neutral-50 dark:border-border/20 last:border-0 hover:bg-neutral-50 dark:hover:bg-muted/20 transition-colors">
                  <td className="py-2 text-neutral-300 dark:text-muted-foreground/40 font-mono">{page * TOP_PAGE_SIZE + i + 1}</td>
                  <td className="py-2 max-w-[180px] sm:max-w-xs">
                    <Link
                      href={`/post/${row.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-neutral-800 dark:text-foreground hover:text-blue-600 dark:hover:text-blue-400 line-clamp-1"
                    >
                      {row.title}
                    </Link>
                  </td>
                  <td className="py-2 text-neutral-500 dark:text-muted-foreground hidden sm:table-cell">
                    {row.author_username ?? '—'}
                  </td>
                  <td className="py-2 text-end font-mono font-semibold text-neutral-700 dark:text-foreground">{formatInt(row.views)}</td>
                  <td className="py-2 text-end font-mono text-neutral-500 dark:text-muted-foreground hidden sm:table-cell">{formatInt(row.comments)}</td>
                  <td className="py-2 text-end font-mono text-neutral-500 dark:text-muted-foreground hidden sm:table-cell">{formatInt(row.reactions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between border-t border-neutral-100 dark:border-border/30 pt-2.5">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="text-[11px] px-2 py-1 rounded text-neutral-500 dark:text-muted-foreground hover:bg-neutral-100 dark:hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              הקודם
            </button>
            <span className="text-[11px] text-neutral-400 dark:text-muted-foreground">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="text-[11px] px-2 py-1 rounded text-neutral-500 dark:text-muted-foreground hover:bg-neutral-100 dark:hover:bg-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              הבא
            </button>
          </div>
        )}
        </>
      )}
    </div>
  )
}

/* ── main component ── */

export default function AdminDashboardClient({
  initialQuickCounts,
  initialRange,
  initialDash,
  initialDashErr,
}: AdminDashboardClientProps) {
  // Live badge counts from the shell's 30-second poll.
  // Fall back to the SSR-fetched initial values until the first poll completes.
  const liveBadges = useAdminBadges();
  const openReports = liveBadges.loaded ? liveBadges.reports : (initialQuickCounts.openReports ?? 0);
  const openContact = liveBadges.loaded ? liveBadges.contact : (initialQuickCounts.openContact ?? 0);

  const [bucket, setBucket] = useState<Bucket>(initialRange.bucket);
  const [start, setStart] = useState<string>(initialRange.start);
  const [end, setEnd] = useState<string>(initialRange.end);

  const [dash, setDash] = useState<{ kpis: DashboardKpis; series: DashboardSeries } | null>(initialDash);
  const [dashErr, setDashErr] = useState<string | null>(initialDashErr);
  const [dashLoading, setDashLoading] = useState<boolean>(!initialDash && !initialDashErr);
  const [refreshNonce, setRefreshNonce] = useState<number>(0);
  const skippedInitialFetchRef = useRef(false);

  // Dark mode detection
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    setIsDark(el.classList.contains("dark"));
    const observer = new MutationObserver(() => {
      setIsDark(el.classList.contains("dark"));
    });
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const CP = isDark ? darkP : P;
  const localGridProps = { strokeDasharray: "4 6", stroke: CP.grid, strokeOpacity: isDark ? 0.42 : 0.78, vertical: false };
  const localXAxisBase = {
    dataKey: "bucketStart" as const,
    tickFormatter: fmtTick,
    tick: { fontSize: 11, fill: CP.mist },
    axisLine: false,
    tickLine: false,
    tickMargin: 10,
    minTickGap: 24,
  };
  const localYAxisBase = {
    tick: { fontSize: 11, fill: CP.mist },
    axisLine: false,
    tickLine: false,
    tickMargin: 8,
    width: 44,
    allowDecimals: false,
  };
  const trafficChips = useMemo(() => [
    { label: "צפיות", color: CP.ink },
    { label: "ביקורים", color: CP.emerald },
  ], [CP]);
  const audienceChips = useMemo(() => [
    { label: "מחוברים", color: CP.ink },
    { label: "אורחים", color: CP.emerald },
  ], [CP]);
  const activeUsersChips = useMemo(() => [{ label: "משתמשים פעילים מחוברים", color: CP.blue }], [CP]);
  const signupsChips = useMemo(() => [{ label: "הרשמות", color: CP.ink }], [CP]);
  const postsChips = useMemo(() => [
    { label: "נוצרו", color: CP.ink },
    { label: "פורסמו", color: CP.emerald },
    { label: "נמחקו (soft)", color: CP.amber },
    { label: "נמחקו לצמיתות", color: CP.red },
  ], [CP]);
  const commentsChips = useMemo(() => [
    { label: "תגובות", color: CP.ink },
    { label: "תגובות תשובה", color: CP.slate },
  ], [CP]);
  const purgesChips = useMemo(() => [
    { label: "פוסטים", color: CP.red },
    { label: "משתמשים", color: CP.slate },
  ], [CP]);

  // Dashboard analytics
  useEffect(() => {
    if (!skippedInitialFetchRef.current) {
      skippedInitialFetchRef.current = true;
      if (initialDash || initialDashErr) return;
    }

    const controller = new AbortController();
    let alive = true;

    setDashLoading(true);
    setDashErr(null);

    (async () => {
      try {
        const qs = new URLSearchParams({ start, end, bucket });
        const res = await adminFetch(`/api/admin/dashboard?${qs.toString()}`, { signal: controller.signal });
        const body = (await res.json().catch(() => ({}))) as DashboardResponse;

        if (!alive) return;
        if (!res.ok) throw new Error(getAdminErrorMessage(body, "Failed to load dashboard"));

        setDash(normalizeDashboard(body));
      } catch (err) {
        if (!alive) return;
        setDashErr(err instanceof Error ? err.message : "שגיאה בטעינת דשבורד");
      } finally {
        if (!alive) return;
        setDashLoading(false);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [bucket, end, initialDash, initialDashErr, refreshNonce, start]);

  const trafficData = useMemo(() => dash?.series.traffic ?? [], [dash]);
  const audienceData = useMemo(() => dash?.series.audience ?? [], [dash]);
  const signupsData = useMemo(() => dash?.series.signups ?? [], [dash]);
  const commentsData = useMemo(() => dash?.series.comments ?? [], [dash]);
  const postsData = useMemo(() => dash?.series.posts ?? [], [dash]);
  const purgesData = useMemo(() => dash?.series.purges ?? [], [dash]);

  const isTrafficEmpty = useMemo(() => isSeriesEmpty(trafficData, ["pageviews", "sessions"]), [trafficData]);
  const isAudienceEmpty = useMemo(() => isSeriesEmpty(audienceData, ["signedInVisits", "guestVisits"]), [audienceData]);
  const activeData = useMemo(
    () => audienceData.map((row) => ({ bucketStart: row.bucketStart, activeUsers: row.signedInUsers })),
    [audienceData]
  );
  const isActiveEmpty = useMemo(() => isSeriesEmpty(activeData, ["activeUsers"]), [activeData]);
  const isSignupsEmpty = useMemo(() => isSeriesEmpty(signupsData, ["signups"]), [signupsData]);
  const isCommentsEmpty = useMemo(() => isSeriesEmpty(commentsData, ["commentsTotal", "repliesTotal"]), [commentsData]);
  const isPostsEmpty = useMemo(
    () => isSeriesEmpty(postsData, ["postsCreated", "postsPublished", "postsSoftDeleted", "postsHardDeleted"]),
    [postsData]
  );
  const isPurgesEmpty = useMemo(() => isSeriesEmpty(purgesData, ["postsPurged", "usersPurged"]), [purgesData]);

  const k = dash?.kpis;

  const setPreset = (days: number) => {
    const now = new Date();
    const startD = new Date(Date.now() - 1000 * 60 * 60 * 24 * days);
    setStart(isoStartOfDay(startD));
    setEnd(isoEndOfDay(now));
  };

  const useModernDashboard = !Array.isArray(dash as unknown);
  if (useModernDashboard) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-extrabold text-neutral-900 dark:text-foreground">סקירה</h1>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-muted-foreground">
            מצב האתר, תנועה, ופילוח נכון יותר בין ביקורי מחוברים לביקורי אורחים.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/admin/reports"
            className="group rounded-xl border border-neutral-100 dark:border-border/50 bg-white dark:bg-card p-4 shadow-sm transition-all hover:border-neutral-200 dark:hover:border-border hover:shadow-md"
            style={{ borderTop: '3px solid #b5534a' }}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#b5534a]/10 text-[#b5534a] dark:bg-[#b5534a]/20 dark:text-[#e07470]">
                <Flag size={15} />
              </div>
              <span className="text-sm font-bold text-neutral-800 dark:text-foreground">דיווחים פתוחים</span>
            </div>
            <div className="mt-2 text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-foreground">{openReports ?? "—"}</div>
            <div className="mt-1 text-xs text-neutral-400 dark:text-muted-foreground">ניהול דיווחים לפי קטגוריות</div>
          </Link>

          <Link
            href="/admin/contact"
            className="group rounded-xl border border-neutral-100 dark:border-border/50 bg-white dark:bg-card p-4 shadow-sm transition-all hover:border-neutral-200 dark:hover:border-border hover:shadow-md"
            style={{ borderTop: '3px solid #2d5a8e' }}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2d5a8e]/10 text-[#2d5a8e] dark:bg-[#2d5a8e]/20 dark:text-[#6496c8]">
                <Mail size={15} />
              </div>
              <span className="text-sm font-bold text-neutral-800 dark:text-foreground">פניות &quot;צור קשר&quot; פתוחות</span>
            </div>
            <div className="mt-2 text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-foreground">{openContact ?? "—"}</div>
            <div className="mt-1 text-xs text-neutral-400 dark:text-muted-foreground">פניות / פידבק / בעיות</div>
          </Link>
        </div>

        <RetentionPanel />

        <div className="rounded-xl border border-neutral-100 dark:border-border/50 bg-white dark:bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-muted-foreground">
                התחלה
                <input
                  className="h-9 rounded-lg border border-neutral-200 dark:border-border bg-neutral-50 dark:bg-muted/30 px-3 text-sm text-neutral-700 dark:text-foreground outline-none transition-colors focus:border-neutral-400 dark:focus:border-border focus:bg-white dark:focus:bg-muted/50"
                  type="datetime-local"
                  value={start.slice(0, 16)}
                  onChange={(e) => setStart(new Date(e.target.value).toISOString())}
                />
              </label>

              <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-muted-foreground">
                סוף
                <input
                  className="h-9 rounded-lg border border-neutral-200 dark:border-border bg-neutral-50 dark:bg-muted/30 px-3 text-sm text-neutral-700 dark:text-foreground outline-none transition-colors focus:border-neutral-400 dark:focus:border-border focus:bg-white dark:focus:bg-muted/50"
                  type="datetime-local"
                  value={end.slice(0, 16)}
                  onChange={(e) => setEnd(new Date(e.target.value).toISOString())}
                />
              </label>

              <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-muted-foreground">
                Bucket
                <select
                  className="h-9 rounded-lg border border-neutral-200 dark:border-border bg-neutral-50 dark:bg-muted/30 px-3 text-sm text-neutral-700 dark:text-foreground outline-none transition-colors focus:border-neutral-400 dark:focus:border-border focus:bg-white dark:focus:bg-muted/50"
                  value={bucket}
                  onChange={(e) => setBucket(e.target.value as Bucket)}
                >
                  <option value="day">יומי</option>
                  <option value="week">שבועי</option>
                  <option value="month">חודשי</option>
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  className="h-9 rounded-lg border border-neutral-200 dark:border-border bg-white dark:bg-muted/20 px-3 text-xs font-semibold text-neutral-600 dark:text-foreground/70 transition-colors hover:border-neutral-300 dark:hover:border-border hover:bg-neutral-50 dark:hover:bg-muted/40"
                  onClick={() => setPreset(d)}
                  type="button"
                >
                  {d} ימים
                </button>
              ))}
              <button
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-neutral-900 dark:bg-neutral-100 px-3.5 text-xs font-semibold text-white dark:text-neutral-900 transition-colors hover:bg-neutral-800 dark:hover:bg-neutral-200"
                onClick={() => setRefreshNonce((n) => n + 1)}
                type="button"
              >
                <RefreshCw size={12} />
                רענן
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {dashLoading ? (
            <>
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </>
          ) : dashErr ? (
            <div className="col-span-full rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 p-4 text-sm text-red-700 dark:text-red-400">
              <div className="font-bold">שגיאה בטעינת הדשבורד</div>
              <div className="mt-1">{dashErr}</div>
              <button
                className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700"
                onClick={() => setRefreshNonce((n) => n + 1)}
                type="button"
              >
                נסה שוב
              </button>
            </div>
          ) : k ? (
            <>
              <KpiCard label="צפיות" value={formatInt(k.pageviews)} sub="Pageviews" icon={<Eye size={15} />} accent accentColor="#2d5a8e" />
              <KpiCard label="ביקורים" value={formatInt(k.visits)} sub="Sessions" icon={<MousePointerClick size={15} />} accent accentColor="#2d5a8e" />
              <KpiCard label="ביקורי מחוברים" value={formatInt(k.signedInVisits)} sub="Sessions with auth" icon={<Users size={15} />} accent accentColor="#2d5a8e" />
              <KpiCard label="ביקורי אורחים" value={formatInt(k.guestVisits)} sub="Anonymous sessions" icon={<MousePointerClick size={15} />} accent accentColor="#2d5a8e" />

              <KpiCard label="Bounce" value={formatPct(k.bounceRate)} sub="אחוז נטישה" icon={<ArrowUpRight size={15} />} />
              <KpiCard label="אורך ביקור" value={formatMinutes(k.avgSessionMinutes)} sub="דקות (ממוצע)" icon={<Clock size={15} />} />
              <KpiCard label="משתמשים מחוברים ייחודיים" value={formatInt(k.uniqueUsers)} sub="Distinct signed-in users" icon={<Users size={15} />} accentColor="#4a7c59" />
              <KpiCard label="נרשמו" value={formatInt(k.signups)} icon={<UserPlus size={15} />} accentColor="#4a7c59" />
              <KpiCard label="תגובות" value={formatInt(k.commentsTotal)} icon={<MessageCircle size={15} />} accentColor="#c4923a" />

              <KpiCard label="פוסטים נוצרו" value={formatInt(k.postsCreated)} icon={<FileText size={15} />} accentColor="#c4923a" />
              <KpiCard label="פוסטים פורסמו" value={formatInt(k.postsPublished)} icon={<BookOpen size={15} />} accentColor="#c4923a" />
              <KpiCard label="נמחקו (soft)" value={formatInt(k.postsSoftDeleted)} icon={<Trash2 size={15} />} accentColor="#c4923a" />
              <KpiCard label="נמחקו לצמיתות" value={formatInt(k.postsPurged)} icon={<XCircle size={15} />} accentColor="#c4923a" />

              <KpiCard label="מושעים" value={formatInt(k.usersSuspended)} icon={<UserX size={15} />} accentColor="#b5534a" />
              <KpiCard label="חסומים" value={formatInt(k.usersBanned)} icon={<Ban size={15} />} accentColor="#b5534a" />
              <KpiCard label="משתמשים נוקו" value={formatInt(k.usersPurged)} icon={<UserMinus size={15} />} accentColor="#b5534a" />
            </>
          ) : null}
        </div>

        {!dashLoading && !dashErr && dash ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <DashChartCard
              title="תנועה (צפיות + ביקורים)"
              subtitle="מגמת הצפייה והביקורים לאורך הזמן בטווח שנבחר."
              chips={trafficChips}
            >
              {isTrafficEmpty ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trafficData} margin={chartMargin}>
                    <defs>
                      <linearGradient id="gPageviewsModern" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CP.ink} stopOpacity={0.12} />
                        <stop offset="100%" stopColor={CP.ink} stopOpacity={0.01} />
                      </linearGradient>
                      <linearGradient id="gSessionsModern" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CP.emerald} stopOpacity={0.12} />
                        <stop offset="100%" stopColor={CP.emerald} stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...localGridProps} />
                    <XAxis {...localXAxisBase} />
                    <YAxis {...localYAxisBase} />
                    <Tooltip content={<StyledTooltip />} />
                    <Area type="monotone" dataKey="pageviews" name="צפיות" stroke={CP.ink} fill="url(#gPageviewsModern)" strokeWidth={2.4} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                    <Area type="monotone" dataKey="sessions" name="ביקורים" stroke={CP.emerald} fill="url(#gSessionsModern)" strokeWidth={2.4} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </DashChartCard>

            <DashChartCard
              title="ביקורים לפי קהל (מחוברים / אורחים)"
              subtitle="חלוקת הטראפיק בין משתמשים מזוהים לבין אורחים."
              chips={audienceChips}
            >
              {isAudienceEmpty ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={audienceData} margin={chartMargin} barCategoryGap="28%">
                    <CartesianGrid {...localGridProps} />
                    <XAxis {...localXAxisBase} />
                    <YAxis {...localYAxisBase} />
                    <Tooltip content={<StyledTooltip />} />
                    <Bar dataKey="signedInVisits" name="ביקורי מחוברים" fill={CP.ink} radius={[10, 10, 4, 4]} maxBarSize={24} />
                    <Bar dataKey="guestVisits" name="ביקורי אורחים" fill={CP.emerald} radius={[10, 10, 4, 4]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </DashChartCard>

            <DashChartCard
              title="משתמשים פעילים מחוברים"
              subtitle="מספר המשתמשים הייחודיים המזוהים שביצעו לפחות צפייה אחת בכל bucket. מבוסס על session_id + user_id."
              chips={activeUsersChips}
            >
              {isActiveEmpty ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={activeData} margin={chartMargin}>
                    <defs>
                      <linearGradient id="gActiveUsers" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CP.blue} stopOpacity={0.14} />
                        <stop offset="100%" stopColor={CP.blue} stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...localGridProps} />
                    <XAxis {...localXAxisBase} />
                    <YAxis {...localYAxisBase} />
                    <Tooltip content={<StyledTooltip />} />
                    <Area type="monotone" dataKey="activeUsers" name="פעילים" stroke={CP.blue} fill="url(#gActiveUsers)" strokeWidth={2.4} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </DashChartCard>

            <DashChartCard
              title="הרשמות"
              subtitle="משתמשים חדשים שנרשמו בטווח שנבחר."
              chips={signupsChips}
            >
              {isSignupsEmpty ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={signupsData} margin={chartMargin} barCategoryGap="38%">
                    <CartesianGrid {...localGridProps} />
                    <XAxis {...localXAxisBase} />
                    <YAxis {...localYAxisBase} />
                    <Tooltip content={<StyledTooltip />} />
                    <Bar dataKey="signups" name="הרשמות" fill={CP.ink} radius={[12, 12, 4, 4]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </DashChartCard>

            <DashChartCard
              title="פוסטים (נוצרו / פורסמו / נמחקו / נמחקו לצמיתות)"
              subtitle="מחזור החיים של פוסטים לאורך הטווח. מחיקה זמנית נספרת רק כל עוד הפוסט עדיין בפח, כך ששחזור או מחיקה קבועה מעדכנים אותה."
              chips={postsChips}
            >
              {isPostsEmpty ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={postsData} margin={chartMargin} barCategoryGap="24%">
                    <CartesianGrid {...localGridProps} />
                    <XAxis {...localXAxisBase} />
                    <YAxis {...localYAxisBase} />
                    <Tooltip content={<StyledTooltip />} />
                    <Bar dataKey="postsCreated" name="נוצרו" fill={CP.ink} radius={[10, 10, 4, 4]} maxBarSize={16} />
                    <Bar dataKey="postsPublished" name="פורסמו" fill={CP.emerald} radius={[10, 10, 4, 4]} maxBarSize={16} />
                    <Bar dataKey="postsSoftDeleted" name="נמחקו (soft)" fill={CP.amber} radius={[10, 10, 4, 4]} maxBarSize={16} />
                    <Bar dataKey="postsHardDeleted" name="נמחקו לצמיתות" fill={CP.red} radius={[10, 10, 4, 4]} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </DashChartCard>

            <DashChartCard
              title="תגובות / תגובות תשובה"
              subtitle="תגובות על פוסטים פעילים בלבד, כך שהגרף נשאר מדויק גם אחרי מחיקה זמנית ושחזור."
              chips={commentsChips}
            >
              {isCommentsEmpty ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={commentsData} margin={chartMargin} barCategoryGap="28%">
                    <CartesianGrid {...localGridProps} />
                    <XAxis {...localXAxisBase} />
                    <YAxis {...localYAxisBase} />
                    <Tooltip content={<StyledTooltip />} />
                    <Bar dataKey="commentsTotal" name="תגובות" fill={CP.ink} radius={[10, 10, 4, 4]} maxBarSize={20} />
                    <Bar dataKey="repliesTotal" name="תגובות תשובה" fill={CP.slate} radius={[10, 10, 4, 4]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </DashChartCard>

            <DashChartCard
              title="מחיקות לצמיתות"
              subtitle="תמונה מרוכזת של מחיקות קשיחות של פוסטים ומשתמשים."
              chips={purgesChips}
            >
              {isPurgesEmpty ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={purgesData} margin={chartMargin} barCategoryGap="30%">
                    <CartesianGrid {...localGridProps} />
                    <XAxis {...localXAxisBase} />
                    <YAxis {...localYAxisBase} />
                    <Tooltip content={<StyledTooltip />} />
                    <Bar dataKey="postsPurged" name="פוסטים נמחקו לצמיתות" fill={CP.red} radius={[10, 10, 4, 4]} maxBarSize={24} />
                    <Bar dataKey="usersPurged" name="משתמשים נוקו" fill={CP.slate} radius={[10, 10, 4, 4]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </DashChartCard>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TopPostsPanel start={start} end={end} />
          <TopProfilesPanel start={start} end={end} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-lg font-extrabold text-neutral-900 dark:text-foreground">סקירה</h1>
        <p className="mt-0.5 text-sm text-neutral-500 dark:text-muted-foreground">נקודת התחלה מהירה לניהול האתר + אנליטיקס.</p>
      </div>

      {/* Quick-access cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/admin/reports"
          className="group rounded-xl border border-neutral-100 dark:border-border/50 bg-white dark:bg-card p-4 shadow-sm transition-all hover:border-neutral-200 dark:hover:border-border hover:shadow-md"
          style={{ borderTop: '3px solid #b5534a' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#b5534a]/10 text-[#b5534a] dark:bg-[#b5534a]/20 dark:text-[#e07470]">
              <Flag size={15} />
            </div>
            <span className="text-sm font-bold text-neutral-800 dark:text-foreground">דיווחים פתוחים</span>
          </div>
          <div className="mt-2 text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-foreground">{openReports ?? "—"}</div>
          <div className="mt-1 text-xs text-neutral-400 dark:text-muted-foreground">ניהול דיווחים לפי קטגוריות</div>
        </Link>

        <Link
          href="/admin/contact"
          className="group rounded-xl border border-neutral-100 dark:border-border/50 bg-white dark:bg-card p-4 shadow-sm transition-all hover:border-neutral-200 dark:hover:border-border hover:shadow-md"
          style={{ borderTop: '3px solid #2d5a8e' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2d5a8e]/10 text-[#2d5a8e] dark:bg-[#2d5a8e]/20 dark:text-[#6496c8]">
              <Mail size={15} />
            </div>
            <span className="text-sm font-bold text-neutral-800 dark:text-foreground">פניות &quot;צור קשר&quot; פתוחות</span>
          </div>
          <div className="mt-2 text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-foreground">{openContact ?? "—"}</div>
          <div className="mt-1 text-xs text-neutral-400 dark:text-muted-foreground">פניות / פידבק / בעיות</div>
        </Link>
      </div>

      {/* Date range controls */}
      <div className="rounded-xl border border-neutral-100 dark:border-border/50 bg-white dark:bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-muted-foreground">
              התחלה
              <input
                className="h-9 rounded-lg border border-neutral-200 dark:border-border bg-neutral-50 dark:bg-muted/30 px-3 text-sm text-neutral-700 dark:text-foreground outline-none transition-colors focus:border-neutral-400 dark:focus:border-border focus:bg-white dark:focus:bg-muted/50"
                type="datetime-local"
                value={start.slice(0, 16)}
                onChange={(e) => setStart(new Date(e.target.value).toISOString())}
              />
            </label>

            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-muted-foreground">
              סוף
              <input
                className="h-9 rounded-lg border border-neutral-200 dark:border-border bg-neutral-50 dark:bg-muted/30 px-3 text-sm text-neutral-700 dark:text-foreground outline-none transition-colors focus:border-neutral-400 dark:focus:border-border focus:bg-white dark:focus:bg-muted/50"
                type="datetime-local"
                value={end.slice(0, 16)}
                onChange={(e) => setEnd(new Date(e.target.value).toISOString())}
              />
            </label>

            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-muted-foreground">
              Bucket
              <select
                className="h-9 rounded-lg border border-neutral-200 dark:border-border bg-neutral-50 dark:bg-muted/30 px-3 text-sm text-neutral-700 dark:text-foreground outline-none transition-colors focus:border-neutral-400 dark:focus:border-border focus:bg-white dark:focus:bg-muted/50"
                value={bucket}
                onChange={(e) => setBucket(e.target.value as Bucket)}
              >
                <option value="day">יומי</option>
                <option value="week">שבועי</option>
                <option value="month">חודשי</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                className="h-9 rounded-lg border border-neutral-200 dark:border-border bg-white dark:bg-muted/20 px-3 text-xs font-semibold text-neutral-600 dark:text-foreground/70 transition-colors hover:border-neutral-300 dark:hover:border-border hover:bg-neutral-50 dark:hover:bg-muted/40"
                onClick={() => setPreset(d)}
                type="button"
              >
                {d} ימים
              </button>
            ))}
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-neutral-900 dark:bg-neutral-100 px-3.5 text-xs font-semibold text-white dark:text-neutral-900 transition-colors hover:bg-neutral-800 dark:hover:bg-neutral-200"
              onClick={() => setRefreshNonce((n) => n + 1)}
              type="button"
            >
              <RefreshCw size={12} />
              רענן
            </button>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {dashLoading ? (
          <>
            {Array.from({ length: 15 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </>
        ) : dashErr ? (
          <div className="col-span-full rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 p-4 text-sm text-red-700 dark:text-red-400">
            <div className="font-bold">שגיאה בטעינת דשבורד</div>
            <div className="mt-1">{dashErr}</div>
            <button
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700"
              onClick={() => setRefreshNonce((n) => n + 1)}
              type="button"
            >
              נסה שוב
            </button>
          </div>
        ) : k ? (
          <>
            <KpiCard label="צפיות" value={formatInt(k.pageviews)} sub="Pageviews" icon={<Eye size={15} />} accent />
            <KpiCard label="ביקורים" value={formatInt(k.visits)} sub="Sessions" icon={<MousePointerClick size={15} />} accent />
            <KpiCard label="Bounce" value={formatPct(k.bounceRate)} sub="אחוז נטישה" icon={<ArrowUpRight size={15} />} />
            <KpiCard label="אורך ביקור" value={formatMinutes(k.avgSessionMinutes)} sub="דקות (ממוצע)" icon={<Clock size={15} />} />

            <KpiCard label="משתמשים ייחודיים" value={formatInt(k.uniqueUsers)} icon={<Users size={15} />} />
            <KpiCard label="נרשמו" value={formatInt(k.signups)} icon={<UserPlus size={15} />} />
            <KpiCard label="תגובות" value={formatInt(k.commentsTotal)} icon={<MessageCircle size={15} />} />
            <KpiCard label="פוסטים נוצרו" value={formatInt(k.postsCreated)} icon={<FileText size={15} />} />
            <KpiCard label="פוסטים פורסמו" value={formatInt(k.postsPublished)} icon={<BookOpen size={15} />} />

            <KpiCard label="נמחקו (soft)" value={formatInt(k.postsSoftDeleted)} icon={<Trash2 size={15} />} />
            <KpiCard label="נמחקו לצמיתות" value={formatInt(k.postsPurged)} icon={<XCircle size={15} />} />
            <KpiCard label="מושעים" value={formatInt(k.usersSuspended)} icon={<UserX size={15} />} />
            <KpiCard label="חסומים" value={formatInt(k.usersBanned)} icon={<Ban size={15} />} />

            <KpiCard label="משתמשים נוקו" value={formatInt(k.usersPurged)} icon={<UserMinus size={15} />} />
          </>
        ) : null}
      </div>

      {/* Charts */}
      {!dashLoading && !dashErr && dash ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Traffic */}
          <DashChartCard
            title="תנועה (צפיות + ביקורים)"
            subtitle="מגמת הצפייה והביקורים לאורך הזמן בטווח שנבחר."
            chips={trafficChips}
          >
            {isTrafficEmpty ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trafficData} margin={chartMargin}>
                  <defs>
                    <linearGradient id="gPageviews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CP.ink} stopOpacity={0.12} />
                      <stop offset="100%" stopColor={CP.ink} stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="gSessions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CP.emerald} stopOpacity={0.12} />
                      <stop offset="100%" stopColor={CP.emerald} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...localGridProps} />
                  <XAxis {...localXAxisBase} />
                  <YAxis {...localYAxisBase} />
                  <Tooltip content={<StyledTooltip />} />
                  <Area type="monotone" dataKey="pageviews" name="צפיות" stroke={CP.ink} fill="url(#gPageviews)" strokeWidth={2.4} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="sessions" name="ביקורים" stroke={CP.emerald} fill="url(#gSessions)" strokeWidth={2.4} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </DashChartCard>

          {/* Active users */}
          <DashChartCard
            title="משתמשים פעילים"
            subtitle="משתמשים מחוברים ייחודיים שביקרו בפועל בכל נקודת זמן."
            chips={activeUsersChips}
          >
            {isActiveEmpty ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={activeData} margin={chartMargin}>
                  <CartesianGrid {...localGridProps} />
                  <XAxis {...localXAxisBase} />
                  <YAxis {...localYAxisBase} />
                  <Tooltip content={<StyledTooltip />} />
                  <Line type="monotone" dataKey="activeUsers" name="פעילים" stroke={CP.ink} strokeWidth={2.8} dot={false} activeDot={{ r: 4, fill: CP.ink, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </DashChartCard>

          {/* Signups */}
          <DashChartCard
            title="הרשמות"
            subtitle="משתמשים חדשים שנרשמו בטווח שנבחר."
            chips={signupsChips}
          >
            {isSignupsEmpty ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={signupsData} margin={chartMargin} barCategoryGap="38%">
                  <CartesianGrid {...localGridProps} />
                  <XAxis {...localXAxisBase} />
                  <YAxis {...localYAxisBase} />
                  <Tooltip content={<StyledTooltip />} />
                  <Bar dataKey="signups" name="הרשמות" fill={CP.ink} radius={[12, 12, 4, 4]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </DashChartCard>

          {/* Posts */}
          <DashChartCard
            title="פוסטים (נוצרו / פורסמו / נמחקו / נמחקו לצמיתות)"
            subtitle="מחזור החיים של פוסטים לאורך הטווח. מחיקה זמנית נספרת רק כל עוד הפוסט עדיין בפח, כך ששחזור או מחיקה קבועה מעדכנים אותה."
            chips={postsChips}
          >
            {isPostsEmpty ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={postsData} margin={chartMargin} barCategoryGap="24%">
                  <CartesianGrid {...localGridProps} />
                  <XAxis {...localXAxisBase} />
                  <YAxis {...localYAxisBase} />
                  <Tooltip content={<StyledTooltip />} />
                  <Bar dataKey="postsCreated" name="נוצרו" fill={CP.ink} radius={[10, 10, 4, 4]} maxBarSize={16} />
                  <Bar dataKey="postsPublished" name="פורסמו" fill={CP.emerald} radius={[10, 10, 4, 4]} maxBarSize={16} />
                  <Bar dataKey="postsSoftDeleted" name="נמחקו (soft)" fill={CP.amber} radius={[10, 10, 4, 4]} maxBarSize={16} />
                  <Bar dataKey="postsHardDeleted" name="נמחקו לצמיתות" fill={CP.red} radius={[10, 10, 4, 4]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </DashChartCard>

          {/* Comments */}
          <DashChartCard
            title="תגובות / תגובות תשובה"
            subtitle="תגובות על פוסטים פעילים בלבד, כך שהגרף נשאר מדויק גם אחרי מחיקה זמנית ושחזור."
            chips={commentsChips}
          >
            {isCommentsEmpty ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={commentsData} margin={chartMargin} barCategoryGap="28%">
                  <CartesianGrid {...localGridProps} />
                  <XAxis {...localXAxisBase} />
                  <YAxis {...localYAxisBase} />
                  <Tooltip content={<StyledTooltip />} />
                  <Bar dataKey="commentsTotal" name="תגובות" fill={CP.ink} radius={[10, 10, 4, 4]} maxBarSize={20} />
                  <Bar dataKey="repliesTotal" name="תגובות תשובה" fill={CP.slate} radius={[10, 10, 4, 4]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </DashChartCard>

          {/* Purges */}
          <DashChartCard
            title="מחיקות לצמיתות"
            subtitle="תמונה מרוכזת של מחיקות קשיחות של פוסטים ומשתמשים."
            chips={purgesChips}
          >
            {isPurgesEmpty ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={purgesData} margin={chartMargin} barCategoryGap="30%">
                  <CartesianGrid {...localGridProps} />
                  <XAxis {...localXAxisBase} />
                  <YAxis {...localYAxisBase} />
                  <Tooltip content={<StyledTooltip />} />
                  <Bar dataKey="postsPurged" name="פוסטים נמחקו לצמיתות" fill={CP.red} radius={[10, 10, 4, 4]} maxBarSize={24} />
                  <Bar dataKey="usersPurged" name="משתמשים נוקו" fill={CP.slate} radius={[10, 10, 4, 4]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </DashChartCard>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopPostsPanel start={start} end={end} />
        <TopProfilesPanel start={start} end={end} />
      </div>
    </div>
  );
}
