import type { SupabaseClient } from '@supabase/supabase-js'

type Bucket = 'day' | 'week' | 'month'
export type DashboardSnapshot = {
  kpis: {
    pageviews: number
    visits: number
    signedInVisits: number
    guestVisits: number
    bounceRate: number
    avgSessionMinutes: number
    uniqueUsers: number
    signups: number
    postsCreated: number
    postsPublished: number
    postsSoftDeleted: number
    postsPurged: number
    usersSuspended: number
    usersBanned: number
    usersPurged: number
  }
  series: {
    traffic: Array<{ bucketStart: string; pageviews: number; sessions: number; uniqueUsers: number }>
    audience: Array<{ bucketStart: string; signedInVisits: number; guestVisits: number; signedInUsers: number }>
    signups: Array<{ bucketStart: string; signups: number }>
    posts: Array<{ bucketStart: string; postsCreated: number; postsPublished: number; postsSoftDeleted: number }>
    purges: Array<{ bucketStart: string; postsPurged: number; usersPurged: number }>
  }
}

type RpcResult<T> = { data: T | null; error: { message: string } | null }
type QuickCounts = { openReports: number; openContact: number }

type RpcRow = Record<string, unknown>

function asRecord(value: unknown): RpcRow {
  return typeof value === 'object' && value !== null ? (value as RpcRow) : {}
}

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function defaultDashboardRange() {
  const now = new Date()
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const startOfDay = new Date(start)
  startOfDay.setHours(0, 0, 0, 0)

  const endOfDay = new Date(now)
  endOfDay.setHours(23, 59, 59, 999)

  return {
    bucket: 'day' as Bucket,
    start: startOfDay.toISOString(),
    end: endOfDay.toISOString(),
  }
}

export async function loadDashboardQuickCounts(
  admin: SupabaseClient,
): Promise<QuickCounts> {
  const [{ count: openReports }, { count: openContact }] = await Promise.all([
    admin.from('user_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    admin.from('contact_messages').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ])

  return {
    openReports: openReports ?? 0,
    openContact: openContact ?? 0,
  }
}

export async function loadDashboardPayload(
  admin: SupabaseClient,
  {
    start,
    end,
    bucket,
  }: {
    start: string
    end: string
    bucket: Bucket
  },
): Promise<DashboardSnapshot> {
  const [kpis, audienceKpis, traffic, audience, signups, posts, postPurges, userPurges] = await Promise.all([
    admin.rpc('admin_kpis_v2', { p_start: start, p_end: end }) as unknown as Promise<RpcResult<unknown>>,
    admin.rpc('admin_audience_kpis', { p_start: start, p_end: end }) as unknown as Promise<RpcResult<unknown>>,
    admin.rpc('admin_pageviews_timeseries', { p_start: start, p_end: end, p_bucket: bucket }) as unknown as Promise<RpcResult<unknown[]>>,
    admin.rpc('admin_audience_timeseries', { p_start: start, p_end: end, p_bucket: bucket }) as unknown as Promise<RpcResult<unknown[]>>,
    admin.rpc('admin_signups_timeseries', { p_start: start, p_end: end, p_bucket: bucket }) as unknown as Promise<RpcResult<unknown[]>>,
    admin.rpc('admin_posts_timeseries', { p_start: start, p_end: end, p_bucket: bucket }) as unknown as Promise<RpcResult<unknown[]>>,
    admin.rpc('admin_post_purges_timeseries', { p_start: start, p_end: end, p_bucket: bucket }) as unknown as Promise<RpcResult<unknown[]>>,
    admin.rpc('admin_user_purges_timeseries', { p_start: start, p_end: end, p_bucket: bucket }) as unknown as Promise<RpcResult<unknown[]>>,
  ])

  const firstError =
    kpis.error ||
    audienceKpis.error ||
    traffic.error ||
    audience.error ||
    signups.error ||
    posts.error ||
    postPurges.error ||
    userPurges.error

  if (firstError) {
    throw new Error(firstError.message)
  }

  const kpisRow = Array.isArray(kpis.data) ? kpis.data[0] : kpis.data
  const kpiRecord = asRecord(kpisRow)
  const audienceKpisRow = Array.isArray(audienceKpis.data) ? audienceKpis.data[0] : audienceKpis.data
  const audienceKpiRecord = asRecord(audienceKpisRow)

  const trafficSeries = (traffic.data ?? []).map((row) => {
    const record = asRecord(row)
    return {
      bucketStart: str(record.bucket_start),
      pageviews: num(record.pageviews),
      sessions: num(record.sessions),
      uniqueUsers: num(record.unique_users),
    }
  })

  const audienceSeries = (audience.data ?? []).map((row) => {
    const record = asRecord(row)
    return {
      bucketStart: str(record.bucket_start),
      signedInVisits: num(record.signed_in_visits),
      guestVisits: num(record.guest_visits),
      signedInUsers: num(record.signed_in_users),
    }
  })

  const signupsSeries = (signups.data ?? []).map((row) => {
    const record = asRecord(row)
    return {
      bucketStart: str(record.bucket_start),
      signups: num(record.signups),
    }
  })

  const postsSeries = (posts.data ?? []).map((row) => {
    const record = asRecord(row)
    return {
      bucketStart: str(record.bucket_start),
      postsCreated: num(record.posts_created),
      postsPublished: num(record.posts_published),
      postsSoftDeleted: num(record.posts_soft_deleted),
    }
  })

  const postByBucket = new Map<string, number>()
  for (const row of postPurges.data ?? []) {
    const record = asRecord(row)
    postByBucket.set(str(record.bucket_start), num(record.posts_purged))
  }

  const userByBucket = new Map<string, number>()
  for (const row of userPurges.data ?? []) {
    const record = asRecord(row)
    userByBucket.set(str(record.bucket_start), num(record.users_purged))
  }

  const bucketKeys =
    trafficSeries.length > 0
      ? trafficSeries.map((point) => point.bucketStart)
      : Array.from(new Set([...postByBucket.keys(), ...userByBucket.keys()])).sort()

  return {
    kpis: {
      pageviews: num(kpiRecord.pageviews),
      visits: num(kpiRecord.visits),
      signedInVisits: num(audienceKpiRecord.signed_in_visits),
      guestVisits: num(audienceKpiRecord.guest_visits),
      bounceRate: num(kpiRecord.bounce_rate),
      avgSessionMinutes: num(kpiRecord.avg_session_minutes),
      uniqueUsers: num(kpiRecord.unique_users),
      signups: num(kpiRecord.signups),
      postsCreated: num(kpiRecord.posts_created),
      postsPublished: num(kpiRecord.posts_published),
      postsSoftDeleted: num(kpiRecord.posts_soft_deleted),
      postsPurged: num(kpiRecord.posts_purged),
      usersSuspended: num(kpiRecord.users_suspended),
      usersBanned: num(kpiRecord.users_banned),
      usersPurged: num(kpiRecord.users_purged),
    },
    series: {
      traffic: trafficSeries,
      audience: audienceSeries,
      signups: signupsSeries,
      posts: postsSeries,
      purges: bucketKeys.map((bucketStart) => ({
        bucketStart,
        postsPurged: postByBucket.get(bucketStart) ?? 0,
        usersPurged: userByBucket.get(bucketStart) ?? 0,
      })),
    },
  }
}
