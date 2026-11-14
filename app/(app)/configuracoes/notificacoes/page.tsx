import { NotificationSettings } from '@/components/settings-view'
import { RequireAuth } from '@/components/require-auth'

// Preferências de e-mail de cada pessoa (a central de avisos é /notificacoes).
export default function PreferenciasNotificacaoPage() {
  return (
    <RequireAuth>
      <NotificationSettings />
    </RequireAuth>
  )
}
