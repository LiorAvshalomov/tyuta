"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { adminFetch } from "@/lib/admin/adminFetch"

type ReportRow = {
  id: string
  created_at: string
  category?: string | null
  details?: string | null
  status?: "open" | "resolved" | string

  reporter_display_name?: string | null
  reported_display_name?: string | null
  reporter_username?: string | null
  reported_username?: string | null

  message_preview?: string | null
}

type ReportsApiResponse = {
  ok?: boolean
  error?: any
  reports?: ReportRow[]
}

function getErr(j: any, fallback: string) {
  return j?.error?.message ?? j?.error ?? fallback
}

function isReportsApiResponse(v: unknown): v is ReportsApiResponse {
  return typeof v === "object" && v !== null
}

export default function ReportsPage() {
  const [status, setStatus] = useState<"open" | "resolved">("open")
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const title = useMemo(() => (status === "open" ? "דיווחים פתוחים" : "דיווחים שטופלו"), [status])

  async function load() {
    setLoading(true)
    setError(null)

    try {
      const res = await adminFetch(`/api/admin/reports?status=${status}`)
      const contentType = res.headers.get("content-type") || ""

      // אם זה לא JSON – נציג שגיאה ברורה (בד"כ auth/edge/500)
      if (!contentType.includes("application/json")) {
        const text = await res.text()
        throw new Error(`API החזיר תשובה לא-JSON (${res.status}): ${text.slice(0, 120)}`)
      }

      const json: unknown = await res.json()
      if (!isReportsApiResponse(json)) throw new Error("תגובה לא צפויה מהשרת")
      if (!res.ok) throw new Error(getErr(json, `HTTP ${res.status}`))

      setRows(Array.isArray(json.reports) ? json.reports : [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "שגיאה לא ידועה"
      setError(msg)
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  async function toggleResolve(id: string, nextStatus: "open" | "resolved") {
    setError(null)

    // עדכון אופטימי
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: nextStatus } : r)))

    try {
      const res = await adminFetch(`/api/admin/reports/resolve`, {
        method: "POST",
        body: JSON.stringify({ id, status: nextStatus }),
      })

      const contentType = res.headers.get("content-type") || ""
      if (!contentType.includes("application/json")) {
        const text = await res.text()
        throw new Error(`API החזיר תשובה לא-JSON (${res.status}): ${text.slice(0, 120)}`)
      }

      const json: unknown = await res.json()
      if (!isReportsApiResponse(json)) throw new Error("תגובה לא צפויה מהשרת")
      if (!res.ok) throw new Error(getErr(json, `HTTP ${res.status}`))

      await load()
    } catch (e: unknown) {
      // rollback פשוט: נטען מחדש
      await load()
      const msg = e instanceof Error ? e.message : "שגיאה לא ידועה"
      setError(msg)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">{title}</h1>
          <p className="mt-1 text-sm text-neutral-600">דיווחים מהצ׳אט (מודרציה)</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className={`rounded-full border px-4 py-2 text-sm font-bold ${
              status === "open" ? "bg-black text-white" : "bg-white"
            }`}
            onClick={() => setStatus("open")}
          >
            פתוחים
          </button>
          <button
            className={`rounded-full border px-4 py-2 text-sm font-bold ${
              status === "resolved" ? "bg-black text-white" : "bg-white"
            }`}
            onClick={() => setStatus("resolved")}
          >
            טופלו
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border bg-white/70 p-4 shadow-sm">
        {error && (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-neutral-600">טוען…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-neutral-600">אין דיווחים להצגה.</div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const reporter = r.reporter_display_name || r.reporter_username || "משתמש/ת"
              const reported = r.reported_display_name || r.reported_username || "משתמש/ת"
              const preview = r.message_preview || r.details || ""
              const when = new Date(r.created_at).toLocaleString("he-IL")

              return (
                <div key={r.id} className="rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-bold">
                      <span className="text-neutral-500">דיווח:</span>{" "}
                      <span className="text-neutral-900">{r.category || "כללי"}</span>
                    </div>
                    <div className="text-xs text-neutral-500">{when}</div>
                  </div>

                  <div className="mt-2 text-sm text-neutral-800">
                    <span className="font-bold">{reporter}</span> דיווח/ה על{" "}
                    <span className="font-bold">{reported}</span>
                  </div>

                  {preview ? (
                    <div className="mt-2 whitespace-pre-wrap rounded-xl bg-neutral-50 px-3 py-2 text-sm text-neutral-800">
                      {preview}
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/reports/${r.id}`}
                        className="rounded-full border bg-white px-4 py-2 text-sm font-bold hover:bg-neutral-50"
                      >
                        פירוט
                      </Link>

                      {r.status !== "resolved" ? (
                        <button
                          className="rounded-full border bg-white px-4 py-2 text-sm font-bold hover:bg-neutral-50"
                          onClick={() => toggleResolve(r.id, "resolved")}
                        >
                          סמן טופל
                        </button>
                      ) : (
                        <button
                          className="rounded-full border bg-white px-4 py-2 text-sm font-bold hover:bg-neutral-50"
                          onClick={() => toggleResolve(r.id, "open")}
                        >
                          החזר לפתוח
                        </button>
                      )}
                    </div>

                    <div className="text-xs text-neutral-500">
                      סטטוס: <span className="font-bold">{r.status || "open"}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
