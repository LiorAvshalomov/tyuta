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

import { adminFetch } from "@/lib/admin/adminFetch";
import { getAdminErrorMessage } from "@/lib/admin/adminUi";

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

  // Back-compat if older shape exists
  trafficSeries?: unknown;
  activeUsersSeries?: unknown;
  signupsSeries?: unknown;
  postsSeries?: unknown;
  purgesSeries?: unknown;
};

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

function SkeletonCard() {
  return <div className="h-[104px] animate-pulse rounded-2xl border border-black/5 bg-white/60" />;
}

function Card({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white/60 p-4 shadow-sm">
      <div className="text-xs font-bold text-muted-foreground">{title}</div>
      <div className="mt-1 text-3xl font-black">{value}</div>
      {sub ? <div className="mt-2 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white/60 p-4 shadow-sm">
      <div className="text-sm font-black">{title}</div>
      <div className="mt-3 h-[260px] w-full">{children}</div>
    </div>
  );
}

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
    <div className="space-y-4">
      <div>
        <div className="text-lg font-black">סקירה</div>
        <div className="mt-1 text-sm text-muted-foreground">נקודת התחלה מהירה לניהול האתר + אנליטיקס.</div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/admin/reports" className="rounded-2xl border border-black/5 bg-white/60 p-4 shadow-sm hover:bg-white">
          <div className="text-sm font-black">דיווחים פתוחים</div>
          <div className="mt-1 text-3xl font-black">{openReports ?? "—"}</div>
          <div className="mt-2 text-xs text-muted-foreground">ניהול דיווחים לפי קטגוריות</div>
        </Link>

        <Link href="/admin/contact" className="rounded-2xl border border-black/5 bg-white/60 p-4 shadow-sm hover:bg-white">
          <div className="text-sm font-black">פניות “צור קשר” פתוחות</div>
          <div className="mt-1 text-3xl font-black">{openContact ?? "—"}</div>
          <div className="mt-2 text-xs text-muted-foreground">פניות / פידבק / בעיות</div>
        </Link>
      </div>

      <div className="rounded-2xl border border-black/5 bg-white/60 p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs font-bold text-muted-foreground">
              התחלה
              <input
                className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm"
                type="datetime-local"
                value={start.slice(0, 16)}
                onChange={(e) => setStart(new Date(e.target.value).toISOString())}
              />
            </label>

            <label className="grid gap-1 text-xs font-bold text-muted-foreground">
              סוף
              <input
                className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm"
                type="datetime-local"
                value={end.slice(0, 16)}
                onChange={(e) => setEnd(new Date(e.target.value).toISOString())}
              />
            </label>

            <label className="grid gap-1 text-xs font-bold text-muted-foreground">
              Bucket
              <select
                className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm"
                value={bucket}
                onChange={(e) => setBucket(e.target.value as Bucket)}
              >
                <option value="day">יומי</option>
                <option value="week">שבועי</option>
                <option value="month">חודשי</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm font-bold hover:bg-black/5"
              onClick={() => setPreset(7)}
              type="button"
            >
              7 ימים
            </button>
            <button
              className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm font-bold hover:bg-black/5"
              onClick={() => setPreset(30)}
              type="button"
            >
              30 ימים
            </button>
            <button
              className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm font-bold hover:bg-black/5"
              onClick={() => setPreset(90)}
              type="button"
            >
              90 ימים
            </button>
            <button
              className="h-10 rounded-xl bg-black px-4 text-sm font-bold text-white hover:bg-black/90"
              onClick={() => setRefreshNonce((n) => n + 1)}
              type="button"
            >
              רענן
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {dashLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : dashErr ? (
          <div className="col-span-full rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <div className="font-bold">שגיאה בטעינת דשבורד</div>
            <div className="mt-1">{dashErr}</div>
            <button
              className="mt-3 h-10 rounded-xl bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700"
              onClick={() => setRefreshNonce((n) => n + 1)}
              type="button"
            >
              נסה שוב
            </button>
          </div>
        ) : k ? (
          <>
            <Card title="כניסות (Pageviews)" value={formatInt(k.pageviews)} sub="סה״כ בטווח" />
            <Card title="ביקורים (Sessions)" value={formatInt(k.visits)} sub="Sessions בטווח" />
            <Card title="Bounce" value={formatPct(k.bounceRate)} sub="אחוז ביקור עם צפייה אחת" />
            <Card title="אורך ביקור (דקות)" value={formatMinutes(k.avgSessionMinutes)} sub="ממוצע" />

            <Card title="משתמשים ייחודיים" value={formatInt(k.uniqueUsers)} />
            <Card title="נרשמו" value={formatInt(k.signups)} />
            <Card title="פוסטים נוצרו" value={formatInt(k.postsCreated)} />
            <Card title="פוסטים פורסמו" value={formatInt(k.postsPublished)} />

            <Card title="פוסטים נמחקו (soft)" value={formatInt(k.postsSoftDeleted)} />
            <Card title="פוסטים נוקו (purge)" value={formatInt(k.postsPurged)} />
            <Card title="משתמשים מושעים" value={formatInt(k.usersSuspended)} />
            <Card title="משתמשים חסומים" value={formatInt(k.usersBanned)} />

            <Card title="משתמשים נוקו (purge)" value={formatInt(k.usersPurged)} />
          </>
        ) : null}
      </div>

      {!dashLoading && !dashErr && dash ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartCard title="Traffic (Pageviews + Sessions)">
            {isTrafficEmpty ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">אין נתונים בטווח הזה</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trafficData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucketStart" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="pageviews" name="Pageviews" fillOpacity={0.2} strokeWidth={2} />
                  <Line type="monotone" dataKey="sessions" name="Sessions" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="משתמשים פעילים">
            {isActiveEmpty ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">אין נתונים בטווח הזה</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={activeData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucketStart" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="activeUsers" name="Active" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="נרשמים">
            {isSignupsEmpty ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">אין נתונים בטווח הזה</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={signupsData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucketStart" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="signups" name="Signups" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="פוסטים (Created / Published / Soft Deleted)">
            {isPostsEmpty ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">אין נתונים בטווח הזה</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={postsData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucketStart" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="postsCreated" name="Created" stackId="a" />
                  <Bar dataKey="postsPublished" name="Published" stackId="a" />
                  <Bar dataKey="postsSoftDeleted" name="Soft Deleted" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="מחיקות מערכת (Purge)">
            {isPurgesEmpty ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">אין נתונים בטווח הזה</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={purgesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucketStart" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="postsPurged" name="Posts purged" />
                  <Bar dataKey="usersPurged" name="Users purged" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      ) : null}
    </div>
  );
}
