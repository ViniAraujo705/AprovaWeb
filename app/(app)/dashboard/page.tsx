import { DashboardView } from '@/components/dashboard-view'
import { RequireAuth } from '@/components/require-auth'

// Dashboard é exclusivo do owner — editor cai em /kanban.
export default function DashboardPage() {
  return (
    <RequireAuth teamRole="owner" redirectTo="/kanban">
      <DashboardView />
    </RequireAuth>
  )
}
