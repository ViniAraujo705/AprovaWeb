import Image from 'next/image'
import type { Branding } from '@/lib/types'
import { cn } from '@/lib/utils'
import { CheckLogo } from '@/components/page-header'

/**
 * Logo exibido no topo da tela pública do cliente.
 * Usa a marca da agência (branding.logoUrl) quando existe; caso contrário, cai
 * no logo padrão do sistema (CHECK). `size="lg"` amplia a marca para vitrines
 * onde ela é o elemento visual principal (ex.: sidebar do hub de portfólio).
 */
export function AgencyLogo({
  branding,
  size = 'sm',
}: {
  branding: Branding | null
  size?: 'sm' | 'lg' | 'icon'
}) {
  const lg = size === 'lg'
  const icon = size === 'icon'

  if (branding?.logoUrl) {
    // Só a marca, sem o nome ao lado — usada onde o espaço é um quadrado
    // fixo (ex.: rail do menu recolhido).
    if (icon) {
      return (
        <span className="relative size-8 shrink-0 overflow-hidden rounded-lg">
          <Image
            src={branding.logoUrl}
            alt={branding.agencyName || 'Logo da agência'}
            fill
            className="object-contain"
            sizes="32px"
            unoptimized
          />
        </span>
      )
    }
    return (
      <div className="flex min-w-0 items-center gap-2">
        {/*
          Caixa moderadamente quadrada (não um retângulo largo e baixo): logos
          empilhadas/quadradas (comuns em marcas reais) ficam pequenas demais
          num box muito largo e curto, já que object-contain preserva a
          proporção original.
        */}
        <span className={cn('relative shrink-0', lg ? 'h-16 w-32' : 'h-7 w-28')}>
          <Image
            src={branding.logoUrl}
            alt={branding.agencyName || 'Logo da agência'}
            fill
            className="object-contain object-left"
            sizes={lg ? '128px' : '112px'}
            unoptimized
          />
        </span>
        {branding.agencyName && (
          <span className="sr-only">{branding.agencyName}</span>
        )}
      </div>
    )
  }

  // Fallback: logo padrão do sistema (identidade Check).
  if (icon) {
    return (
      <span className="relative size-8 shrink-0 overflow-hidden rounded-lg">
        <Image src="/brand/check-mark.png" alt="Check" fill className="object-contain" sizes="32px" />
      </span>
    )
  }
  return <CheckLogo className={lg ? 'h-11 w-[180px]' : undefined} />
}
