import { NotificationsView } from '@/components/notifications-view'
import { RequireAuth } from '@/components/require-auth'

// Sem teamRole: notificações de ação do cliente valem tanto pro owner
// quanto pro editor.
export default function NotificacoesPage() {
  return (
    <RequireAuth>
      <NotificationsView />
    </RequireAuth>
  )
}
