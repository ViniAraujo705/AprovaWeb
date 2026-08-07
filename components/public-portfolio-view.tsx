'use client'

import Image from 'next/image'
import { useState } from 'react'
import { Check, Film, Loader2, Play, Share2, X } from 'lucide-react'
import type { PortfolioVideoItem, PublicPortfolio } from '@/lib/types'
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
 * aprovação do cliente), que não faz sentido aqui.
 */
export function PublicPortfolioView({ portfolio, link }: { portfolio: PublicPortfolio; link: string }) {
  const count = portfolio.videos.length
  const [active, setActive] = useState<PortfolioVideoItem | null>(null)
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

  return (
    <div className="min-h-screen" style={brandAccentStyle(portfolio.branding?.accentColor)}>
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur"
      >
        <AgencyLogo branding={portfolio.branding} />
        <div className="flex shrink-0 items-center gap-2">
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
          <ThemeToggle />
        </div>
      </motion.header>
      {shareCopied && (
        <p className="px-4 pt-2 text-center text-xs text-muted-foreground sm:px-6">
          Link copiado para a área de transferência.
        </p>
      )}

      <FadeIn className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {count} {count === 1 ? 'vídeo' : 'vídeos'}
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
              title="Nenhum vídeo neste portfólio"
              description="Os vídeos em destaque vão aparecer aqui assim que forem adicionados."
            />
          ) : (
            <StaggerList className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {portfolio.videos.map((v) => (
                <motion.button
                  key={v.id}
                  type="button"
                  variants={staggerItem}
                  onClick={() => setActive(v)}
                  className="group relative overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-primary/50"
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-secondary">
                    {v.posterUrl ? (
                      <Image
                        src={v.posterUrl}
                        alt=""
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        unoptimized
                      />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-muted-foreground/60">
                        <Film className="size-6" />
                      </span>
                    )}
                    {v.processingStatus === 'processando' ? (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50">
                        <Loader2 className="size-6 animate-spin text-white" />
                      </div>
                    ) : (
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                        <span className="grid size-11 scale-90 place-items-center rounded-full bg-white/90 text-foreground opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100">
                          <Play className="size-5 fill-current" />
                        </span>
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="truncate text-sm font-medium text-foreground" title={v.title}>
                      {v.title}
                    </h3>
                  </div>
                </motion.button>
              ))}
            </StaggerList>
          )}
        </div>
      </FadeIn>

      <AnimatePresence>
        {active && <VideoLightbox video={active} onClose={() => setActive(null)} />}
      </AnimatePresence>
    </div>
  )
}

function VideoLightbox({ video, onClose }: { video: PortfolioVideoItem; onClose: () => void }) {
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
      <motion.div
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
          {video.videoUrl ? (
            <video
              src={video.videoUrl}
              poster={video.posterUrl ?? undefined}
              controls
              autoPlay
              playsInline
              className="aspect-video w-full"
            />
          ) : (
            <div className="grid aspect-video w-full place-items-center text-white/60">
              <Film className="size-8" />
            </div>
          )}
        </div>
        <div className="mt-3 text-white">
          <h3 className="text-lg font-medium">{video.title}</h3>
          {video.description && <p className="mt-1 text-sm text-white/70">{video.description}</p>}
        </div>
      </motion.div>
    </div>
  )
}
