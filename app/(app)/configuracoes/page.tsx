import { SettingsView } from '@/components/settings-view'
import { RequireAuth } from '@/components/require-auth'

// Owner e editor acessam para editar o próprio perfil; a seção de branding
// dentro de SettingsView é que fica escondida do editor (gate inline).
export default function ConfiguracoesPage() {
  return (
    <RequireAuth>
      <SettingsView />
    </RequireAuth>
  )
}
