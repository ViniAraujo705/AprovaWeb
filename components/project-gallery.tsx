'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { Loader2, Film, Download, AlertTriangle, Share2, Check, X, Info, Package } from 'lucide-react'
import type { ProjectGallery } from '@/lib/types'
import { publicService } from '@/lib/services'
import { AgencyLogo } from '@/components/agency-logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { StatusBadge } from '@/components/status-badge'
import { EmptyState } from '@/components/states'
import { FadeIn, StaggerList, staggerItem, motion, AnimatePresence } from '@/components/motion'
import { brandAccentStyle } from '@/lib/theme'
import { toast } from '@/lib/toast'

const GALLERY_ONBOARDING_SEEN_KEY = 'aprova_gallery_onboarding_seen'

function readGalleryOnboardingSeen(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(GALLERY_ONBOARDING_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Galeria pública de um projeto (rota /g/:linkPublico) — porta de entrada única
 * para todos os vídeos de uma entrega. Cada card abre o player normal (/v/:link),
 * sem mudar o contrato de aprovação/comentário/avaliação já existente ali.
 */
export function ProjectGalleryView({
  gallery,
  link,
}: {
  gallery: ProjectGallery
  /** Link público desta galeria (linkPublico do projeto) — repassado ao player via query string para escopar o swipe a este projeto, em vez de todos os vídeos do cliente. */
  link: string
}) {
  const count = gallery.videos.length

  // Seleção múltipla, para o cliente baixar vários vídeos de uma vez. A
  // galeria pública só traz `link`/`posterUrl` por vídeo (resposta enxuta) —
  // a URL real do arquivo (e a original, em qualidade máxima) só é resolvida
  // na hora do download, via `publicService.getByLink` (mesma fonte que já
  // alimenta o player em /v/:link).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDownloading, setBulkDownloading] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [downloadConfirmOpen, setDownloadConfirmOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  // Compartilhar a galeria inteira (link feio de UUID) — feito uma vez aqui em
  // vez de o cliente ter que selecionar/copiar a URL do navegador na mão.
  const [gallerySharing, setGallerySharing] = useState(false)
  const [galleryShareCopied, setGalleryShareCopied] = useState(false)

  const [showOnboarding, setShowOnboarding] = useState(() => !readGalleryOnboardingSeen())
  function dismissOnboarding() {
    setShowOnboarding(false)
    try {
      window.localStorage.setItem(GALLERY_ONBOARDING_SEEN_KEY, '1')
    } catch {
      // localStorage indisponível (ex.: modo privado) — só não persiste a dispensa.
    }
  }

  function toggleSelected(videoLink: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(videoLink)) next.delete(videoLink)
      else next.add(videoLink)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size === gallery.videos.length ? new Set() : new Set(gallery.videos.map((v) => v.link)),
    )
  }

  const approvedVideos = gallery.videos.filter((v) => v.status === 'aprovado')
  function selectApproved() {
    setSelected(new Set(approvedVideos.map((v) => v.link)))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  // Segurar um card entra no "modo seleção" (como galeria de fotos no
  // celular): evita que um toque impreciso no checkbox minúsculo abra o
  // vídeo por engano. Um único timer/ref bastam pois só um dedo pressiona
  // por vez. Depois que há algo selecionado, um toque simples em qualquer
  // card alterna a seleção em vez de navegar (ver handleCardClick).
  const LONG_PRESS_MS = 450
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggered = useRef(false)

  function handlePressStart(videoLink: string) {
    longPressTriggered.current = false
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(15)
      }
      toggleSelected(videoLink)
    }, LONG_PRESS_MS)
  }

  function handlePressEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function handleCardClick(e: React.MouseEvent, videoLink: string) {
    if (longPressTriggered.current) {
      // O "clique" que o navegador dispara ao soltar depois do long-press
      // não deve navegar nem re-alternar a seleção que o timer já fez.
      e.preventDefault()
      longPressTriggered.current = false
      return
    }
    if (selected.size > 0) {
      e.preventDefault()
      toggleSelected(videoLink)
    }
  }

  /** Gera um ZIP no backend e navega até ele — uma única ação funciona no Safari/iPhone. */
  async function downloadSelected() {
    const items = gallery.videos.filter((v) => selected.has(v.link))
    if (items.length === 0) return
    if (items.length > 50) {
      setBulkError('Selecione no máximo 50 vídeos por download.')
      return
    }
    setBulkDownloading(true)
    setBulkError(null)
    try {
      const download = await publicService.downloadProjectGallery(link, items.map((video) => video.link))
      if (!download.url) {
        setBulkError('Nenhum vídeo selecionado está disponível para download no momento.')
        return
      }
      if (download.skipped.length) {
        const processing = download.skipped.filter((item) => item.reason === 'processing').length
        const unavailable = download.skipped.length - processing
        const messages = [
          processing ? `${processing} ainda está sendo processado${processing === 1 ? '' : 's'}` : null,
          unavailable ? `${unavailable} arquivo${unavailable === 1 ? ' está' : 's estão'} indisponível${unavailable === 1 ? '' : 'is'}` : null,
        ].filter(Boolean)
        toast.info('O ZIP será baixado com os arquivos disponíveis.', messages.join(' e ') + '.')
      }
      window.location.href = download.url
    } catch {
      setBulkError('Não foi possível preparar o arquivo ZIP. Verifique a conexão e tente novamente.')
    } finally {
      setBulkDownloading(false)
    }
  }

  /** Folha nativa de compartilhamento (WhatsApp, e-mail…) quando disponível; cópia pra área de transferência como alternativa (desktop, ou se o cliente fechar a folha sem escolher nada). */
  async function shareOrCopy(
    data: ShareData,
    copyText: string,
    setBusy: (v: boolean) => void,
    setCopied: (v: boolean) => void,
  ) {
    setBusy(true)
    try {
      if (navigator.share) {
        try {
          await navigator.share(data)
          return
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return // fechou sem escolher
        }
      }
      try {
        await navigator.clipboard.writeText(copyText)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        // Sem feedback bloqueante: se a área de transferência falhar, o cliente
        // não tem como saber a URL de outro jeito por aqui.
      }
    } finally {
      setBusy(false)
    }
  }

  /** Compartilha o link da galeria inteira — resolve a reclamação de link feio/grande sem o cliente precisar copiar a URL na mão. */
  async function shareGallery() {
    const url = `${window.location.origin}/g/${link}`
    const title = gallery.projectName || 'Vídeos para aprovação'
    await shareOrCopy({ title, url }, url, setGallerySharing, setGalleryShareCopied)
  }

  /** Compartilha os links dos vídeos selecionados. */
  async function shareSelected() {
    const items = gallery.videos.filter((v) => selected.has(v.link))
    if (items.length === 0) return
    const urls = items.map(
      (v) => `${window.location.origin}/v/${v.link}?g=${encodeURIComponent(link)}`,
    )
    const title = gallery.projectName || 'Vídeos'
    await shareOrCopy(
      urls.length === 1
        ? { title: items[0].title || title, url: urls[0] }
        : { title, text: urls.join('\n') },
      urls.join('\n'),
      setSharing,
      setShareCopied,
    )
  }

  return (
    <div className="min-h-screen" style={brandAccentStyle(gallery.branding?.accentColor)}>
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur"
      >
        <AgencyLogo branding={gallery.branding} />
        <div className="flex shrink-0 items-center gap-2">
          {gallery.clientName && (
            <span
              className="min-w-0 shrink truncate rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground"
              title={gallery.clientName}
            >
              {gallery.clientName}
            </span>
          )}
          <button
            type="button"
            onClick={shareGallery}
            disabled={gallerySharing}
            aria-label="Compartilhar galeria"
            title="Compartilhar galeria"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-50"
          >
            {gallerySharing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : galleryShareCopied ? (
              <Check className="size-4" />
            ) : (
              <Share2 className="size-4" />
            )}
          </button>
          <ThemeToggle />
        </div>
      </motion.header>
      {galleryShareCopied && (
        <p className="px-4 pt-2 text-center text-xs text-muted-foreground sm:px-6">
          Link copiado para a área de transferência.
        </p>
      )}

      {/* Instruções rápidas de como usar a galeria — some após a primeira dispensa. */}
      <AnimatePresence>
        {showOnboarding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 pt-4 sm:px-6">
              <div className="flex flex-1 items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="flex-1 text-xs text-muted-foreground sm:text-sm">
                  <span className="font-medium text-foreground">Como funciona: </span>
                  toque em um vídeo para assistir, comentar em pontos específicos, avaliar com
                  estrelas e aprovar ou pedir ajustes. Selecione vários aqui na galeria pra
                  baixar ou compartilhar de uma vez.
                </p>
                <button
                  type="button"
                  onClick={dismissOnboarding}
                  aria-label="Fechar instruções"
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <FadeIn className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {count} {count === 1 ? 'vídeo' : 'vídeos'} para aprovação
            </p>
            <h1 className="mt-1 font-display text-4xl leading-none tracking-wide sm:text-5xl">
              {gallery.projectName || 'Vídeos'}
            </h1>
          </div>
          {count > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={selected.size > 0 && selected.size === gallery.videos.length}
                  onChange={toggleSelectAll}
                />
                Selecionar todos
              </label>
              {approvedVideos.length > 0 && (
                <button
                  type="button"
                  onClick={selectApproved}
                  className="inline-flex min-h-9 items-center justify-center rounded-lg bg-secondary px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
                >
                  Selecionar aprovados ({approvedVideos.length})
                </button>
              )}
              {selected.size > 0 && (
                <>
                  <button
                    type="button"
                    onClick={shareSelected}
                    disabled={sharing}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-secondary px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-50"
                  >
                    {sharing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : shareCopied ? (
                      <Check className="size-4" />
                    ) : (
                      <Share2 className="size-4" />
                    )}
                    {shareCopied ? 'Link copiado' : `Compartilhar (${selected.size})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDownloadConfirmOpen(true)}
                    disabled={bulkDownloading}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {bulkDownloading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    Baixar selecionados ({selected.size})
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    aria-label="Cancelar seleção"
                    title="Cancelar seleção"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        {bulkError && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
            <AlertTriangle className="size-4" /> {bulkError}
          </p>
        )}

        <div className="mt-6">
          {count === 0 ? (
            <EmptyState
              icon={<Film className="size-7" />}
              title="Nenhum vídeo nesta galeria"
              description="Os vídeos enviados para este projeto vão aparecer aqui."
            />
          ) : (
            <StaggerList className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {gallery.videos.map((v) => (
                <motion.div
                  key={v.link}
                  variants={staggerItem}
                  className={`group relative overflow-hidden rounded-xl border bg-card transition-colors ${
                    selected.has(v.link)
                      ? 'border-primary ring-2 ring-primary/50'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  {/*
                    Link "esticado": cobre o card inteiro por baixo. O checkbox
                    fica acima dele (z-index maior) — não pode ficar aninhado
                    DENTRO do <a>, senão o clique nele também aciona a navegação.
                    Segurar (long-press) alterna a seleção em vez de navegar —
                    evita que um toque impreciso no checkbox minúsculo abra o
                    vídeo errado no celular. `touch-callout`/`user-select` none
                    e o preventDefault no context menu evitam que o long-press
                    dispare o menu nativo de "abrir link" do navegador mobile.
                  */}
                  <Link
                    href={`/v/${v.link}?g=${encodeURIComponent(link)}`}
                    aria-label={`Abrir ${v.title}`}
                    className="absolute inset-0 z-[1] select-none [-webkit-touch-callout:none]"
                    onClick={(e) => handleCardClick(e, v.link)}
                    onTouchStart={() => handlePressStart(v.link)}
                    onTouchEnd={handlePressEnd}
                    onTouchMove={handlePressEnd}
                    onContextMenu={(e) => e.preventDefault()}
                  />
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
                    {v.processingStatus === 'processando' && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50">
                        <Loader2 className="size-6 animate-spin text-white" />
                      </div>
                    )}
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${v.title} para baixar`}
                      checked={selected.has(v.link)}
                      onChange={() => toggleSelected(v.link)}
                      className="absolute right-2 top-2 z-[2] size-4 cursor-pointer accent-primary"
                    />
                    <div className="absolute left-2 top-2">
                      <StatusBadge status={v.status} />
                    </div>
                    {v.version > 1 && (
                      <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        v{v.version}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="truncate text-sm font-medium text-foreground" title={v.title}>
                      {v.title}
                    </h3>
                  </div>
                </motion.div>
              ))}
            </StaggerList>
          )}
        </div>
      </FadeIn>

      <AnimatePresence>
        {downloadConfirmOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <motion.div
              className="absolute inset-0 bg-black/70"
              onClick={() => setDownloadConfirmOpen(false)}
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="download-zip-title"
              className="relative w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
              initial={{ y: 8, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 8, scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                  <Package className="size-5" />
                </span>
                <div>
                  <h2 id="download-zip-title" className="text-lg font-semibold text-foreground">
                    Baixar {selected.size} vídeo{selected.size === 1 ? '' : 's'}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Os vídeos serão reunidos em um único arquivo ZIP. É o formato usado para baixar vários arquivos de uma vez, inclusive no iPhone.
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-xl bg-secondary p-3 text-sm leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">No iPhone:</span> após concluir, toque no ZIP em Downloads. O aparelho cria uma pasta com os vídeos para assistir ou salvar na galeria.
              </div>
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setDownloadConfirmOpen(false)}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-secondary text-sm font-medium text-foreground hover:bg-secondary/70"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDownloadConfirmOpen(false)
                    downloadSelected()
                  }}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  <Download className="size-4" /> Baixar ZIP
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
