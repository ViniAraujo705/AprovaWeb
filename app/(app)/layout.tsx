import { AgencyShell } from '@/components/agency-shell'
import { RequireAuth } from '@/components/require-auth'
import { Suspense } from 'react'
import { PlanLimitProvider } from '@/components/plan-limit-provider'
import { LaunchPromoCelebration } from '@/components/launch-promo-celebration'

/**
 * Layout das rotas protegidas do profissional de marketing.
 * Garante sessão válida e aplica a casca (sidebar + header mobile).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <PlanLimitProvider>
        <AgencyShell>{children}</AgencyShell>
        <Suspense fallback={null}>
          <LaunchPromoCelebration />
        </Suspense>
      </PlanLimitProvider>
    </RequireAuth>
  )
}
