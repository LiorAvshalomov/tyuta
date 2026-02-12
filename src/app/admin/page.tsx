"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
} from "lucide-react";

import { adminFetch } from "@/lib/admin/adminFetch";
import { getAdminErrorMessage } from "@/lib/admin/adminUi";

/* ── palette ── */

const P = {
  ink: "#18181b",       // zinc-900 — primary
  slate: "#71717a",     // zinc-500 — secondary
  mist: "#a1a1aa",      // zinc-400 — tertiary / grid
  emerald: "#10b981",   // emerald-500
  amber: "#f59e0b",     // amber-500
  red: "#ef4444",       // red-500
  grid: "#e4e4e7",      // zinc-200 — very light grid
} as const;

/* ── types ── */

type Bucket = "day" | "week" | "month";

type DashboardKpis = {
  pageviews: number;
  visits: number;
  bounceRate: number;
  avgSessionMinutes: number;
  uniqueUsers: number;
  signups: number;
  postsCreated: number;
  postsPublished: number;
  postsSoftDeleted: number;
  postsPurged: number;
  usersSuspended: number;
  usersBanned: number;
  usersPurged: number;
};

type TrafficPoint = { bucketStart: string; pageviews: number; sessions: number; uniqueUsers: number };
type ActiveUsersPoint = { bucketStart: string; activeUsers: number };
type SignupsPoint = { bucketStart: string; signups: number };
type PostsPoint = { bucketStart: string; postsCreated: number; postsPublished: number; postsSoftDeleted: number };
type PurgesPoint = { bucketStart: string; postsPurged: number; usersPurged: number };

type DashboardSeries = {
  traffic: TrafficPoint[];
  activeUsers: ActiveUsersPoint[];
  signups: SignupsPoint[];
  posts: PostsPoint[];
  purges: PurgesPoint[];
};

type DashboardResponse = {
  kpis?: unknown;
  series?: unknown;
  trafficSeries?: unknown;
  activeUsersSeries?: unknown;
  signupsSeries?: unknown;
  postsSeries?: unknown;
  purgesSeries?: unknown;
};

/* ── utils (unchanged logic) ── */

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

/* ── normalization (unchanged logic) ── */

function normalizeDashboard(payload: DashboardResponse): { kpis: DashboardKpis; series: DashboardSeries } {
  const rawKpis = (payload.kpis ?? {}) as Record<string, unknown>;

  const kpis: DashboardKpis = {
    pageviews: toNum(rawKpis.pageviews ?? rawKpis.page_views),
    visits: toNum(rawKpis.visits ?? rawKpis.sessions ?? rawKpis.session_count),
    bounceRate: toNum(rawKpis.bounceRate ?? rawKpis.bounce_rate),
    avgSessionMinutes: toNum(rawKpis.avgSessionMinutes ?? rawKpis.avg_session_minutes),
    uniqueUsers: toNum(rawKpis.uniqueUsers ?? rawKpis.unique_users),
    signups: toNum(rawKpis.signups),
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
  const activeSrc = (rawSeries.activeUsers as unknown[]) ?? (payload.activeUsersSeries as unknown[]) ?? [];
  const signupsSrc = (rawSeries.signups as unknown[]) ?? (payload.signupsSeries as unknown[]) ?? [];
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

  const activeUsers: ActiveUsersPoint[] = (Array.isArray(activeSrc) ? activeSrc : []).map((r) => {
    const row = (r ?? {}) as Record<string, unknown>;
    return {
      bucketStart: String(row.bucketStart ?? row.bucket_start ?? ""),
      activeUsers: toNum(row.activeUsers ?? row.active_users),
    };
  });

  const signups: SignupsPoint[] = (Array.isArray(signupsSrc) ? signupsSrc : []).map((r) => {
    const row = (r ?? {}) as Record<string, unknown>;
    return {
      bucketStart: String(row.bucketStart ?? row.bucket_start ?? ""),
      signups: toNum(row.signups),
    };
  });

  const posts: PostsPoint[] = (Array.isArray(postsSrc) ? postsSrc : []).map((r) => {
    const row = (r ?? {}) as Record<string, unknown>;
    return {
      bucketStart: String(row.bucketStart ?? row.bucket_start ?? ""),
      postsCreated: toNum(row.postsCreated ?? row.posts_created),
      postsPublished: toNum(row.postsPublished ?? row.posts_published),
      postsSoftDeleted: toNum(row.postsSoftDeleted ?? row.posts_soft_deleted),
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

  return { kpis, series: { traffic, activeUsers, signups, posts, purges } };
}

/* ── presentational components ── */

const LABEL_MAP: Record<string, string> = {
  pageviews: "צפיות",
  sessions: "ביקורים",
  uniqueUsers: "ייחודיים",
  activeUsers: "פעילים",
  signups: "הרשמות",
  postsCreated: "נוצרו",
  postsPublished: "פורסמו",
  postsSoftDeleted: "נמחקו (soft)",
  postsPurged: "פוסטים נוקו",
  usersPurged: "משתמשים נוקו",
};

type TtPayloadEntry = { dataKey?: string | number; name?: string | number; value?: string | number; color?: string };
type TtProps = { active?: boolean; payload?: TtPayloadEntry[]; label?: string | number };

function StyledTooltip({ active, payload, label }: TtProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5 shadow-lg">
      <div className="mb-1.5 text-[11px] font-medium text-neutral-400">{fmtTick(String(label ?? ""))}</div>
      {payload.map((entry) => (
        <div key={String(entry.dataKey)} className="flex items-center gap-2 text-[12px] leading-5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: String(entry.color ?? P.ink) }}
          />
          <span className="text-neutral-500">{LABEL_MAP[String(entry.dataKey)] ?? String(entry.name)}</span>
          <span className="mr-auto font-semibold text-neutral-900">{formatInt(toNum(entry.value))}</span>
        </div>
      ))}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="h-[100px] animate-pulse rounded-xl border border-neutral-100 bg-white" />
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "group relative overflow-hidden rounded-xl border bg-white p-4 transition-shadow hover:shadow-md " +
        (accent ? "border-neutral-200 shadow-sm" : "border-neutral-100")
      }
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</span>
        {icon && <span className="text-neutral-300 transition-colors group-hover:text-neutral-400">{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-extrabold tracking-tight text-neutral-900">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-neutral-400">{sub}</div>}
    </div>
  );
}

function DashChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-100 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="mb-3 text-sm font-bold text-neutral-800">{title}</h3>
      <div className="h-[240px] w-full sm:h-[260px]">{children}</div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-neutral-300">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" /><path d="m7 16 4-8 4 4 4-6" />
      </svg>
      <span className="text-xs font-medium text-neutral-400">אין נתונים בטווח הנבחר</span>
    </div>
  );
}

/* shared axis / grid props */
const gridProps = { strokeDasharray: "3 3", stroke: P.grid, strokeOpacity: 0.8 } as const;
const xAxisBase = { dataKey: "bucketStart" as const, tickFormatter: fmtTick, tick: { fontSize: 11, fill: P.mist }, axisLine: false, tickLine: false };
const yAxisBase = { tick: { fontSize: 11, fill: P.mist }, axisLine: false, tickLine: false, width: 40 };
const chartMargin = { top: 8, right: 8, left: -12, bottom: 0 };

/* ── main component ── */

export default function AdminHome() {
  const [openReports, setOpenReports] = useState<number | null>(null);
  const [openContact, setOpenContact] = useState<number | null>(null);

  const [bucket, setBucket] = useState<Bucket>("day");
  const [start, setStart] = useState<string>(() => isoStartOfDay(new Date(Date.now() - 1000 * 60 * 60 * 24 * 30)));
  const [end, setEnd] = useState<string>(() => isoEndOfDay(new Date()));

  const [dash, setDash] = useState<{ kpis: DashboardKpis; series: DashboardSeries } | null>(null);
  const [dashErr, setDashErr] = useState<string | null>(null);
  const [dashLoading, setDashLoading] = useState<boolean>(true);
  const [refreshNonce, setRefreshNonce] = useState<number>(0);

  // Quick counts (non-fatal)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [r1, r2] = await Promise.all([
          adminFetch("/api/admin/reports?status=open&limit=200"),
          adminFetch("/api/admin/contact?status=open&limit=200"),
        ]);

        const j1 = (await r1.json().catch(() => ({}))) as unknown;
        const j2 = (await r2.json().catch(() => ({}))) as unknown;

        if (!alive) return;

        if (!r1.ok) throw new Error(getAdminErrorMessage(j1, "Failed to load reports"));
        if (!r2.ok) throw new Error(getAdminErrorMessage(j2, "Failed to load contact"));

        const reportsArr = (j1 as { reports?: unknown[] } | null)?.reports ?? [];
        const contactArr = (j2 as { messages?: unknown[] } | null)?.messages ?? [];
        setOpenReports(Array.isArray(reportsArr) ? reportsArr.length : 0);
        setOpenContact(Array.isArray(contactArr) ? contactArr.length : 0);
      } catch {
        // ignore (quick counts are non-fatal)
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Dashboard analytics (ONLY via /api/admin/dashboard)
  useEffect(() => {
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
  }, [start, end, bucket, refreshNonce]);

  // Keep memo deps stable
  const trafficData = useMemo(() => dash?.series.traffic ?? [], [dash]);
  const activeData = useMemo(() => dash?.series.activeUsers ?? [], [dash]);
  const signupsData = useMemo(() => dash?.series.signups ?? [], [dash]);
  const postsData = useMemo(() => dash?.series.posts ?? [], [dash]);
  const purgesData = useMemo(() => dash?.series.purges ?? [], [dash]);

  const isTrafficEmpty = useMemo(() => isSeriesEmpty(trafficData, ["pageviews", "sessions"]), [trafficData]);
  const isActiveEmpty = useMemo(() => isSeriesEmpty(activeData, ["activeUsers"]), [activeData]);
  const isSignupsEmpty = useMemo(() => isSeriesEmpty(signupsData, ["signups"]), [signupsData]);
  const isPostsEmpty = useMemo(
    () => isSeriesEmpty(postsData, ["postsCreated", "postsPublished", "postsSoftDeleted"]),
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-lg font-extrabold text-neutral-900">סקירה</h1>
        <p className="mt-0.5 text-sm text-neutral-500">נקודת התחלה מהירה לניהול האתר + אנליטיקס.</p>
      </div>

      {/* Quick-access cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/admin/reports"
          className="group rounded-xl border border-neutral-100 bg-white p-4 shadow-sm transition-all hover:border-neutral-200 hover:shadow-md"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Flag size={15} />
            </div>
            <span className="text-sm font-bold text-neutral-800">דיווחים פתוחים</span>
          </div>
          <div className="mt-2 text-3xl font-extrabold tracking-tight text-neutral-900">{openReports ?? "—"}</div>
          <div className="mt-1 text-xs text-neutral-400">ניהול דיווחים לפי קטגוריות</div>
        </Link>

        <Link
          href="/admin/contact"
          className="group rounded-xl border border-neutral-100 bg-white p-4 shadow-sm transition-all hover:border-neutral-200 hover:shadow-md"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Mail size={15} />
            </div>
            <span className="text-sm font-bold text-neutral-800">פניות &quot;צור קשר&quot; פתוחות</span>
          </div>
          <div className="mt-2 text-3xl font-extrabold tracking-tight text-neutral-900">{openContact ?? "—"}</div>
          <div className="mt-1 text-xs text-neutral-400">פניות / פידבק / בעיות</div>
        </Link>
      </div>

      {/* Date range controls */}
      <div className="rounded-xl border border-neutral-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              התחלה
              <input
                className="h-9 rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-700 outline-none transition-colors focus:border-neutral-400 focus:bg-white"
                type="datetime-local"
                value={start.slice(0, 16)}
                onChange={(e) => setStart(new Date(e.target.value).toISOString())}
              />
            </label>

            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              סוף
              <input
                className="h-9 rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-700 outline-none transition-colors focus:border-neutral-400 focus:bg-white"
                type="datetime-local"
                value={end.slice(0, 16)}
                onChange={(e) => setEnd(new Date(e.target.value).toISOString())}
              />
            </label>

            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Bucket
              <select
                className="h-9 rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-700 outline-none transition-colors focus:border-neutral-400 focus:bg-white"
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
                className="h-9 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
                onClick={() => setPreset(d)}
                type="button"
              >
                {d} ימים
              </button>
            ))}
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-neutral-800"
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
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </>
        ) : dashErr ? (
          <div className="col-span-full rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
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
            <KpiCard label="פוסטים נוצרו" value={formatInt(k.postsCreated)} icon={<FileText size={15} />} />
            <KpiCard label="פוסטים פורסמו" value={formatInt(k.postsPublished)} icon={<BookOpen size={15} />} />

            <KpiCard label="נמחקו (soft)" value={formatInt(k.postsSoftDeleted)} icon={<Trash2 size={15} />} />
            <KpiCard label="פוסטים נוקו" value={formatInt(k.postsPurged)} icon={<XCircle size={15} />} />
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
          <DashChartCard title="תנועה (צפיות + ביקורים)">
            {isTrafficEmpty ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trafficData} margin={chartMargin}>
                  <defs>
                    <linearGradient id="gPageviews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={P.ink} stopOpacity={0.12} />
                      <stop offset="100%" stopColor={P.ink} stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="gSessions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={P.emerald} stopOpacity={0.12} />
                      <stop offset="100%" stopColor={P.emerald} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...xAxisBase} />
                  <YAxis {...yAxisBase} />
                  <Tooltip content={<StyledTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Area type="monotone" dataKey="pageviews" name="צפיות" stroke={P.ink} fill="url(#gPageviews)" strokeWidth={2} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="sessions" name="ביקורים" stroke={P.emerald} fill="url(#gSessions)" strokeWidth={2} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </DashChartCard>

          {/* Active users */}
          <DashChartCard title="משתמשים פעילים">
            {isActiveEmpty ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={activeData} margin={chartMargin}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...xAxisBase} />
                  <YAxis {...yAxisBase} />
                  <Tooltip content={<StyledTooltip />} />
                  <Line type="monotone" dataKey="activeUsers" name="פעילים" stroke={P.ink} strokeWidth={2.5} dot={false} activeDot={{ r: 3, fill: P.ink, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </DashChartCard>

          {/* Signups */}
          <DashChartCard title="הרשמות">
            {isSignupsEmpty ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={signupsData} margin={chartMargin}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...xAxisBase} />
                  <YAxis {...yAxisBase} />
                  <Tooltip content={<StyledTooltip />} />
                  <Bar dataKey="signups" name="הרשמות" fill={P.ink} radius={[3, 3, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </DashChartCard>

          {/* Posts */}
          <DashChartCard title="פוסטים (נוצרו / פורסמו / נמחקו)">
            {isPostsEmpty ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={postsData} margin={chartMargin}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...xAxisBase} />
                  <YAxis {...yAxisBase} />
                  <Tooltip content={<StyledTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="postsCreated" name="נוצרו" fill={P.ink} stackId="a" maxBarSize={32} />
                  <Bar dataKey="postsPublished" name="פורסמו" fill={P.emerald} stackId="a" maxBarSize={32} />
                  <Bar dataKey="postsSoftDeleted" name="נמחקו" fill={P.amber} stackId="a" radius={[3, 3, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </DashChartCard>

          {/* Purges */}
          <DashChartCard title="מחיקות מערכת (Purge)">
            {isPurgesEmpty ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={purgesData} margin={chartMargin}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...xAxisBase} />
                  <YAxis {...yAxisBase} />
                  <Tooltip content={<StyledTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="postsPurged" name="פוסטים נוקו" fill={P.red} radius={[3, 3, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="usersPurged" name="משתמשים נוקו" fill={P.slate} radius={[3, 3, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </DashChartCard>
        </div>
      ) : null}
    </div>
  );
}
