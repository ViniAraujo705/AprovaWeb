import { cache } from 'react'
import type { Metadata } from 'next'
import { ClientReview } from '@/components/client-review'
import { LinkUnavailable } from '@/components/link-unavailable'
import { publicService } from '@/lib/services'
import type { PublicVideo, QueueVideoItem } from '@/lib/types'
import { ApiError } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * Busca a tela pública uma única vez por request (React cache), reaproveitando
 * o resultado entre generateMetadata e o componente da página.
 */
const getPublicVideo = cache(async (link: string): Promise<PublicVideo | null> => {
  try {
    return await publicService.getByLink(link)
  } catch {
    // 404, link inválido ou sem backend: tratamos como indisponível.
    return null
  }
})

/**
 * Fila de swipe escopada ao projeto (quando o vídeo foi aberto a partir da
 * galeria `/g/:link`, identificada pelo query param `g`) — em vez da fila por
 * cliente que a API pública devolve por padrão. Retorna null se o link de
 * galeria não existir/for inválido, caso em que a página cai de volta na fila
 * por cliente vinda de `PublicVideo.queue`.
 */
const getGalleryQueue = cache(async (galleryLink: string): Promise<QueueVideoItem[] | null> => {
  try {
    const gallery = await publicService.getProjectGallery(galleryLink)
    return gallery.videos.map((v) => ({
      link: v.link,
      title: v.title,
      posterUrl: v.posterUrl,
      status: v.status,
    }))
  } catch {
    return null
  }
})

/**
 * Open Graph para preview em WhatsApp/Facebook: thumbnail como imagem, nome do
 * projeto como título e o cliente na descrição.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ link: string }>
}): Promise<Metadata> {
  const { link } = await params
  const data = await getPublicVideo(link)

  if (!data) {
    return {
      title: 'Link indisponível — CHECK',
      description: 'Este link de aprovação não existe ou expirou.',
    }
  }

  const { video, projectName, branding } = data
  const title = projectName || video.title || 'Vídeo para aprovação'
  const agency = branding?.agencyName ? `${branding.agencyName} · ` : ''
  const description = video.clientName
    ? `${agency}Vídeo enviado para ${video.clientName} aprovar, comentar e avaliar.`
    : `${agency}Assista, comente e aprove o vídeo direto pelo navegador.`
  const image = video.posterUrl || undefined

  return {
    title: `${title} — CHECK`,
    description,
    openGraph: {
      title,
      description,
      type: 'video.other',
      siteName: 'CHECK',
      images: image ? [{ url: image, alt: title }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      images: image ? [image] : undefined,
    },
  }
}

export default async function PublicVideoPage({
  params,
  searchParams,
}: {
  params: Promise<{ link: string }>
  searchParams: Promise<{ g?: string }>
}) {
  const { link } = await params
  const { g } = await searchParams
  const data = await getPublicVideo(link)

  if (!data) {
    return (
      <LinkUnavailable description="Este link de aprovação não existe ou expirou. Peça um novo link para a agência." />
    )
  }

  const galleryQueue = g ? await getGalleryQueue(g) : null

  return (
    <ClientReview
      link={link}
      initial={data}
      galleryQueue={galleryQueue ?? undefined}
      galleryLink={galleryQueue ? g : undefined}
    />
  )
}
