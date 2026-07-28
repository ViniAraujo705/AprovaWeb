import { SettingsView } from '@/components/settings-view'
import { RequireAuth } from '@/components/require-auth'

// Configurações de branding são exclusivas do owner (escondidas do editor).
export default function ConfiguracoesPage() {
  return (
    <RequireAuth teamRole="owner">
      <SettingsView />
    </RequireAuth>
  )
}
