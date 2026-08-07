import { PortfoliosView } from '@/components/portfolios-view'
import { RequireAuth } from '@/components/require-auth'

// Portfólio é vitrine/identidade da agência — exclusivo do owner (mesma regra de /clientes).
export default function PortfoliosPage() {
  return (
    <RequireAuth teamRole="owner">
      <PortfoliosView />
    </RequireAuth>
  )
}
