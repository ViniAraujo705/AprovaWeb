import { AgencyShell } from '@/components/agency-shell'
import { RequireAuth } from '@/components/require-auth'

/**
 * Layout das rotas protegidas do profissional de marketing.
 * Garante sessão válida e aplica a casca (sidebar + header mobile).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AgencyShell>{children}</AgencyShell>
    </RequireAuth>
  )
}
