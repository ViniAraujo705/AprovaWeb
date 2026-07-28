import { TeamView } from '@/components/team-view'
import { RequireAuth } from '@/components/require-auth'

// Gestão de equipe é exclusiva do owner (o backend também bloqueia editores).
export default function EquipePage() {
  return (
    <RequireAuth teamRole="owner">
      <TeamView />
    </RequireAuth>
  )
}
