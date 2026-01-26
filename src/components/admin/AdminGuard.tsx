"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"

export default function AdminGuard({
    children,
}: {
    children: React.ReactNode
}) {
    const router = useRouter()
    const [ok, setOk] = useState<boolean | null>(null)

    useEffect(() => {
        let cancelled = false

        const run = async () => {
            // 1) חייב להיות מחובר
            const { data } = await supabase.auth.getSession()
            const session = data.session
            if (!session) {
                router.replace("/") // או /login אם יש
                return
            }

            // 2) בדיקת אדמין מול ה-API
            const res = await fetch("/api/admin/me", {
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                },
            })

            if (cancelled) return

            if (!res.ok) {
                router.replace("/")
                return
            }

            setOk(true)
        }

        run().catch(() => {
            if (!cancelled) router.replace("/")
        })

        return () => {
            cancelled = true
        }
    }, [router])

    if (ok !== true) {
        // מסך טעינה קטן - לא כבד
        return (
            <div className="mx-auto max-w-3xl p-6 text-sm text-neutral-600">
                טוען אדמין…
            </div>
        )
    }

    return <>{children}</>
}
