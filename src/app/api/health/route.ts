import { NextRequest, NextResponse } from "next/server"
import { enforceIpRateLimit } from "@/lib/requestRateLimit"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const rateLimitResponse = await enforceIpRateLimit(req, {
    scope: "health_read",
    maxRequests: 120,
    windowMs: 60_000,
    message: "יותר מדי בדיקות בריאות בזמן קצר. נסו שוב בעוד רגע.",
  })
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  return NextResponse.json(
    { status: "ok", timestamp: new Date().toISOString() },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  )
}
