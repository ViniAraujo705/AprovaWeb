import Image from 'next/image'
import { Play } from 'lucide-react'
import type { Branding } from '@/lib/types'

/**
 * Logo exibido no topo da tela pública do cliente.
 * Usa a marca da agência (branding.logoUrl) quando existe; caso contrário, cai
 * no logo padrão do sistema (APROVA).
 */
export function AgencyLogo({ branding }: { branding: Branding | null }) {
  if (branding?.logoUrl) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span className="relative h-7 w-28 shrink-0">
          <Image
            src={branding.logoUrl}
            alt={branding.agencyName || 'Logo da agência'}
            fill
            className="object-contain object-left"
            sizes="112px"
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
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
        <Play className="size-3.5 fill-current" />
      </span>
      <span className="font-display text-xl leading-none tracking-wide">APROVA</span>
    </div>
  )
}
