import { ReportsView } from '@/components/reports-view'
import { RequireAuth } from '@/components/require-auth'

// Relatórios cruzam dados da conta inteira (todos os clientes/profissionais) — exclusivos do owner.
export default function RelatoriosPage() {
  return (
    <RequireAuth teamRole="owner">
      <ReportsView />
    </RequireAuth>
  )
}
