import ChannelFeedPage from '@/components/ChannelFeedPage'

export default async function MagazinePage() {
  return (
    <ChannelFeedPage
      channelSlug="magazine"
      channelName="מגזין"
      subtitle="פיד מסונן לקטגוריה"
      subcategories={['חדשות', 'ספורט', 'תרבות ובידור', 'דעות', 'טכנולוגיה']}
      tiles={[
        { key: 'moving', label: 'מרגש' },
        { key: 'funny', label: 'מצחיק' },
        { key: 'creative', label: 'יצירתי' },
        { key: 'interesting', label: 'מעניין' },
        { key: 'smart', label: 'חכם' },
      ]}
    />
  )
}
