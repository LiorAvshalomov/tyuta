import { safeJsonLdStringify } from '@/lib/safeJsonLd'

const SITE_URL = 'https://tyuta.net'
const SITE_NAME = 'Tyuta'
const SITE_NAME_HE = 'טיוטה'
const SITE_DESCRIPTION =
  'טיוטה (Tyuta) היא בית לכותבים בישראל וקהילת כתיבה עברית: מקום לכתוב, לשתף ולקרוא סיפורים, שירים, פריקה ומחשבות, מהטיוטה הראשונה ועד הפרסום.'

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
    alternateName: SITE_NAME_HE,
    inLanguage: 'he-IL',
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }

  return (
    <>
      <JsonLd data={organizationSchema} />
      <JsonLd data={websiteSchema} />
    </>
  )
}
