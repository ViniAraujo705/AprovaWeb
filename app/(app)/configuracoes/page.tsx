import { ProfileSettings } from '@/components/settings-view'
import { RequireAuth } from '@/components/require-auth'

// Owner e editor editam o próprio perfil.
export default function ConfiguracoesPage() {
  return (
    <RequireAuth>
      <ProfileSettings />
    </RequireAuth>
  )
}
