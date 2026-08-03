import { Suspense } from 'react'
import { PlanView } from '@/components/plan-view'
import { RequireAuth } from '@/components/require-auth'

// Owner e editor acessam — o editor também esbarra em limites (ex: teto de
// vídeos/mês) e precisa entender o que está bloqueado e por quê.
export default function MeuPlanoPage() {
  return (
    <RequireAuth>
      {/* PlanView usa useSearchParams (?status=sucesso do retorno do
          checkout) — o App Router exige um limite de Suspense em volta. */}
      <Suspense fallback={null}>
        <PlanView />
      </Suspense>
    </RequireAuth>
  )
}
