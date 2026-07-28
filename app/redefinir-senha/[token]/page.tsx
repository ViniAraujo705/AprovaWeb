import { ResetPasswordView } from '@/components/reset-password-view'

// Rota pública (sem login): o link do e-mail de redefinição aponta pra cá.
export default async function RedefinirSenhaPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <ResetPasswordView token={token} />
}
