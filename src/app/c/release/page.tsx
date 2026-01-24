import ChannelFeedPage from '@/components/ChannelFeedPage'

export default async function ReleasePage() {
  return (
    <ChannelFeedPage
      channelSlug="release"
      channelName="פריקה"
      subtitle="פיד מסונן לקטגוריה"
      subcategories={['מחשבות', 'שירים', 'וידויים']}
      tiles={[
        { key: 'moving', label: 'מרגש' },
        { key: 'funny', label: 'מצחיק' },
        { key: 'creative', label: 'יצירתי' },
        { key: 'inspiring', label: 'מעורר השראה' },
        { key: 'relatable', label: 'מזדהה' },
      ]}
    />
  )
}
