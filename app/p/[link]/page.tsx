import { cache } from 'react'
import type { Metadata } from 'next'
import { PublicPortfolioView } from '@/components/public-portfolio-view'
import { LinkUnavailable } from '@/components/link-unavailable'
import { publicService } from '@/lib/services'
import type { PublicPortfolio } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * Busca o portfólio público uma única vez por request (React cache),
 * reaproveitando o resultado entre generateMetadata e o componente da página.
 */
const getPortfolio = cache(async (link: string): Promise<PublicPortfolio | null> => {
  try {
    return await publicService.getPortfolioByLink(link)
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
  const data = await getPortfolio(link)

  if (!data) {
    return {
      title: 'Link indisponível — APROVA',
      description: 'Este link de portfólio não existe ou expirou.',
    }
  }

  const title = data.name || 'Portfólio'
  return {
    title: `${title} — APROVA`,
    description: data.description || 'Vídeos em destaque, direto pelo navegador.',
    openGraph: {
      title,
      description: data.description || 'Vídeos em destaque, direto pelo navegador.',
      siteName: 'APROVA',
    },
  }
}

export default async function PublicPortfolioPage({
  params,
}: {
  params: Promise<{ link: string }>
}) {
  const { link } = await params
  const data = await getPortfolio(link)

  if (!data) {
    return (
      <LinkUnavailable description="Este link de portfólio não existe ou expirou. Peça um novo link para a agência." />
    )
  }

  return <PublicPortfolioView portfolio={data} link={link} />
}
