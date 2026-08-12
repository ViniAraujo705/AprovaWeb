'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, Film } from 'lucide-react'
import type { PortfolioHubItem, PublicPortfolioHub } from '@/lib/types'
import { AgencyLogo } from '@/components/agency-logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { EmptyState } from '@/components/states'
import { FadeIn, StaggerList, staggerItem, motion } from '@/components/motion'
import { brandAccentStyle } from '@/lib/theme'

/**
 * Hub público da agência (rota /portfolio/:hubLink) — vitrine em dois passos:
 * categoria → álbuns (foto e vídeo juntos, sem passo de mídia separado — a
 * sidebar já lista os álbuns da categoria pelo nome, estilo vitrine
 * minimalista). Clicar num álbum abre a página que já existe (/p/:link),
 * sem nenhuma mudança ali — nenhum dado de cliente/projeto é exposto aqui.
 */
export function PublicPortfolioHubView({ hub }: { hub: PublicPortfolioHub }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const categories = hub.categories.filter((c) => c.portfolios.length > 0)
  const catId = searchParams.get('cat')
  const category = categories.find((c) => c.id === catId) ?? null

  function goHome() {
    router.push(pathname)
  }
  function selectCategory(id: string) {
    router.push(`${pathname}?cat=${encodeURIComponent(id)}`)
  }

  return (
    <div
      className="flex min-h-screen bg-background"
      style={brandAccentStyle(hub.branding?.accentColor)}
    >
      <aside className="hidden w-72 shrink-0 flex-col overflow-y-auto bg-sidebar px-10 py-12 text-center text-sidebar-foreground md:flex">
        <button type="button" onClick={goHome} className="flex flex-col items-center gap-4">
          {/*
            Só mostra a marca da agência quando ela tem um logo próprio
            configurado — sem isso, AgencyLogo cai no fallback "CHECK", que
            não faz sentido aqui: essa vitrine é a marca do cliente pros
            clientes dele, a foto+nome do perfil logo abaixo já cobre a
            identidade quando não há logo.
          */}
          {hub.branding?.logoUrl && <AgencyLogo branding={hub.branding} size="lg" />}

          {/*
            object-contain (não object-cover): a foto se adapta à proporção
            real da imagem do cliente em vez de forçar um recorte quadrado —
            mesmo tratamento do logo (AgencyLogo), sem moldura/crop.
          */}
          {hub.photoUrl && (
            <div className="relative h-20 w-56 shrink-0">
              <Image src={hub.photoUrl} alt="" fill className="object-contain" sizes="224px" unoptimized />
            </div>
          )}

          {hub.agencyName && (
            <span className="font-display text-lg tracking-wide">{hub.agencyName}</span>
          )}
        </button>

        {category ? (
          // Categoria selecionada: o nome vira o cabeçalho e os álbuns dela
          // aparecem listados pelo nome, direto navegáveis — sem grade, sem
          // passo de escolher foto/vídeo.
          <nav className="mt-14">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {category.name}
            </h2>
            <div className="mt-6 space-y-4">
              {category.portfolios.map((p) => (
                <Link
                  key={p.id}
                  href={`/p/${p.link}`}
                  className="block text-base text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground"
                >
                  {p.name}
                </Link>
              ))}
            </div>
          </nav>
        ) : (
          categories.length > 0 && (
            <nav className="mt-14 space-y-5">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectCategory(c.id)}
                  className="block w-full text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-sidebar-foreground"
                >
                  {c.name}
                </button>
              ))}
            </nav>
          )
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
          <button type="button" onClick={goHome}>
            <AgencyLogo branding={hub.branding} />
          </button>
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
        ) : !category ? (
          <CategoryGrid categories={categories} onSelect={selectCategory} />
        ) : (
          <AlbumGrid categoryName={category.name} albums={category.portfolios} onBack={goHome} />
        )}
      </div>
    </div>
  )
}

function BackLink({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeft className="size-3.5" />
      {label}
    </button>
  )
}

function CategoryGrid({
  categories,
  onSelect,
}: {
  categories: { id: string; name: string; portfolios: PortfolioHubItem[] }[]
  onSelect: (id: string) => void
}) {
  return (
    <FadeIn>
      <StaggerList className="grid grid-cols-2">
        {categories.map((c) => {
          const cover = c.portfolios.find((p) => p.coverUrl)?.coverUrl ?? null
          return (
            <motion.button
              key={c.id}
              type="button"
              variants={staggerItem}
              onClick={() => onSelect(c.id)}
              className="group relative block aspect-square w-full overflow-hidden bg-secondary text-left"
            >
              {cover ? (
                <Image
                  src={cover}
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
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent p-4 flex flex-col justify-end">
                <h3 className="truncate font-display text-lg tracking-wide text-white sm:text-2xl">
                  {c.name}
                </h3>
                <p className="text-xs text-white/70">
                  {c.portfolios.length} {c.portfolios.length === 1 ? 'álbum' : 'álbuns'}
                </p>
              </div>
            </motion.button>
          )
        })}
      </StaggerList>
    </FadeIn>
  )
}

function AlbumGrid({
  categoryName,
  albums,
  onBack,
}: {
  categoryName: string
  albums: PortfolioHubItem[]
  onBack: () => void
}) {
  return (
    <FadeIn>
      <div className="px-4 pt-6 sm:px-6 md:px-8">
        <BackLink label="Categorias" onBack={onBack} />
        <h1 className="mt-3 font-display text-4xl leading-none tracking-wide sm:text-5xl">
          {categoryName}
        </h1>
      </div>

      <StaggerList className="mt-6 grid grid-cols-2">
        {albums.map((p) => (
          <motion.div key={p.id} variants={staggerItem}>
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
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent p-3 pt-10 transition-opacity duration-300 md:opacity-0 md:group-hover:opacity-100">
                <h3 className="truncate font-display text-sm tracking-wide text-white sm:text-base">
                  {p.name}
                </h3>
              </div>
            </Link>
          </motion.div>
        ))}
      </StaggerList>
    </FadeIn>
  )
}
