import { ClientFieldsView } from '@/components/client-fields-view'
import { RequireAuth } from '@/components/require-auth'

// Campos personalizados de cliente são configuração da conta — exclusivos do owner.
export default function CamposClientePage() {
  return (
    <RequireAuth teamRole="owner">
      <ClientFieldsView />
    </RequireAuth>
  )
}
