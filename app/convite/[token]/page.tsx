import { AcceptInviteView } from '@/components/accept-invite-view'

// Rota pública (sem login): o editor convidado cria seu acesso por aqui.
export default async function ConvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <AcceptInviteView token={token} />
}
