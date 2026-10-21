import { MonthlyDashboard } from '@/components/monthly-dashboard'
import { RequireAuth } from '@/components/require-auth'

// Dashboard é exclusivo do owner — editor cai em /kanban. A lista de vídeos
// que ficava aqui agora mora em /videos.
export default function DashboardPage() {
  return (
    <RequireAuth teamRole="owner" redirectTo="/kanban">
      <MonthlyDashboard />
    </RequireAuth>
  )
}
