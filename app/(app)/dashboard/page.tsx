import { MonthlyDashboard } from '@/components/monthly-dashboard'
import { RequireAuth } from '@/components/require-auth'
import { AdminHomeRedirect } from '@/components/admin-home-redirect'

// Dashboard é exclusivo do owner — editor cai em /kanban. A lista de vídeos
// que ficava aqui agora mora em /videos. O workspace de super admin vai
// direto para /admin.
export default function DashboardPage() {
  return (
    <AdminHomeRedirect>
      <RequireAuth teamRole="owner" redirectTo="/kanban">
        <MonthlyDashboard />
      </RequireAuth>
    </AdminHomeRedirect>
  )
}
