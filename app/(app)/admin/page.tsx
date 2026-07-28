import { AdminView } from '@/components/admin-view'
import { RequireAuth } from '@/components/require-auth'

// Dupla proteção: o layout já exige sessão; aqui exigimos a role admin.
export default function AdminPage() {
  return (
    <RequireAuth role="admin">
      <AdminView />
    </RequireAuth>
  )
}
