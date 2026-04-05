import SearchPageClient from './SearchPageClient'
import { PAGE_SIZE, loadSearchPageData } from '@/lib/search/searchPageData'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type SearchPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const resolvedSearchParams = await searchParams
  const initialData = await loadSearchPageData(resolvedSearchParams)
  const clientKey = JSON.stringify({
    q: initialData.query.q,
    channel: initialData.query.channel,
    subcat: initialData.query.subcat,
    sort: initialData.query.sort,
  })

  return <SearchPageClient key={clientKey} initialData={initialData} pageSize={PAGE_SIZE} />
}
