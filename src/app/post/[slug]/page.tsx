import { supabase } from '@/lib/supabaseClient'
import Avatar from '@/components/Avatar'
import Link from 'next/link'
import RichText from '@/components/RichText'
import PostShell from '@/components/PostShell'
import { formatDateTimeHe } from '@/lib/time'
import PostReactions from '@/components/PostReactions'
import PostComments from '@/components/PostComments'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type PostPageProps = {
  params: Promise<{ slug: string }>
}

type Author = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type Channel = {
  name_he: string | null
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params

  const { data: post, error } = await supabase
    .from('posts')
    .select(
      `
        id,
        title,
        content_json,
        created_at,
        author_id,
        channel_id,
        channel:channels ( name_he ),
        author:profiles!posts_author_id_fkey (
          id,
          username,
          display_name,
          avatar_url
        )
      `
    )
    .eq('slug', slug)
    .single()

  if (error || !post) {
    return (
      <div className="p-5" dir="rtl">
        <h2 className="text-xl font-bold">לא נמצא פוסט</h2>
        <pre className="mt-4 text-sm bg-neutral-50 p-3 rounded border">
          {JSON.stringify({ slug, error }, null, 2)}
        </pre>
      </div>
    )
  }

  // ✅ Supabase returns relations as arrays in your setup
  const author: Author | null = Array.isArray(post.author)
    ? ((post.author[0] as Author | undefined) ?? null)
    : ((post.author as Author | null) ?? null)

  const channelName: string | null = Array.isArray(post.channel)
    ? ((post.channel[0] as Channel | undefined)?.name_he ?? null)
    : ((post.channel as Channel | null)?.name_he ?? null)

  const authorName = author?.display_name ?? 'אנונימי'
  const authorUsername = author?.username ?? null

  const channelHref =
    post.channel_id === 1 ? '/c/release'
      : post.channel_id === 2 ? '/c/stories'
        : post.channel_id === 3 ? '/c/magazine'
          : null

  return (
    <PostShell
      title={post.title}
      meta={
        <>
          {channelName && channelHref ? (
            <>
              <Link href={channelHref} className="text-blue-700 hover:underline">
                {channelName}
              </Link>
              <span className="text-muted-foreground"> · </span>
            </>
          ) : channelName ? (
            <>
              <span className="text-muted-foreground">{channelName}</span>
              <span className="text-muted-foreground"> · </span>
            </>
          ) : null}

          {formatDateTimeHe(post.created_at)}
        </>
      }
    >
      {/* כותב */}
      <div className="mt-2 mb-6 flex items-center gap-3" dir="rtl">
        <Avatar src={author?.avatar_url ?? null} name={authorName} />

        <div className="flex flex-col">
          {authorUsername ? (
            <Link href={`/u/${authorUsername}`} className="font-semibold hover:underline">
              {authorName}
            </Link>
          ) : (
            <span className="font-semibold">{authorName}</span>
          )}

          {authorUsername ? (
            <span className="text-sm text-muted-foreground">@{authorUsername}</span>
          ) : null}
        </div>
      </div>

      {/* תוכן הפוסט */}
      <RichText content={post.content_json} />

      {/* דירוגים */}
      <div className="mt-6">
        <PostReactions postId={post.id} channelId={post.channel_id} authorId={post.author_id} />
      </div>

      <PostComments postId={post.id} />
    </PostShell>
  )
}
