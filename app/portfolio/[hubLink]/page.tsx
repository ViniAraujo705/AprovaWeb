import { cache } from 'react'
import type { Metadata } from 'next'
import { PublicPortfolioHubView } from '@/components/public-portfolio-hub-view'
import { LinkUnavailable } from '@/components/link-unavailable'
import { publicService } from '@/lib/services'
import type { PublicPortfolioHub } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * Busca o hub público uma única vez por request (React cache), reaproveitando
 * o resultado entre generateMetadata e o componente da página.
 */
const getHub = cache(async (hubLink: string): Promise<PublicPortfolioHub | null> => {
  try {
    return await publicService.getPortfolioHub(hubLink)
  } catch {
    // 404, link inválido ou sem backend: tratamos como indisponível.
    return null
  }
})

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hubLink: string }>
}): Promise<Metadata> {
  const { hubLink } = await params
  const data = await getHub(hubLink)

  if (!data) {
    return {
      title: 'Link indisponível — APROVA',
      description: 'Este link de portfólio não existe ou expirou.',
    }
  }

  const title = data.agencyName || 'Portfólio'
  return {
    title: `${title} — APROVA`,
    description: 'Confira os portfólios em destaque, direto pelo navegador.',
    openGraph: {
      title,
      description: 'Confira os portfólios em destaque, direto pelo navegador.',
      siteName: 'APROVA',
    },
  }
}

export default async function PublicPortfolioHubPage({
  params,
}: {
  params: Promise<{ hubLink: string }>
}) {
  const { hubLink } = await params
  const data = await getHub(hubLink)

  if (!data) {
    return (
      <LinkUnavailable description="Este link de portfólio não existe ou expirou. Peça um novo link para a agência." />
    )
  }

  return <PublicPortfolioHubView hub={data} />
}
