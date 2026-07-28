import { InternalReview } from '@/components/internal-review'

/**
 * Revisão interna de um vídeo. O layout (app) já garante sessão; owner e editor
 * têm acesso (canal interno da agência), então não há gate extra de papel aqui.
 */
export default async function RevisaoInternaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <InternalReview videoId={id} />
}
