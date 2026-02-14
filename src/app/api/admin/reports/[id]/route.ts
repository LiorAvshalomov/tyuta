import type { NextRequest } from "next/server"
import { requireAdminFromRequest } from "@/lib/admin/requireAdminFromRequest"
import { adminError, adminOk } from "@/lib/admin/adminHttp"

type SupaError = { message: string }
type SupaRes<T> = { data: T | null; error: SupaError | null }

type Query<T> = Promise<SupaRes<T>> & {
  select: (columns: string, opts?: Record<string, unknown>) => Query<T>
  eq: (column: string, value: unknown) => Query<T>
  in: (column: string, values: readonly unknown[]) => Query<T>
  lte: (column: string, value: unknown) => Query<T>
  lt: (column: string, value: unknown) => Query<T>
  gt: (column: string, value: unknown) => Query<T>
  order: (column: string, opts?: Record<string, unknown>) => Query<T>
  limit: (n: number) => Query<T>
  maybeSingle: () => Promise<SupaRes<T>>
}

type AdminClient = { from: <T = unknown>(table: string) => Query<T> }

type MiniProfile = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

type ReportRow = {
  id: string
  created_at: string
  category: string
  reason_code: string | null
  details: string | null
  status: "open" | "resolved"
  resolved_at: string | null
  resolved_by: string | null
  reporter_id: string
  reported_user_id: string
  conversation_id: string | null
  message_id: string | null
  message_created_at: string | null
  message_excerpt: string | null
}

type MsgRow = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  if (!id) return adminError("missing id", 400, "bad_request")

  const admin = auth.admin as unknown as AdminClient

  const reportRes = await admin
    .from<ReportRow>("user_reports")
    .select(
      "id, created_at, category, reason_code, details, status, resolved_at, resolved_by, reporter_id, reported_user_id, conversation_id, message_id, message_created_at, message_excerpt"
    )
    .eq("id", id)
    .maybeSingle()

  if (reportRes.error) return adminError(reportRes.error.message, 500, "db_error")
  const report = reportRes.data
  if (!report) return adminError("not found", 404, "not_found")

  // profiles (reporter + reported)
  const profileIds = Array.from(new Set([report.reporter_id, report.reported_user_id].filter(Boolean)))
  const profilesRes =
    profileIds.length > 0
      ? await admin.from<MiniProfile[]>("profiles").select("id, username, display_name, avatar_url").in("id", profileIds)
      : ({ data: [], error: null } as SupaRes<MiniProfile[]>)

  if (profilesRes.error) return adminError(profilesRes.error.message, 500, "db_error")

  const profilesMap = new Map<string, MiniProfile>()
  if (profilesRes.data) for (const p of profilesRes.data) profilesMap.set(p.id, p)

  // message context (±5) anchored on message_id first (most stable), fallback to message_created_at
  let messages: MsgRow[] = []
  if (report.conversation_id) {
    const convId = report.conversation_id

    if (report.message_id) {
      const anchorRes = await admin
        .from<MsgRow>("messages")
        .select("id, conversation_id, sender_id, body, created_at")
        .eq("id", report.message_id)
        .maybeSingle()

      const anchor = anchorRes.data
      if (anchor) {
        const beforeRes = await admin
          .from<MsgRow[]>("messages")
          .select("id, conversation_id, sender_id, body, created_at")
          .eq("conversation_id", convId)
          .lt("created_at", anchor.created_at)
          .order("created_at", { ascending: false })
          .limit(5)

        const afterRes = await admin
          .from<MsgRow[]>("messages")
          .select("id, conversation_id, sender_id, body, created_at")
          .eq("conversation_id", convId)
          .gt("created_at", anchor.created_at)
          .order("created_at", { ascending: true })
          .limit(5)

        const before = (beforeRes.data ?? []).slice().reverse()
        const after = afterRes.data ?? []
        messages = [...before, anchor, ...after]
      }
    }

    if (messages.length === 0 && report.message_created_at) {
      const beforeRes = await admin
        .from<MsgRow[]>("messages")
        .select("id, conversation_id, sender_id, body, created_at")
        .eq("conversation_id", convId)
        .lte("created_at", report.message_created_at)
        .order("created_at", { ascending: false })
        .limit(6)

      const afterRes = await admin
        .from<MsgRow[]>("messages")
        .select("id, conversation_id, sender_id, body, created_at")
        .eq("conversation_id", convId)
        .gt("created_at", report.message_created_at)
        .order("created_at", { ascending: true })
        .limit(5)

      const before = (beforeRes.data ?? []).slice().reverse()
      const after = afterRes.data ?? []
      messages = [...before, ...after]
    }

    if (messages.length === 0) {
      const lastRes = await admin
        .from<MsgRow[]>("messages")
        .select("id, conversation_id, sender_id, body, created_at")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false })
        .limit(10)
      messages = (lastRes.data ?? []).slice().reverse()
    }
  }

  // sender profiles for messages
  const senderIds = Array.from(new Set(messages.map((m) => m.sender_id))).filter(Boolean)
  const senderProfilesRes =
    senderIds.length > 0
      ? await admin.from<MiniProfile[]>("profiles").select("id, username, display_name, avatar_url").in("id", senderIds)
      : ({ data: [], error: null } as SupaRes<MiniProfile[]>)

  if (senderProfilesRes.error) return adminError(senderProfilesRes.error.message, 500, "db_error")

  const senderMap = new Map<string, MiniProfile>()
  if (senderProfilesRes.data) for (const p of senderProfilesRes.data) senderMap.set(p.id, p)

  return adminOk({
    report: {
      ...report,
      reporter_profile: profilesMap.get(report.reporter_id) ?? null,
      reported_profile: profilesMap.get(report.reported_user_id) ?? null,
    },
    messages: messages.map((m) => ({
      ...m,
      sender_profile: senderMap.get(m.sender_id) ?? null,
    })),
  })
}
