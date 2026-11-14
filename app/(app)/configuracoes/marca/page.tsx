import { BrandSettings } from '@/components/settings-view'
import { RequireAuth } from '@/components/require-auth'

// Marca própria é da agência: só o dono altera (o backend também bloqueia).
export default function MarcaPage() {
  return (
    <RequireAuth teamRole="owner">
      <BrandSettings />
    </RequireAuth>
  )
}
