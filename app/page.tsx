import { redirect } from 'next/navigation'

// A raiz encaminha para o dashboard. Usuários sem sessão são redirecionados
// ao login pelo guard da rota protegida.
export default function Home() {
  redirect('/dashboard')
}
