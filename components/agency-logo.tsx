import Image from 'next/image'
import type { Branding } from '@/lib/types'
import { cn } from '@/lib/utils'

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
  size?: 'sm' | 'lg'
}) {
  const lg = size === 'lg'

  if (branding?.logoUrl) {
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

  // Fallback: logo padrão do sistema.
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className={cn('relative shrink-0 overflow-hidden rounded-md', lg ? 'size-11 rounded-lg' : 'size-7')}>
        <Image src="/logo-check.png" alt="Check" fill className="object-cover" sizes={lg ? '44px' : '28px'} />
      </span>
      <span className={cn('font-display leading-none tracking-wide', lg ? 'text-2xl' : 'text-xl')}>
        CHECK
      </span>
    </div>
  )
}
