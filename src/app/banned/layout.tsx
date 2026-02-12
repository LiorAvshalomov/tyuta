export const dynamic = 'force-dynamic'

export default function BannedLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-black text-white overflow-hidden">{children}</div>
}
