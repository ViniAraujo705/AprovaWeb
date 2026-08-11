'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Camera, ChevronLeft, Film, User } from 'lucide-react'
import type { PortfolioHubItem, PortfolioItemMediaType, PublicPortfolioHub } from '@/lib/types'
import { AgencyLogo } from '@/components/agency-logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { EmptyState } from '@/components/states'
import { FadeIn, StaggerList, staggerItem, motion } from '@/components/motion'
import { brandAccentStyle } from '@/lib/theme'
import { cn } from '@/lib/utils'

const MEDIA_LABEL: Record<PortfolioItemMediaType, string> = { foto: 'Fotos', video: 'Vídeos' }
const MEDIA_ICON: Record<PortfolioItemMediaType, typeof Camera> = { foto: Camera, video: Film }

/**
 * Hub público da agência (rota /portfolio/:hubLink) — vitrine em três passos:
 * categoria → tipo de mídia (foto/vídeo) → álbuns daquele cruzamento. O passo
 * de mídia é pulado quando a categoria só tem álbuns de um tipo só, pra não
 * forçar um clique sem escolha real. Clicar num álbum abre a página que já
 * existe (/p/:link), sem nenhuma mudança ali — nenhum dado de cliente/projeto
 * é exposto aqui.
 */
export function PublicPortfolioHubView({ hub }: { hub: PublicPortfolioHub }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const categories = hub.categories.filter((c) => c.portfolios.length > 0)
  const catId = searchParams.get('cat')
  const mediaParam = searchParams.get('media') as PortfolioItemMediaType | null
  const category = categories.find((c) => c.id === catId) ?? null

  const mediaTypesInCategory = category
    ? Array.from(new Set(category.portfolios.map((p) => p.mediaType)))
    : []
  const mediaWasChosen = Boolean(mediaParam && mediaTypesInCategory.includes(mediaParam))
  const effectiveMedia: PortfolioItemMediaType | null = mediaWasChosen
    ? mediaParam
    : mediaTypesInCategory.length === 1
      ? mediaTypesInCategory[0]
      : null

  function goHome() {
    router.push(pathname)
  }
  function selectCategory(id: string) {
    router.push(`${pathname}?cat=${encodeURIComponent(id)}`)
  }
  function selectMedia(m: PortfolioItemMediaType) {
    router.push(`${pathname}?cat=${encodeURIComponent(catId as string)}&media=${m}`)
  }
  function backFromMedia() {
    goHome()
  }
  function backFromAlbums() {
    if (mediaWasChosen) router.push(`${pathname}?cat=${encodeURIComponent(catId as string)}`)
    else goHome()
  }

  return (
    <div
      className="flex min-h-screen bg-background"
      style={brandAccentStyle(hub.branding?.accentColor)}
    >
      <aside className="hidden w-72 shrink-0 flex-col overflow-y-auto bg-sidebar px-10 py-12 text-center text-sidebar-foreground md:flex">
        <button type="button" onClick={goHome} className="flex flex-col items-center gap-4">
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
        </button>

        {categories.length > 0 && (
          <nav className="mt-14 space-y-2">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectCategory(c.id)}
                className={cn(
                  'block w-full truncate text-left text-xs font-semibold uppercase tracking-[0.2em] transition-colors',
                  c.id === catId
                    ? 'text-sidebar-foreground'
                    : 'text-muted-foreground hover:text-sidebar-foreground',
                )}
              >
                {c.name}
              </button>
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
        ) : effectiveMedia === null ? (
          <MediaPicker category={category} onBack={backFromMedia} onSelect={selectMedia} />
        ) : (
          <AlbumGrid
            categoryName={category.name}
            media={effectiveMedia}
            albums={category.portfolios.filter((p) => p.mediaType === effectiveMedia)}
            onBack={backFromAlbums}
          />
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

function MediaPicker({
  category,
  onBack,
  onSelect,
}: {
  category: { id: string; name: string; portfolios: PortfolioHubItem[] }
  onBack: () => void
  onSelect: (m: PortfolioItemMediaType) => void
}) {
  const options = (['foto', 'video'] as const)
    .map((m) => ({
      media: m,
      count: category.portfolios.filter((p) => p.mediaType === m).length,
      cover: category.portfolios.find((p) => p.mediaType === m && p.coverUrl)?.coverUrl ?? null,
    }))
    .filter((o) => o.count > 0)

  return (
    <FadeIn className="px-4 py-6 sm:px-6 md:px-8">
      <BackLink label="Categorias" onBack={onBack} />
      <h1 className="mt-3 font-display text-4xl leading-none tracking-wide sm:text-5xl">
        {category.name}
      </h1>

      <StaggerList className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {options.map(({ media, count, cover }) => {
          const Icon = MEDIA_ICON[media]
          return (
            <motion.button
              key={media}
              type="button"
              variants={staggerItem}
              onClick={() => onSelect(media)}
              className="group relative block aspect-video w-full overflow-hidden rounded-xl bg-secondary text-left"
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
                  <Icon className="size-8" />
                </span>
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent p-5 flex flex-col justify-end">
                <span className="flex items-center gap-2 text-white">
                  <Icon className="size-5" />
                  <h3 className="font-display text-2xl tracking-wide">{MEDIA_LABEL[media]}</h3>
                </span>
                <p className="text-xs text-white/70">{count} {count === 1 ? 'álbum' : 'álbuns'}</p>
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
  media,
  albums,
  onBack,
}: {
  categoryName: string
  media: PortfolioItemMediaType
  albums: PortfolioHubItem[]
  onBack: () => void
}) {
  return (
    <FadeIn>
      <div className="px-4 pt-6 sm:px-6 md:px-8">
        <BackLink label={categoryName} onBack={onBack} />
        <h1 className="mt-3 font-display text-4xl leading-none tracking-wide sm:text-5xl">
          {categoryName} — {MEDIA_LABEL[media]}
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
