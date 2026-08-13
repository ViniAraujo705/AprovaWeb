import { IntegrationsView } from '@/components/integrations-view'
import { RequireAuth } from '@/components/require-auth'

// Configuração de conta — exclusiva do owner, mesma régua de campos-cliente e branding.
export default function IntegracoesPage() {
  return (
    <RequireAuth teamRole="owner">
      <IntegrationsView />
    </RequireAuth>
  )
}
