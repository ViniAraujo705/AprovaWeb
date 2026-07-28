import { ClientDetailView } from '@/components/client-detail-view'
import { RequireAuth } from '@/components/require-auth'

export default async function ClientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <RequireAuth teamRole="owner">
      <ClientDetailView id={id} />
    </RequireAuth>
  )
}
