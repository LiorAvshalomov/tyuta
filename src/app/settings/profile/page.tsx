'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Avatar from '@/components/Avatar'

type ProfileRow = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  bio: string | null
}

function slugifyUsername(input: string) {
  // only a-z 0-9 _
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20)
}

export default function ProfileSettingsPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)

  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')

  const [bio, setBio] = useState('')


  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const avatarPreview = useMemo(() => {
    const dn = displayName.trim()
    if (!dn) return profile?.avatar_url ?? null
    // keep svg (we already support unoptimized svg in Avatar.tsx)
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(dn)}`
  }, [displayName, profile?.avatar_url])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setErr(null)
      setMsg(null)

      const { data } = await supabase.auth.getUser()
      const u = data.user
      if (!u) {
        router.push('/login')
        return
      }

      setUserId(u.id)

      const { data: p, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio')
        .eq('id', u.id)
        .single()

      if (error || !p) {
        setErr(error?.message ?? 'לא נמצא פרופיל')
        setLoading(false)
        return
      }

      setProfile(p as ProfileRow)
      setDisplayName((p as ProfileRow).display_name ?? '')
      setUsername((p as ProfileRow).username ?? '')
      setBio((p as ProfileRow).bio ?? '')
      setLoading(false)
    }

    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    setErr(null)
    setMsg(null)

    if (!userId) return

    const dn = displayName.trim()
    const un = slugifyUsername(username)

    if (!dn) {
      setErr('אנא הזן שם תצוגה')
      return
    }

    if (!un || un.length < 3) {
      setErr('שם משתמש חייב להיות לפחות 3 תווים (a-z, 0-9, _)')
      return
    }

    setSaving(true)

    // 1) check username uniqueness (excluding me)
    const { data: takenRows, error: takenErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', un)
      .neq('id', userId)
      .limit(1)

    if (takenErr) {
      setSaving(false)
      setErr(takenErr.message)
      return
    }

    if ((takenRows?.length ?? 0) > 0) {
      setSaving(false)
      setErr('שם המשתמש כבר תפוס. נסה משהו אחר.')
      return
    }

    // 2) update profile
    const avatarUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(dn)}`

const { error: upErr } = await supabase
  .from('profiles')
  .update({
    display_name: dn,
    username: un,
    avatar_url: avatarUrl,
    bio: bio.trim() || null,
  })
  .eq('id', userId)


    setSaving(false)

if (upErr) {
  // טיפול נעים בעברית לשם משתמש תפוס
  if (upErr.message.includes('profiles_username_unique')) {
    setErr('שם המשתמש כבר תפוס. נסה משהו אחר.')
  } else {
    setErr(upErr.message)
  }
  return
}

    

    

    setMsg('נשמר ✅')
    setProfile(prev =>
      prev
        ? { ...prev, display_name: dn, username: un, avatar_url: avatarUrl }
        : prev
    )

  }
  

  if (loading) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8" dir="rtl">
        <div className="text-sm text-muted-foreground">טוען פרופיל…</div>
      </div>
    )
  }

  if (err && !profile) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8" dir="rtl">
        <h1 className="text-xl font-bold">הגדרות פרופיל</h1>
        <div className="mt-3 rounded-xl border bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      </div>
    )
  }

  

  return (
    <div className="mx-auto max-w-xl px-4 py-8" dir="rtl">
      <h1 className="text-2xl font-bold">עריכת פרופיל</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        כאן אתה יכול לשנות שם תצוגה, שם משתמש ותמונת פרופיל.
      </p>

      <div className="mt-6 rounded-2xl border bg-white p-4">
        <div className="flex items-center gap-3">
          <Avatar src={avatarPreview} name={displayName || 'משתמש'} />
          <div className="text-sm">
            <div className="font-semibold">{displayName || '—'}</div>
            <div className="text-muted-foreground">@{slugifyUsername(username) || '—'}</div>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <div>
            <label className="block text-sm font-medium">שם תצוגה</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2"
              placeholder="למשל: יוסי, אנונימי, זבלה 🙂"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium">שם משתמש (באנגלית)</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2"
              placeholder="למשל: pen_writer_12"
              value={username}
              onChange={e => setUsername(e.target.value)}
            />
            <div className="mt-1 text-xs text-muted-foreground">
              מותר: a-z, 0-9, underscore. נשמר כ: <b>{slugifyUsername(username) || '—'}</b>
            </div>
          </div>

          {err ? (
            <div className="rounded-xl border bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          ) : null}

          {msg ? (
            <div className="rounded-xl border bg-green-50 p-3 text-sm text-green-700">
              {msg}
            </div>
          ) : null}

          <button
            onClick={save}
            disabled={saving}
            className="w-full rounded-xl bg-black text-white py-2 font-semibold disabled:opacity-50"
          >
            {saving ? 'שומר…' : 'שמירה'}
          </button>
        </div>
      </div>

      {profile?.username ? (
        <div className="mt-4 text-sm text-muted-foreground">
          צפייה בפרופיל:{' '}
          <a className="hover:underline" href={`/u/${profile.username}`}>
            /u/{profile.username}
          </a>
        </div>
      ) : null}

<div>
  <label className="block text-sm font-medium">ביו (אופציונלי)</label>
  <textarea
className="mt-1 w-full rounded-xl border px-3 py-2 leading-6 resize-none overflow-y-auto max-h-40"
  rows={4}
    placeholder="כמה מילים עליך… (למשל: כותב/ת בלילות, אוהב/ת סיפורים קצרים, אנונימי/ת פה כדי לפרוק)"
    value={bio}
    onChange={e => setBio(e.target.value)}
    maxLength={240}
  />
  <div className="mt-1 text-xs text-muted-foreground">
    עד 240 תווים. כרגע: <b>{bio.length}</b>
  </div>
</div>

    </div>
  )
}
