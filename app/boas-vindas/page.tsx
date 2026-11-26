import { Suspense } from 'react'
import type { Metadata } from 'next'
import { RequireAuth } from '@/components/require-auth'
import { PlanLimitProvider } from '@/components/plan-limit-provider'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'

export const metadata: Metadata = { title: 'Boas-vindas · Check' }

/**
 * Primeiro acesso do dono da conta: passo a passo em tela cheia, fora da
 * casca do app (sem sidebar), com o conteúdo adaptado ao plano.
 */
export default function BoasVindasPage() {
  return (
    <RequireAuth teamRole="owner">
      <PlanLimitProvider>
        <Suspense fallback={null}>
          <OnboardingFlow />
        </Suspense>
      </PlanLimitProvider>
    </RequireAuth>
  )
}
