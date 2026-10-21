import { DashboardView } from '@/components/dashboard-view'
import { RequireAuth } from '@/components/require-auth'

// Lista de vídeos (antigo /dashboard) — exclusiva do owner, editor cai em /kanban.
export default function VideosPage() {
  return (
    <RequireAuth teamRole="owner" redirectTo="/kanban">
      <DashboardView />
    </RequireAuth>
  )
}
