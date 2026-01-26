import AdminReportDetailClient from "@/components/admin/AdminReportDetailClient"

export default async function AdminReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <AdminReportDetailClient id={id} />
}
