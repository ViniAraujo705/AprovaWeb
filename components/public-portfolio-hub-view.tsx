'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ExternalLink, Film } from 'lucide-react'
import type { PortfolioHubItem, PublicPortfolioHub } from '@/lib/types'
import { AgencyLogo } from '@/components/agency-logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { EmptyState } from '@/components/states'
import { FadeIn, StaggerList, staggerItem, motion } from '@/components/motion'
import { useBrandAccentStyle } from '@/lib/theme'
import { resolvePortfolioTemplateLayout, type PortfolioTemplateLayout } from '@/lib/portfolio-templates'
import { cn } from '@/lib/utils'

/**
 * Hub público da agência (rota /portfolio/:hubLink) — vitrine em dois passos:
 * categoria → álbuns (foto e vídeo juntos, sem passo de mídia separado — a
 * sidebar já lista os álbuns da categoria pelo nome, estilo vitrine
 * minimalista). Clicar num álbum abre a página que já existe (/p/:link),
 * sem nenhuma mudança ali — nenhum dado de cliente/projeto é exposto aqui.
 *
 * O layout (posição da navegação, banner de capa, densidade da grade) varia
 * conforme `hub.templateId` — ver `lib/portfolio-templates.ts`. `null`
 * ("Livre") é o layout original, sidebar à esquerda.
 */
export function PublicPortfolioHubView({ hub }: { hub: PublicPortfolioHub }) {
  const brandAccent = useBrandAccentStyle(hub.branding?.accentColor)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const layout = resolvePortfolioTemplateLayout(hub.templateId)
  const categories = hub.categories.filter((c) => c.portfolios.length > 0)
  const catId = searchParams.get('cat')
  const category = categories.find((c) => c.id === catId) ?? null

  function goHome() {
    router.push(pathname)
  }
  function selectCategory(id: string) {
    router.push(`${pathname}?cat=${encodeURIComponent(id)}`)
  }

  const content =
    categories.length === 0 ? (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <EmptyState
          icon={<Film className="size-7" />}
          title="Nenhum portfólio em destaque"
          description="Os portfólios da agência vão aparecer aqui assim que forem publicados."
        />
      </div>
    ) : !category ? (
      <CategoryGrid categories={categories} onSelect={selectCategory} layout={layout} />
    ) : (
      <AlbumGrid categoryName={category.name} albums={category.portfolios} onBack={goHome} layout={layout} />
    )

  if (layout.sidebarPosition === 'top') {
    return (
      <div className="min-h-screen bg-background" style={brandAccent}>
        {layout.heroBanner && hub.coverUrl && (
          <div className="relative h-56 w-full overflow-hidden sm:h-72">
            <Image src={hub.coverUrl} alt="" fill className="object-cover" sizes="100vw" unoptimized priority />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className={cn(
            'relative flex flex-col items-center px-4 py-10 text-center',
            layout.heroBanner && hub.coverUrl && '-mt-16',
          )}
        >
          <button type="button" onClick={goHome} className="flex flex-col items-center gap-3">
            {hub.branding?.logoUrl && <AgencyLogo branding={hub.branding} size="lg" />}
            {hub.photoUrl && (
              <div className="relative h-16 w-32 shrink-0 rounded-lg bg-background">
                <Image src={hub.photoUrl} alt="" fill className="object-contain" sizes="128px" unoptimized />
              </div>
            )}
            {hub.agencyName && (
              <span className={cn('font-display text-xl', layout.headingClass)}>{hub.agencyName}</span>
            )}
          </button>

          {hub.bio && <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">{hub.bio}</p>}

          {hub.links.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
              {hub.links.map((l) => (
                <a
                  key={l.id}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ExternalLink className="size-3.5 shrink-0" /> {l.label}
                </a>
              ))}
            </div>
          )}

          {category ? (
            <div className="mt-6">
              <BackLink label="Categorias" onBack={goHome} />
              <h1 className={cn('mt-2 font-display text-3xl leading-none sm:text-4xl', layout.headingClass)}>
                {category.name}
              </h1>
            </div>
          ) : (
            categories.length > 0 && (
              <nav className="mt-6 flex flex-wrap items-center justify-center gap-2">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCategory(c.id)}
                    className="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                  >
                    {c.name}
                  </button>
                ))}
              </nav>
            )
          )}

          <div className="absolute right-4 top-4">
            <ThemeToggle />
          </div>
        </motion.div>

        {content}
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background" style={brandAccent}>
      <div className="flex min-w-0 flex-1">
        <aside
          className={cn(
            'hidden w-72 shrink-0 flex-col overflow-y-auto text-center md:flex',
            layout.sidebarBgClass,
          )}
        >
          {/* Capa fica só na sidebar (largura da coluna), não mais como faixa
              cruzando a página inteira por cima do conteúdo. */}
          {hub.coverUrl && (
            <div className="relative mx-6 mt-12 h-36 shrink-0 overflow-hidden rounded-lg">
              <Image src={hub.coverUrl} alt="" fill className="object-cover" sizes="240px" unoptimized />
            </div>
          )}
          <div className="flex flex-1 flex-col px-10 py-12">
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
                <div className="relative h-16 w-32 shrink-0">
                  <Image src={hub.photoUrl} alt="" fill className="object-contain" sizes="128px" unoptimized />
                </div>
              )}

              {hub.agencyName && (
                <span className={cn('font-display text-lg', layout.headingClass)}>{hub.agencyName}</span>
              )}
            </button>

            {hub.bio && <p className="mt-4 text-sm leading-relaxed text-current/70">{hub.bio}</p>}

            {hub.links.length > 0 && (
              <div className="mt-4 flex flex-col items-center gap-2">
                {hub.links.map((l) => (
                  <a
                    key={l.id}
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-current/70 transition-colors hover:text-current"
                  >
                    <ExternalLink className="size-3.5 shrink-0" /> {l.label}
                  </a>
                ))}
              </div>
            )}

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
                      className="block text-base text-current/70 transition-colors hover:text-current"
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
                      className="block w-full text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-current"
                    >
                      {c.name}
                    </button>
                  ))}
                </nav>
              )
            )}

            <ThemeToggle />
          </div>
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

          {content}
        </div>
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
  layout,
}: {
  categories: { id: string; name: string; portfolios: PortfolioHubItem[] }[]
  onSelect: (id: string) => void
  layout: PortfolioTemplateLayout
}) {
  return (
    <FadeIn>
      <StaggerList className={cn('grid', layout.gridColsClass)}>
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
                <h3 className={cn('truncate font-display text-lg text-white sm:text-2xl', layout.headingClass)}>
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
  layout,
}: {
  categoryName: string
  albums: PortfolioHubItem[]
  onBack: () => void
  layout: PortfolioTemplateLayout
}) {
  return (
    <FadeIn>
      {layout.sidebarPosition === 'left' && (
        <div className="px-4 pt-6 sm:px-6 md:px-8">
          <BackLink label="Categorias" onBack={onBack} />
          <h1 className={cn('mt-3 font-display text-4xl leading-none sm:text-5xl', layout.headingClass)}>
            {categoryName}
          </h1>
        </div>
      )}

      <StaggerList className={cn('mt-6 grid', layout.gridColsClass)}>
        {albums.map((p) => (
          <motion.div key={p.id} variants={staggerItem}>
            <Link
              href={`/p/${p.link}`}
              className={cn('group relative block w-full overflow-hidden bg-secondary', layout.cardAspectClass)}
            >
              {p.coverUrl ? (
                <Image
                  src={p.coverUrl}
                  alt=""
                  fill
                  className="object-cover transition-transform duration-700 ease-out md:group-hover:scale-110"
                  sizes="50vw"
                  unoptimized
                />
              ) : (
                <span className="grid h-full w-full place-items-center text-muted-foreground/60">
                  <Film className="size-6" />
                </span>
              )}
              {/* Painel semi-transparente "flutuando" com margem da borda do
                  card (não cobre 100% — a foto continua visível através
                  dele), centraliza a logo do cliente — ou o nome, quando não
                  há logo. */}
              <div className="pointer-events-none absolute inset-3 flex flex-col items-center justify-center gap-3 bg-black/0 p-4 text-center opacity-0 transition-all duration-500 md:group-hover:bg-black/45 md:group-hover:opacity-100">
                {p.logoUrl ? (
                  // Chip branco por trás da logo: garante contraste em cima de
                  // qualquer foto, sem forçar a cor da marca do cliente pra
                  // monocromático (a logo pode ter cor própria).
                  <div className="scale-95 rounded-xl bg-white/95 px-5 py-3 shadow-lg transition-transform duration-500 ease-out md:group-hover:scale-100">
                    <div className="relative h-10 w-28 max-w-full">
                      <Image
                        src={p.logoUrl}
                        alt={p.name}
                        fill
                        className="object-contain"
                        sizes="112px"
                        unoptimized
                      />
                    </div>
                  </div>
                ) : (
                  <h3 className={cn('truncate font-display text-lg text-white sm:text-2xl', layout.headingClass)}>
                    {p.name}
                  </h3>
                )}
                {p.description && (
                  <p className="max-w-sm line-clamp-3 text-xs leading-relaxed text-white/85 sm:text-sm">
                    {p.description}
                  </p>
                )}
              </div>
              {/* Mobile (sem hover): mantém o nome sempre legível na base. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent p-3 pt-10 md:hidden">
                <h3 className="truncate font-display text-sm tracking-wide text-white">{p.name}</h3>
                {p.description && (
                  <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-white/75">{p.description}</p>
                )}
              </div>
            </Link>
          </motion.div>
        ))}
      </StaggerList>
    </FadeIn>
  )
}
