import { cache } from 'react'
import type { Metadata } from 'next'
import { ProjectGalleryView } from '@/components/project-gallery'
import { LinkUnavailable } from '@/components/link-unavailable'
import { publicService } from '@/lib/services'
import type { ProjectGallery } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * Busca a galeria pública uma única vez por request (React cache), reaproveitando
 * o resultado entre generateMetadata e o componente da página.
 */
const getProjectGallery = cache(async (link: string): Promise<ProjectGallery | null> => {
  try {
    return await publicService.getProjectGallery(link)
  } catch {
    // 404, link inválido ou sem backend: tratamos como indisponível.
    return null
  }
})

export async function generateMetadata({
  params,
}: {
  params: Promise<{ link: string }>
}): Promise<Metadata> {
  const { link } = await params
  const data = await getProjectGallery(link)

  if (!data) {
    return {
      title: 'Link indisponível — CHECK',
      description: 'Este link de galeria não existe ou expirou.',
    }
  }

  const title = data.projectName || 'Vídeos para aprovação'
  const description = data.clientName
    ? `Vídeos de ${title} para ${data.clientName} assistir, comentar e aprovar.`
    : 'Assista, comente e aprove os vídeos direto pelo navegador.'

  return {
    title: `${title} — CHECK`,
    description,
    openGraph: {
      title,
      description,
      siteName: 'CHECK',
    },
  }
}

export default async function ProjectGalleryPage({
  params,
}: {
  params: Promise<{ link: string }>
}) {
  const { link } = await params
  const data = await getProjectGallery(link)

  if (!data) {
    return (
      <LinkUnavailable description="Este link de galeria não existe ou expirou. Peça um novo link para a agência." />
    )
  }

  return <ProjectGalleryView gallery={data} link={link} />
}
