'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { slugifyUsername } from '@/lib/auth'
import { USERNAME_MAX, DISPLAY_NAME_MAX } from '@/lib/validation'
import Avatar from '@/components/Avatar'
import AvatarUpload from '@/components/AvatarUpload'
import { waitForClientSession } from '@/lib/auth/clientSession'
import { buildLoginRedirect, shouldRunLoginRedirect } from '@/lib/auth/protectedRoutes'
import { notifyProfileUpdated } from '@/lib/profileFreshness'
import { mapSupabaseError } from '@/lib/mapSupabaseError'

type ProfileRow = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  bio: string | null
}

const BIO_MAX = 120

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

  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [removeAvatar, setRemoveAvatar] = useState(false)

  const avatarPreview = useMemo(() => {
    if (!removeAvatar && profile?.avatar_url) return profile.avatar_url
    const seed = (displayName || profile?.display_name || 'משתמש').trim()
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}`
  }, [displayName, profile?.avatar_url, profile?.display_name, removeAvatar])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setErr(null)
      setMsg(null)

      const resolved = await waitForClientSession()
      if (resolved.status !== 'authenticated') {
        const loginTarget = buildLoginRedirect('/settings/profile')
        if (shouldRunLoginRedirect(loginTarget)) {
          router.replace(loginTarget)
        }
        return
      }

      const u = resolved.user
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

      const row = p as ProfileRow
      setProfile(row)
      setDisplayName(row.display_name ?? '')
      setUsername(row.username ?? '')
      setBio(row.bio ?? '')
      setLoading(false)
    }

    void load()
  }, [router])

  const save = async () => {
    setErr(null)
    setMsg(null)
    if (!userId) return

    const dn = displayName.trim()
    const un = slugifyUsername(username)
    const b = bio.trim().slice(0, BIO_MAX)

    if (!dn) {
      setErr('אנא הזן שם תצוגה')
      return
    }

    if (dn.length > DISPLAY_NAME_MAX) {
      setErr(`שם תצוגה יכול להיות עד ${DISPLAY_NAME_MAX} תווים`)
      return
    }

    if (!un || un.length < 3) {
      setErr('שם משתמש חייב להיות לפחות 3 תווים (a-z, 0-9, _)')
      return
    }

    if (un.length > USERNAME_MAX) {
      setErr(`שם משתמש יכול להיות עד ${USERNAME_MAX} תווים`)
      return
    }

    setSaving(true)

    const previousUsername = profile?.username ?? null
    let finalAvatarUrl = removeAvatar ? null : profile?.avatar_url ?? null

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

    const { error: upErr } = await supabase
      .from('profiles')
      .update({
        display_name: dn,
        username: un,
        bio: b || null,
        ...(removeAvatar ? { avatar_url: null } : {}),
      })
      .eq('id', userId)

    if (upErr) {
      setSaving(false)
      const friendly = mapSupabaseError(upErr)
      if (friendly) {
        setErr(friendly)
        return
      }
      if (upErr.message.includes('profiles_username_unique')) {
        setErr('שם המשתמש כבר תפוס. נסה משהו אחר.')
      } else {
        setErr(upErr.message)
      }
      return
    }

    if (avatarFile) {
      const uploadedAvatarUrl = await uploadAvatar(userId, avatarFile)
      if (!uploadedAvatarUrl) {
        setSaving(false)
        return
      }
      finalAvatarUrl = uploadedAvatarUrl
      setAvatarFile(null)
    }

    if (removeAvatar) {
      setProfile((prev) => (prev ? { ...prev, avatar_url: null } : prev))
      setRemoveAvatar(false)
      void removeStoredAvatar()
    }

    const nextProfile: ProfileRow | null = profile
      ? {
          ...profile,
          username: un,
          display_name: dn,
          bio: b || null,
          avatar_url: finalAvatarUrl,
        }
      : null

    if (nextProfile) {
      setProfile(nextProfile)
    }

    void logIdentityAudit({
      previousUsername,
      nextUsername: un,
      previousDisplayName: profile?.display_name ?? null,
      nextDisplayName: dn,
    })

    await revalidateProfileSurfaces(previousUsername, un)
    notifyProfileUpdated({
      userId,
      previousUsername,
      username: un,
      displayName: dn,
      avatarUrl: finalAvatarUrl,
    })

    setSaving(false)
    router.push(`/u/${un}`)
    router.refresh()
  }

  const uploadAvatar = async (uid: string, file: File): Promise<string | null> => {
    try {
      setAvatarUploading(true)

      const path = `${uid}/profile.jpg`
      const version = Date.now()

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, cacheControl: '31536000', contentType: 'image/jpeg' })

      if (upErr) throw new Error(mapSupabaseError(upErr) ?? upErr.message)

      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const baseUrl = data.publicUrl
      const versionedUrl = `${baseUrl}?v=${version}`

      const { error: pErr } = await supabase
        .from('profiles')
        .update({ avatar_url: versionedUrl })
        .eq('id', uid)

      if (pErr) throw new Error(mapSupabaseError(pErr) ?? pErr.message)

      setProfile((prev) => (prev ? { ...prev, avatar_url: versionedUrl } : prev))
      return versionedUrl
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e)
      setErr(m)
      return null
    } finally {
      setAvatarUploading(false)
    }
  }

  const revalidateProfileSurfaces = async (previousUsername: string | null, nextUsername: string) => {
    const resolution = await waitForClientSession(4000)
    const accessToken = resolution.status === 'authenticated' ? resolution.session.access_token : null
    if (!accessToken) return

    const requestBody = JSON.stringify({
      previousUsername,
      nextUsername,
    })

    const send = () =>
      fetch('/api/profile/revalidate', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: requestBody,
      })

    try {
      const response = await send()
      if (!response.ok) await send().catch(() => null)
    } catch {
      await send().catch(() => null)
    }
  }

  const logIdentityAudit = async (opts: {
    previousUsername: string | null
    nextUsername: string
    previousDisplayName: string | null
    nextDisplayName: string
  }) => {
    const resolution = await waitForClientSession(4000)
    const accessToken = resolution.status === 'authenticated' ? resolution.session.access_token : null
    if (!accessToken) return

    await fetch('/api/profile/audit-identity', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(opts),
    }).catch(() => null)
  }

  const removeStoredAvatar = async () => {
    const resolution = await waitForClientSession(4000)
    const accessToken = resolution.status === 'authenticated' ? resolution.session.access_token : null
    if (!accessToken) return

    await fetch('/api/profile/avatar/remove', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }).catch(() => null)
  }

  const inputClass =
    'mt-1 w-full rounded-xl border px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground transition focus:outline-none focus:ring-2 focus:ring-neutral-400/30 dark:border-border dark:focus:ring-white/10'

  if (loading) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8" dir="rtl">
        <div className="text-sm text-muted-foreground">טוען פרופיל...</div>
      </div>
    )
  }

  if (err && !profile) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8" dir="rtl">
        <h1 className="text-xl font-bold">הגדרות פרופיל</h1>
        <div className="mt-3 rounded-xl border bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50">
          {err}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8" dir="rtl">
      <h1 className="text-2xl font-bold">עריכת פרופיל</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        שם תצוגה, שם משתמש, תמונת פרופיל וביו קצר.
      </p>

      <div className="mt-6 rounded-2xl border bg-white p-4 dark:bg-card dark:border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar src={avatarPreview} name={displayName || 'משתמש'} />
            <div className="text-sm">
              <div className="font-semibold">{displayName || '—'}</div>
              <div className="text-muted-foreground">@{slugifyUsername(username) || '—'}</div>
            </div>
          </div>

          {userId ? (
            <AvatarUpload
              currentUrl={profile?.avatar_url ?? null}
              displayName={displayName || profile?.display_name || 'משתמש'}
              onSelectFile={(f) => {
                setErr(null)
                setMsg(null)
                setAvatarFile(f)
                if (f) setRemoveAvatar(false)
              }}
              onRemove={() => {
                setErr(null)
                setMsg(null)
                setAvatarFile(null)
                setRemoveAvatar(true)
              }}
            />
          ) : null}
        </div>

        <div className="mt-5 space-y-3">

          <div>
            <label className="block text-sm font-medium">שם תצוגה</label>
            <input
              className={inputClass}
              placeholder="למשל: יוסי, אנונימי"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={DISPLAY_NAME_MAX}
            />
            <div className={`mt-1 text-xs ${displayName.length >= DISPLAY_NAME_MAX ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
              {displayName.length}/{DISPLAY_NAME_MAX} תווים
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">שם משתמש (באנגלית)</label>
            <input
              className={inputClass}
              placeholder="למשל: pen_writer_12"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={USERNAME_MAX}
              dir="ltr"
            />
            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>מותר: a-z, 0-9, underscore. נשמר כך: <b>{slugifyUsername(username) || '—'}</b></span>
              <span className={slugifyUsername(username).length >= USERNAME_MAX ? 'text-red-600 dark:text-red-400' : ''}>
                {slugifyUsername(username).length}/{USERNAME_MAX}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">ביו קצר <span className="font-normal text-muted-foreground">(אופציונלי)</span></label>
            <textarea
              className={`resize-none ${inputClass}`}
              rows={3}
              placeholder="משפט-שניים עליך..."
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
              maxLength={BIO_MAX}
            />
            <div className={`mt-1 text-xs ${bio.length >= BIO_MAX ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
              {bio.length}/{BIO_MAX} תווים
            </div>
              </div>

              {err ? (
                <div className="rounded-xl border bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50">
                  {err}
                </div>
              ) : null}

              {msg ? (
                <div className="rounded-xl border bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-400 dark:border-green-900/50">
                  {msg}
                </div>
              ) : null}

              <button
                type="button"
                onClick={save}
                disabled={saving || avatarUploading}
                className="w-full rounded-xl bg-black py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-neutral-100"
              >
                {avatarUploading ? 'מעלה תמונה...' : saving ? 'שומר...' : 'שמירה'}
              </button>
            </div>
          </div>

          {profile?.username ? (
            <Link
              href={`/u/${profile.username}`}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-white/80 px-4 py-2.5 text-sm font-semibold text-neutral-800 transition hover:-translate-y-[1px] hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-foreground dark:hover:bg-white/10"
            >
              ← צפייה בפרופיל שלי
            </Link>
          ) : null}
        </div>
  )
}
