import HomePage from '@/app/(home)/page'
import { CHANNEL_PAGE_CONFIGS, getChannelPageMetadata } from '@/lib/home/channelPageConfig'

export const revalidate = 60

const channel = CHANNEL_PAGE_CONFIGS.stories

export const metadata = getChannelPageMetadata('stories')

export default async function StoriesPage() {
  return (
    <HomePage
      forcedChannelSlug={channel.slug}
      forcedChannelName={channel.pageTitle}
      forcedSubtitle={channel.subtitle}
      forcedSubcategories={channel.subcategories}
    />
  )
}
