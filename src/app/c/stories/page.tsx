import ChannelFeedPage from '@/components/ChannelFeedPage'

export default async function StoriesPage() {
  return (
    <ChannelFeedPage
      channelSlug="stories"
      channelName="סיפורים"
      subtitle="פיד מסונן לקטגוריה"
      subcategories={['סיפורים אמיתיים', 'סיפורים קצרים', 'סיפור בהמשכים']}
      tiles={[
        { key: 'moving', label: 'מרגש' },
        { key: 'funny', label: 'מצחיק' },
        { key: 'creative', label: 'יצירתי' },
        { key: 'gripping', label: 'מותח' },
        { key: 'well_written', label: 'כתוב טוב' },
      ]}
    />
  )
}
