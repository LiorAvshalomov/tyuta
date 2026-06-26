import { safeJsonLdStringify } from '@/lib/safeJsonLd'

const SITE_URL = 'https://tyuta.net'
const SITE_NAME = 'Tyuta'
const SITE_NAME_HE = 'טיוטה'
const SITE_DESCRIPTION =
  'טיוטה היא המקום לכל הגרסאות שלך: פלטפורמה ישראלית לכתיבה עברית, עם סיפורים, שירים, פריקה ומחשבות מאת כותבים וכותבות מהקהילה.'

function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(data) }}
    />
  )
}

export default function HomeJsonLd() {
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    alternateName: SITE_NAME_HE,
    url: SITE_URL,
    logo: `${SITE_URL}/apple-touch-icon.png`,
  }

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    alternateName: [SITE_NAME_HE, 'Tyuta (טיוטה)'],
    inLanguage: 'he-IL',
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }
  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'טיוטה - המקום לכל הגרסאות שלך | Tyuta',
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    inLanguage: 'he-IL',
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: SITE_URL,
    },
    about: ['כתיבה עברית', 'סיפורים קצרים', 'שירים', 'פריקה', 'קהילת כותבים בישראל'],
  }

  return (
    <>
      <JsonLd data={organizationSchema} />
      <JsonLd data={websiteSchema} />
      <JsonLd data={webPageSchema} />
    </>
  )
}
