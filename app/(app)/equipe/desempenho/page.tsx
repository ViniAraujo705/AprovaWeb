import { TeamPerformanceView } from '@/components/team-performance-view'
import { RequireAuth } from '@/components/require-auth'

// Desempenho da equipe é uma métrica de gestão — exclusiva do owner.
export default function DesempenhoPage() {
  return (
    <RequireAuth teamRole="owner">
      <TeamPerformanceView />
    </RequireAuth>
  )
}
