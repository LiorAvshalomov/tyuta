import HomePage from '@/app/(home)/page'
import { CHANNEL_PAGE_CONFIGS, getChannelPageMetadata } from '@/lib/home/channelPageConfig'

export const revalidate = 60

const channel = CHANNEL_PAGE_CONFIGS.magazine

export const metadata = getChannelPageMetadata('magazine')

export default async function MagazinePage() {
  return (
    <HomePage
      forcedChannelSlug={channel.slug}
      forcedChannelName={channel.pageTitle}
      forcedSubtitle={channel.subtitle}
      forcedSubcategories={channel.subcategories}
    />
  )
}
