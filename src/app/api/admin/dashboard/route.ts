import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin/requireAdminFromRequest";

type Bucket = "day" | "week" | "month";

type RpcResult<T> = { data: T | null; error: { message: string } | null };

function pickBucket(raw: string | null): Bucket {
  if (raw === "week" || raw === "month") return raw;
  return "day";
}

function mustISO(raw: string | null, fallback: Date): string {
  if (!raw) return fallback.toISOString();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? fallback.toISOString() : d.toISOString();
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function GET(req: Request) {
  const gate = await requireAdminFromRequest(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const bucket = pickBucket(url.searchParams.get("bucket"));

  const now = new Date();
  const startFallback = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const p_start = mustISO(url.searchParams.get("start"), startFallback);
  const p_end = mustISO(url.searchParams.get("end"), now);

  // Use the service-role client from the gate — analytics RPCs no longer
  // check assert_admin() so service-role is the correct caller here.
  const sb = gate.admin;

  const [
    kpis,
    traffic,
    activeUsers,
    signups,
    posts,
    postPurges,
    userPurges,
  ] = await Promise.all([
    sb.rpc("admin_kpis_v2", { p_start, p_end }) as unknown as Promise<RpcResult<unknown>>,
    sb.rpc("admin_pageviews_timeseries", { p_start, p_end, p_bucket: bucket }) as unknown as Promise<RpcResult<unknown[]>>,
    sb.rpc("admin_active_users_timeseries", { p_start, p_end, p_bucket: bucket }) as unknown as Promise<RpcResult<unknown[]>>,
    sb.rpc("admin_signups_timeseries", { p_start, p_end, p_bucket: bucket }) as unknown as Promise<RpcResult<unknown[]>>,
    sb.rpc("admin_posts_timeseries", { p_start, p_end, p_bucket: bucket }) as unknown as Promise<RpcResult<unknown[]>>,
    sb.rpc("admin_post_purges_timeseries", { p_start, p_end, p_bucket: bucket }) as unknown as Promise<RpcResult<unknown[]>>,
    sb.rpc("admin_user_purges_timeseries", { p_start, p_end, p_bucket: bucket }) as unknown as Promise<RpcResult<unknown[]>>,
  ]);

  const firstErr =
    kpis.error ||
    traffic.error ||
    activeUsers.error ||
    signups.error ||
    posts.error ||
    postPurges.error ||
    userPurges.error;

  if (firstErr) {
    return NextResponse.json({ error: firstErr.message }, { status: 500 });
  }

  const kpisRow = Array.isArray(kpis.data) ? (kpis.data[0] as unknown) : kpis.data;
  const k = asRecord(kpisRow);

  const trafficSeries = (traffic.data ?? []).map((row) => {
    const r = asRecord(row);
    return {
      bucketStart: str(r.bucket_start),
      pageviews: num(r.pageviews),
      sessions: num(r.sessions),
      uniqueUsers: num(r.unique_users),
    };
  });

  const activeUsersSeries = (activeUsers.data ?? []).map((row) => {
    const r = asRecord(row);
    return { bucketStart: str(r.bucket_start), activeUsers: num(r.active_users) };
  });

  const signupsSeries = (signups.data ?? []).map((row) => {
    const r = asRecord(row);
    return { bucketStart: str(r.bucket_start), signups: num(r.signups) };
  });

  const postsSeries = (posts.data ?? []).map((row) => {
    const r = asRecord(row);
    return {
      bucketStart: str(r.bucket_start),
      postsCreated: num(r.posts_created),
      postsPublished: num(r.posts_published),
      postsSoftDeleted: num(r.posts_soft_deleted),
    };
  });

  // Build purges series aligned to traffic buckets (so the chart always has consistent x-axis)
  const postByBucket = new Map<string, number>();
  for (const row of postPurges.data ?? []) {
    const r = asRecord(row);
    postByBucket.set(str(r.bucket_start), num(r.posts_purged));
  }

  const userByBucket = new Map<string, number>();
  for (const row of userPurges.data ?? []) {
    const r = asRecord(row);
    userByBucket.set(str(r.bucket_start), num(r.users_purged));
  }

  const bucketKeys =
    trafficSeries.length > 0
      ? trafficSeries.map((p) => p.bucketStart)
      : Array.from(new Set([...postByBucket.keys(), ...userByBucket.keys()])).sort();

  const purgesSeries = bucketKeys.map((bucketStart) => ({
    bucketStart,
    postsPurged: postByBucket.get(bucketStart) ?? 0,
    usersPurged: userByBucket.get(bucketStart) ?? 0,
  }));

  return NextResponse.json({
    kpis: {
      pageviews: num(k.pageviews),
      visits: num(k.visits),
      bounceRate: num(k.bounce_rate),
      avgSessionMinutes: num(k.avg_session_minutes),
      uniqueUsers: num(k.unique_users),
      signups: num(k.signups),
      postsCreated: num(k.posts_created),
      postsPublished: num(k.posts_published),
      postsSoftDeleted: num(k.posts_soft_deleted),
      postsPurged: num(k.posts_purged),
      usersSuspended: num(k.users_suspended),
      usersBanned: num(k.users_banned),
      usersPurged: num(k.users_purged),
    },
    series: {
      traffic: trafficSeries.map((p) => ({
        bucketStart: p.bucketStart,
        pageviews: p.pageviews,
        sessions: p.sessions,
        uniqueUsers: p.uniqueUsers,
      })),
      activeUsers: activeUsersSeries,
      signups: signupsSeries,
      posts: postsSeries,
      purges: purgesSeries,
    },
  });
}
