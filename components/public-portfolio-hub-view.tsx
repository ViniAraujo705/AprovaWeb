'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { Film, User } from 'lucide-react'
import type { PublicPortfolioHub } from '@/lib/types'
import { AgencyLogo } from '@/components/agency-logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { EmptyState } from '@/components/states'
import { FadeIn, StaggerList, staggerItem, motion } from '@/components/motion'
import { brandAccentStyle } from '@/lib/theme'
import { cn } from '@/lib/utils'

/**
 * Hub público da agência (rota /portfolio/:hubLink) — vitrine central com
 * foto de perfil + todos os portfólios (álbuns) agrupados por categoria em
 * abas. Clicar num álbum abre a página que já existe (/p/:link), sem
 * nenhuma mudança ali — nenhum dado de cliente/projeto é exposto aqui.
 */
export function PublicPortfolioHubView({ hub }: { hub: PublicPortfolioHub }) {
  const categories = hub.categories.filter((c) => c.portfolios.length > 0)
  const [active, setActive] = useState(categories[0]?.id ?? null)
  const activeCategory = categories.find((c) => c.id === active) ?? categories[0] ?? null

  return (
    <div className="min-h-screen" style={brandAccentStyle(hub.branding?.accentColor)}>
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur"
      >
        <AgencyLogo branding={hub.branding} />
        <ThemeToggle />
      </motion.header>

      <FadeIn className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-full border border-border bg-secondary">
            {hub.photoUrl ? (
              <Image src={hub.photoUrl} alt="" fill className="object-cover" sizes="80px" unoptimized />
            ) : (
              <span className="grid h-full w-full place-items-center text-muted-foreground/60">
                <User className="size-8" />
              </span>
            )}
          </div>
          {hub.agencyName && (
            <h1 className="font-display text-3xl leading-none tracking-wide sm:text-4xl">
              {hub.agencyName}
            </h1>
          )}
        </div>

        {categories.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={<Film className="size-7" />}
              title="Nenhum portfólio em destaque"
              description="Os portfólios da agência vão aparecer aqui assim que forem publicados."
            />
          </div>
        ) : (
          <>
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActive(c.id)}
                  className={cn(
                    'inline-flex min-h-9 items-center justify-center rounded-full px-4 text-sm font-medium transition-colors',
                    c.id === activeCategory?.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-foreground hover:bg-secondary/70',
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {activeCategory && (
              <StaggerList
                key={activeCategory.id}
                className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {activeCategory.portfolios.map((p) => (
                  <motion.div key={p.id} variants={staggerItem}>
                    <Link
                      href={`/p/${p.link}`}
                      className="group relative block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50"
                    >
                      <div className="relative aspect-video w-full overflow-hidden bg-secondary">
                        {p.coverUrl ? (
                          <Image
                            src={p.coverUrl}
                            alt=""
                            fill
                            className="object-contain transition-transform group-hover:scale-105"
                            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                            unoptimized
                          />
                        ) : (
                          <span className="grid h-full w-full place-items-center text-muted-foreground/60">
                            <Film className="size-6" />
                          </span>
                        )}
                      </div>
                      <div className="p-3">
                        <h3 className="truncate text-sm font-medium text-foreground" title={p.name}>
                          {p.name}
                        </h3>
                        {p.description && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {p.description}
                          </p>
                        )}
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </StaggerList>
            )}
          </>
        )}
      </FadeIn>
    </div>
  )
}
