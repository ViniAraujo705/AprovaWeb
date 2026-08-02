import { PlanView } from '@/components/plan-view'
import { RequireAuth } from '@/components/require-auth'

// Owner e editor acessam — o editor também esbarra em limites (ex: teto de
// vídeos/mês) e precisa entender o que está bloqueado e por quê.
export default function MeuPlanoPage() {
  return (
    <RequireAuth>
      <PlanView />
    </RequireAuth>
  )
}
