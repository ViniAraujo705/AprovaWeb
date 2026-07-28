import { PlansView } from '@/components/plans-view'
import { RequireAuth } from '@/components/require-auth'

// Billing/planos são configuração de conta — exclusivos do owner.
export default function PlanosPage() {
  return (
    <RequireAuth teamRole="owner">
      <PlansView />
    </RequireAuth>
  )
}
