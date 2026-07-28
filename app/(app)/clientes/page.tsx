import { ClientsView } from '@/components/clients-view'
import { RequireAuth } from '@/components/require-auth'

// Configuração de clientes é exclusiva do owner (mesma regra de /configuracoes).
export default function ClientesPage() {
  return (
    <RequireAuth teamRole="owner">
      <ClientsView />
    </RequireAuth>
  )
}
