'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Film, User } from 'lucide-react'
import type { PublicPortfolioHub } from '@/lib/types'
import { AgencyLogo } from '@/components/agency-logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { EmptyState } from '@/components/states'
import { FadeIn, StaggerList, staggerItem, motion } from '@/components/motion'
import { brandAccentStyle } from '@/lib/theme'

/**
 * Hub público da agência (rota /portfolio/:hubLink) — vitrine central com
 * sidebar fixa listando todos os álbuns por categoria + grid full-bleed de
 * capas, sem espaçamento entre elas (nome do álbum só aparece no hover).
 * Clicar num álbum abre a página que já existe (/p/:link), sem nenhuma
 * mudança ali — nenhum dado de cliente/projeto é exposto aqui.
 */
export function PublicPortfolioHubView({ hub }: { hub: PublicPortfolioHub }) {
  const categories = hub.categories.filter((c) => c.portfolios.length > 0)

  return (
    <div
      className="flex min-h-screen bg-background"
      style={brandAccentStyle(hub.branding?.accentColor)}
    >
      <aside className="hidden w-72 shrink-0 flex-col overflow-y-auto bg-sidebar px-10 py-12 text-center text-sidebar-foreground md:flex">
        <div className="flex flex-col items-center gap-4">
          <AgencyLogo branding={hub.branding} size="lg" />

          {(hub.photoUrl || hub.agencyName) && (
            <div className="flex flex-col items-center gap-3">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-full border border-sidebar-border bg-secondary">
                {hub.photoUrl ? (
                  <Image src={hub.photoUrl} alt="" fill className="object-cover" sizes="56px" unoptimized />
                ) : (
                  <span className="grid h-full w-full place-items-center text-muted-foreground/60">
                    <User className="size-5" />
                  </span>
                )}
              </div>
              {hub.agencyName && (
                <span className="font-display text-lg tracking-wide">{hub.agencyName}</span>
              )}
            </div>
          )}
        </div>

        {categories.length > 0 && (
          <nav className="mt-14 space-y-10">
            {categories.map((c) => (
              <div key={c.id}>
                <a
                  href={`#cat-${c.id}`}
                  className="block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-sidebar-foreground"
                >
                  {c.name}
                </a>
                <ul className="mt-4 space-y-3">
                  {c.portfolios.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/p/${p.link}`}
                        className="block truncate text-[15px] text-sidebar-foreground/65 transition-colors hover:text-sidebar-foreground"
                        title={p.name}
                      >
                        {p.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        )}

        <ThemeToggle />
      </aside>

      <div className="min-w-0 flex-1">
        <motion.header
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:hidden"
        >
          <AgencyLogo branding={hub.branding} />
          <ThemeToggle />
        </motion.header>

        {categories.length === 0 ? (
          <div className="flex min-h-[70vh] items-center justify-center px-4">
            <EmptyState
              icon={<Film className="size-7" />}
              title="Nenhum portfólio em destaque"
              description="Os portfólios da agência vão aparecer aqui assim que forem publicados."
            />
          </div>
        ) : (
          <FadeIn>
            <StaggerList className="grid grid-cols-2">
              {categories.flatMap((c) =>
                c.portfolios.map((p, i) => (
                  <motion.div key={p.id} id={i === 0 ? `cat-${c.id}` : undefined} variants={staggerItem}>
                    <Link
                      href={`/p/${p.link}`}
                      className="group relative block aspect-square w-full overflow-hidden bg-secondary"
                    >
                      {p.coverUrl ? (
                        <Image
                          src={p.coverUrl}
                          alt=""
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                          sizes="50vw"
                          unoptimized
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-muted-foreground/60">
                          <Film className="size-6" />
                        </span>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 p-4 text-center opacity-0 transition-all duration-300 group-hover:bg-black/55 group-hover:opacity-100">
                        <h3 className="font-display text-base tracking-[0.05em] text-white sm:text-xl">
                          {p.name}
                        </h3>
                      </div>
                    </Link>
                  </motion.div>
                )),
              )}
            </StaggerList>
          </FadeIn>
        )}
      </div>
    </div>
  )
}
