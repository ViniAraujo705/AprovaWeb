import { PortfolioDetailView } from '@/components/portfolio-detail-view'
import { RequireAuth } from '@/components/require-auth'

export default async function PortfolioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <RequireAuth teamRole="owner">
      <PortfolioDetailView id={id} />
    </RequireAuth>
  )
}
