import type { Metadata } from 'next'

export type ChannelPageSlug = 'release' | 'stories' | 'magazine'

export type ChannelPageConfig = {
  slug: ChannelPageSlug
  pageTitle: string
  homeLabel: string
  subtitle: string
  description: string
  subcategories: { name_he: string }[]
}

export const CHANNEL_PAGE_CONFIGS: Record<ChannelPageSlug, ChannelPageConfig> = {
  release: {
    slug: 'release',
    pageTitle: 'פריקה',
    homeLabel: 'פריקה',
    subtitle: 'הכי חם החודש בקטגוריה',
    description:
      'פריקה רגשית, וידויים ושירה. ערוץ הפריקה של Tyuta (טיוטה) למחשבות, רגעים וטקסטים אישיים.',
    subcategories: [
      { name_he: 'וידויים' },
      { name_he: 'מחשבות' },
      { name_he: 'שירים' },
    ],
  },
  stories: {
    slug: 'stories',
    pageTitle: 'סיפורים',
    homeLabel: 'סיפורים',
    subtitle: 'הכי חם החודש בקטגוריה',
    description:
      'סיפורים מהקהילה, קצרים, אמיתיים ובהמשכים. דף הגילוי המרכזי של ערוץ הסיפורים ב-Tyuta.',
    subcategories: [
      { name_he: 'סיפורים אמיתיים' },
      { name_he: 'סיפורים קצרים' },
      { name_he: 'סיפור בהמשכים' },
    ],
  },
  magazine: {
    slug: 'magazine',
    pageTitle: 'כתבות',
    homeLabel: 'מגזין',
    subtitle: 'הכי חם החודש בקטגוריה',
    description:
      'כתבות, דעות ותרבות מהקהילה הישראלית. ערוץ המגזין של Tyuta לנושאים רחבים, פרשנות ויצירה עיונית.',
    subcategories: [
      { name_he: 'חדשות' },
      { name_he: 'עולם הכתיבה' },
      { name_he: 'תרבות ובידור' },
      { name_he: 'טכנולוגיה' },
      { name_he: 'ספורט' },
      { name_he: 'דעות' },
    ],
  },
}

export function getChannelPageMetadata(slug: ChannelPageSlug): Metadata {
  const channel = CHANNEL_PAGE_CONFIGS[slug]
  const canonical = `/c/${slug}`
  const ogTitle = `${channel.pageTitle} | Tyuta`

  return {
    title: channel.pageTitle,
    description: channel.description,
    alternates: {
      canonical,
    },
    openGraph: {
      title: ogTitle,
      description: channel.description,
      url: `https://tyuta.net${canonical}`,
      siteName: 'Tyuta',
      locale: 'he_IL',
      type: 'website',
      images: [{ url: '/web-app-manifest-512x512.png', width: 512, height: 512, alt: 'Tyuta' }],
    },
    twitter: {
      card: 'summary',
      title: ogTitle,
      description: channel.description,
      images: ['/web-app-manifest-512x512.png'],
    },
  }
}
