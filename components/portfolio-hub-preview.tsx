'use client'

import Image from 'next/image'
import type { PortfolioLink, PortfolioTemplateId } from '@/lib/types'
import { resolvePortfolioTemplateLayout } from '@/lib/portfolio-templates'
import { cn } from '@/lib/utils'

interface PortfolioHubPreviewProps {
  templateId: PortfolioTemplateId | null
  coverUrl: string | null
  photoUrl: string | null
  name: string
  bio: string
  links: Pick<PortfolioLink, 'label'>[]
  className?: string
}

/**
 * Miniatura do hub público para o modal "Editar perfil do portfólio": mostra,
 * em escala reduzida, como o tema escolhido organiza capa, perfil e grade.
 * Usa o mesmo `resolvePortfolioTemplateLayout` de `PublicPortfolioHubView`
 * para não divergir do hub real. Os cards da grade são placeholders neutros.
 */
export function PortfolioHubPreview({
  templateId,
  coverUrl,
  photoUrl,
  name,
  bio,
  links,
  className,
}: PortfolioHubPreviewProps) {
  const layout = resolvePortfolioTemplateLayout(templateId)
  const tall = templateId === 'editorial-escuro'
  const visibleLinks = links.filter((l) => l.label.trim()).slice(0, 3)

  const grid = (
    <div className={cn('grid gap-1', layout.gridColsClass)}>
      {Array.from({ length: layout.gridColsClass === 'grid-cols-3' ? 9 : 6 }).map((_, i) => (
        <div
          key={i}
          className={cn('rounded-[3px] bg-muted-foreground/15', layout.cardAspectClass)}
          style={{ opacity: 1 - (i % 3) * 0.18 }}
        />
      ))}
    </div>
  )

  const photo = photoUrl ? (
    <div className="relative h-5 w-10 shrink-0">
      <Image src={photoUrl} alt="" fill className="object-contain" sizes="40px" unoptimized />
    </div>
  ) : null

  const bioLine = bio.trim() ? (
    <p className="line-clamp-2 text-[7px] leading-snug text-muted-foreground">{bio.trim()}</p>
  ) : (
    <div className="flex w-full flex-col items-center gap-0.5">
      <span className="h-1 w-4/5 rounded-full bg-muted-foreground/20" />
      <span className="h-1 w-3/5 rounded-full bg-muted-foreground/20" />
    </div>
  )

  const linkPills = visibleLinks.length > 0 && (
    <div className="flex flex-wrap justify-center gap-1">
      {visibleLinks.map((l, i) => (
        <span
          key={i}
          className="truncate rounded-full bg-muted-foreground/15 px-1.5 text-[6px] leading-[10px] text-muted-foreground"
        >
          {l.label}
        </span>
      ))}
    </div>
  )

  const heading = (
    <span className={cn('max-w-full truncate font-display text-[9px] text-foreground', layout.headingClass)}>
      {name}
    </span>
  )

  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none aspect-[4/5] w-full select-none overflow-hidden rounded-lg border border-border bg-background shadow-sm',
        className,
      )}
    >
      {layout.sidebarPosition === 'top' ? (
        <div className="flex h-full flex-col">
          {layout.heroBanner && (
            <div className={cn('relative w-full shrink-0 bg-muted-foreground/20', tall ? 'h-[42%]' : 'h-[26%]')}>
              {coverUrl && <Image src={coverUrl} alt="" fill className="object-cover" sizes="280px" unoptimized />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            </div>
          )}
          <div
            className={cn(
              'relative flex flex-col items-center gap-1 px-3 pb-2 text-center',
              layout.heroBanner ? 'pt-2' : 'pt-3',
            )}
          >
            {photo}
            {heading}
            {bioLine}
            {linkPills}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden px-3">{grid}</div>
        </div>
      ) : (
        <div className="flex h-full">
          <div
            className={cn(
              'flex w-[38%] shrink-0 flex-col items-center gap-1 px-1.5 py-2 text-center',
              layout.sidebarBgClass,
            )}
          >
            {coverUrl && (
              <div className="relative h-8 w-full shrink-0 overflow-hidden rounded-[3px]">
                <Image src={coverUrl} alt="" fill className="object-cover" sizes="100px" unoptimized />
              </div>
            )}
            {photo}
            {heading}
            {bioLine}
            {linkPills}
          </div>
          <div className="min-w-0 flex-1 overflow-hidden p-2">{grid}</div>
        </div>
      )}
    </div>
  )
}
