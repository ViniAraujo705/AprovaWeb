import { SecuritySettings } from '@/components/settings-view'
import { RequireAuth } from '@/components/require-auth'

export default function SegurancaPage() {
  return (
    <RequireAuth>
      <SecuritySettings />
    </RequireAuth>
  )
}
