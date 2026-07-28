import { ClientChannelView } from '@/components/client-channel-view'
import { RequireAuth } from '@/components/require-auth'

/**
 * Visão autenticada do canal do cliente. Só o owner responde ao cliente — o
 * editor não tem acesso (bloqueado também no backend).
 */
export default async function CanalClientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <RequireAuth teamRole="owner">
      <ClientChannelView videoId={id} />
    </RequireAuth>
  )
}
