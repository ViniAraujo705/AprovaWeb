import Image from 'next/image'
import { Play } from 'lucide-react'
import type { Branding } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Logo exibido no topo da tela pública do cliente.
 * Usa a marca da agência (branding.logoUrl) quando existe; caso contrário, cai
 * no logo padrão do sistema (APROVA). `size="lg"` amplia a marca para vitrines
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
        <span className={cn('relative shrink-0', lg ? 'h-20 w-64' : 'h-7 w-28')}>
          <Image
            src={branding.logoUrl}
            alt={branding.agencyName || 'Logo da agência'}
            fill
            className="object-contain object-left"
            sizes={lg ? '256px' : '112px'}
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
      <span
        className={cn(
          'grid shrink-0 place-items-center rounded-md bg-primary text-primary-foreground',
          lg ? 'size-14 rounded-xl' : 'size-7',
        )}
      >
        <Play className={cn(lg ? 'size-6' : 'size-3.5', 'fill-current')} />
      </span>
      <span className={cn('font-display leading-none tracking-wide', lg ? 'text-3xl' : 'text-xl')}>
        APROVA
      </span>
    </div>
  )
}
