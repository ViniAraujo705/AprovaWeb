import { ConfirmEmailView } from '@/components/confirm-email-view'

// Rota pública consumida diretamente pelo link enviado no e-mail.
export default async function ConfirmarEmailPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <ConfirmEmailView token={token} />
}
