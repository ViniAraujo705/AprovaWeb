'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Film, ImageIcon, Loader2, Play, Share2, X } from 'lucide-react'
import type { PortfolioItem, PublicPortfolio } from '@/lib/types'
import { AgencyLogo } from '@/components/agency-logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { EmptyState } from '@/components/states'
import { FadeIn, StaggerList, staggerItem, motion, AnimatePresence } from '@/components/motion'
import { brandAccentStyle } from '@/lib/theme'

/**
 * Vitrine pública de um portfólio (rota /p/:link) — grade de vídeos em
 * destaque escolhidos manualmente pela agência, sem NENHUM dado de
 * cliente/projeto/status: só título, descrição e a marca da agência. O clique
 * abre um player simples num lightbox — nunca navega para /v/:link (tela de
 * aprovação do cliente), que não faz sentido aqui. Mosaico em colunas: cada
 * capa mantém a proporção original do vídeo/foto enviado, sem recorte forçado.
 */
export function PublicPortfolioView({ portfolio, link }: { portfolio: PublicPortfolio; link: string }) {
  const count = portfolio.videos.length
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const active = activeIndex !== null ? portfolio.videos[activeIndex] : null
  const [sharing, setSharing] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  async function share() {
    const url = `${window.location.origin}/p/${link}`
    setSharing(true)
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title: portfolio.name, url })
          return
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return
        }
      }
      try {
        await navigator.clipboard.writeText(url)
        setShareCopied(true)
        setTimeout(() => setShareCopied(false), 2000)
      } catch {
        // Sem feedback bloqueante: se a área de transferência falhar, não há
        // como avisar o visitante da URL de outro jeito por aqui.
      }
    } finally {
      setSharing(false)
    }
  }

  const shareButton = (
    <button
      type="button"
      onClick={share}
      disabled={sharing}
      aria-label="Compartilhar portfólio"
      title="Compartilhar portfólio"
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-50"
    >
      {sharing ? (
        <Loader2 className="size-4 animate-spin" />
      ) : shareCopied ? (
        <Check className="size-4" />
      ) : (
        <Share2 className="size-4" />
      )}
    </button>
  )

  return (
    <div className="flex min-h-screen bg-background" style={brandAccentStyle(portfolio.branding?.accentColor)}>
      <aside className="hidden w-72 shrink-0 flex-col items-center gap-6 bg-sidebar px-10 py-12 text-sidebar-foreground md:flex">
        <AgencyLogo branding={portfolio.branding} size="lg" />
      </aside>

      <div className="min-w-0 flex-1">
        <motion.header
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:hidden"
        >
          <AgencyLogo branding={portfolio.branding} />
          <div className="flex shrink-0 items-center gap-2">
            {shareButton}
            <ThemeToggle />
          </div>
        </motion.header>

        <div className="hidden items-center justify-end gap-2 px-6 pt-6 md:flex">
          {shareButton}
          <ThemeToggle />
        </div>

        {shareCopied && (
          <p className="px-4 pt-2 text-center text-xs text-muted-foreground sm:px-6">
            Link copiado para a área de transferência.
          </p>
        )}

        <FadeIn className="px-4 py-6 sm:px-6 md:px-8">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {count} {count === 1 ? 'item' : 'itens'}
          </p>
          <h1 className="mt-1 font-display text-4xl leading-none tracking-wide sm:text-5xl">
            {portfolio.name}
          </h1>
          {portfolio.description && (
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
              {portfolio.description}
            </p>
          )}

          <div className="mt-6">
            {count === 0 ? (
              <EmptyState
                icon={<Film className="size-7" />}
                title="Nenhum item neste portfólio"
                description="Os vídeos e fotos em destaque vão aparecer aqui assim que forem adicionados."
              />
            ) : (
              <StaggerList className="columns-2 gap-1.5 sm:columns-3 lg:columns-4">
                {portfolio.videos.map((v, i) => (
                  <motion.button
                    key={v.id}
                    type="button"
                    variants={staggerItem}
                    onClick={() => setActiveIndex(i)}
                    className="group relative mb-1.5 block w-full overflow-hidden break-inside-avoid-column bg-secondary text-left"
                  >
                    {v.posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- mosaico: a altura precisa seguir a proporção intrínseca da imagem, o que `next/image` só permite com `fill` (que exige contêiner de tamanho fixo).
                      <img
                        src={v.posterUrl}
                        alt={v.title}
                        loading="lazy"
                        className="block w-full transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="grid aspect-video w-full place-items-center text-muted-foreground/60">
                        <Film className="size-6" />
                      </div>
                    )}
                    {v.processingStatus === 'processando' ? (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50">
                        <Loader2 className="size-6 animate-spin text-white" />
                      </div>
                    ) : v.mediaType === 'video' ? (
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                        <span className="grid size-11 scale-90 place-items-center rounded-full bg-white/90 text-foreground opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100">
                          <Play className="size-5 fill-current" />
                        </span>
                      </span>
                    ) : null}
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/0 to-transparent p-3 pt-8 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                      <span className="block truncate text-sm font-medium text-white">{v.title}</span>
                    </span>
                  </motion.button>
                ))}
              </StaggerList>
            )}
          </div>
        </FadeIn>
      </div>

      <AnimatePresence>
        {active && (
          <PortfolioItemLightbox
            item={active}
            hasPrev={count > 1}
            hasNext={count > 1}
            onClose={() => setActiveIndex(null)}
            onPrev={() => setActiveIndex((i) => (i === null ? null : (i - 1 + count) % count))}
            onNext={() => setActiveIndex((i) => (i === null ? null : (i + 1) % count))}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function PortfolioItemLightbox({
  item,
  hasPrev,
  hasNext,
  onClose,
  onPrev,
  onNext,
}: {
  item: PortfolioItem
  hasPrev: boolean
  hasNext: boolean
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && hasPrev) onPrev()
      else if (e.key === 'ArrowRight' && hasNext) onNext()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [hasPrev, hasNext, onClose, onPrev, onNext])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/85"
        onClick={onClose}
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />

      {hasPrev && (
        <button
          type="button"
          onClick={onPrev}
          aria-label="Item anterior"
          className="absolute left-2 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-4"
        >
          <ChevronLeft className="size-6" />
        </button>
      )}
      {hasNext && (
        <button
          type="button"
          onClick={onNext}
          aria-label="Próximo item"
          className="absolute right-2 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-4"
        >
          <ChevronRight className="size-6" />
        </button>
      )}

      <motion.div
        key={item.id}
        className="relative w-full max-w-3xl"
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.2 }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute -top-11 right-0 grid size-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <X className="size-5" />
        </button>
        <div className="overflow-hidden rounded-xl bg-black">
          {item.mediaType === 'foto' ? (
            item.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- lightbox: URL pode ser um blob: local (upload em modo demo), o loader de Image não aceita.
              <img src={item.posterUrl} alt={item.title} className="max-h-[80vh] w-full object-contain" />
            ) : (
              <div className="grid aspect-video w-full place-items-center text-white/60">
                <ImageIcon className="size-8" />
              </div>
            )
          ) : item.videoUrl ? (
            <video
              src={item.videoUrl}
              poster={item.posterUrl ?? undefined}
              controls
              autoPlay
              playsInline
              className="max-h-[80vh] w-full"
            />
          ) : (
            <div className="grid aspect-video w-full place-items-center text-white/60">
              <Film className="size-8" />
            </div>
          )}
        </div>
        <div className="mt-3 text-white">
          <h3 className="text-lg font-medium">{item.title}</h3>
          {item.description && <p className="mt-1 text-sm text-white/70">{item.description}</p>}
        </div>
      </motion.div>
    </div>
  )
}
