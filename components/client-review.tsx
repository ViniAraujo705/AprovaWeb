'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MessageSquarePlus,
  Star,
  Check,
  RotateCcw,
  Loader2,
  Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Comment, PublicVideo, QueueVideoItem, VideoStatus } from '@/lib/types'
import { isAgencyAuthor } from '@/lib/types'
import { publicService } from '@/lib/services'
import { ApiError } from '@/lib/api'
import { formatDuration } from '@/lib/format'
import { triggerDownload } from '@/lib/download'
import { FadeIn, motion, AnimatePresence, useReducedMotion } from '@/components/motion'
import { AgencyLogo } from '@/components/agency-logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { ApprovedCelebration } from '@/components/approved-celebration'
import { VideoStage, type VideoStageHandle, type StageMarker } from '@/components/video-stage'
import { AgencyReplyItem, ClientCommentItem } from '@/components/comment-items'
import { VideoTitleField } from '@/components/video-title-field'

/** Decisão já registrada (se houver) a partir do status atual do vídeo. */
function decisionFromStatus(status: VideoStatus): VideoStatus | null {
  return status === 'aprovado' || status === 'ajuste' ? status : null
}

/** Som curto tocado quando o cliente aprova o vídeo. Falha silenciosa se o navegador bloquear autoplay. */
function playApproveSound() {
  try {
    const audio = new Audio('/sounds/approve.mp3')
    audio.volume = 0.6
    void audio.play().catch(() => {})
  } catch {
    // ambiente sem suporte a Audio — ignora.
  }
}

/** Nome do cliente (sem login) persistido no navegador — pedido uma vez, reusado depois. */
const CLIENT_NAME_KEY = 'aprova_client_name'

function readStoredClientName(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(CLIENT_NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function ClientReview({
  link,
  initial,
  galleryQueue,
  galleryLink,
}: {
  link: string
  initial: PublicVideo
  /**
   * Fila de swipe escopada ao projeto (vinda da galeria `/g/:link`), quando
   * disponível. Tem prioridade sobre `PublicVideo.queue` (por cliente) — assim
   * o cliente desliza só entre os vídeos da mesma entrega/projeto, não todos
   * os vídeos que já recebeu. Fica fixa durante a navegação por swipe: não é
   * substituída pelo `queue` que cada `getByLink` devolve.
   */
  galleryQueue?: QueueVideoItem[]
  /** linkPublico da galeria (`/g/:link`) de onde este vídeo foi aberto, se houver — alimenta o botão "voltar" na tela de aprovado. */
  galleryLink?: string
}) {
  // `data` é o vídeo público exibido no momento — troca ao deslizar para o
  // próximo/anterior vídeo do mesmo cliente na aba Reels (sem trocar de URL,
  // como um feed do Instagram). `activeLink` acompanha qual link usar nas
  // chamadas de comentário/nota/decisão.
  const [data, setData] = useState<PublicVideo>(initial)
  const [activeLink, setActiveLink] = useState(link)
  const [switchingVideo, setSwitchingVideo] = useState(false)
  const { video } = data
  const stageRef = useRef<VideoStageHandle>(null)
  // Aba ativa do VideoStage: na aba Reels o cliente só assiste — sem
  // comentário nem nota, como um feed do Instagram de verdade.
  const [previewTab, setPreviewTab] = useState<'player' | 'reels'>('player')

  const [current, setCurrent] = useState(0)

  const [comments, setComments] = useState<Comment[]>(initial.comments)
  const [draft, setDraft] = useState('')
  const [authorName, setAuthorName] = useState(() => readStoredClientName())
  const [postingComment, setPostingComment] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [commentSent, setCommentSent] = useState(false)

  // Uma linha de estrelas por pergunta ativa, retornada dinamicamente pela API.
  const [ratings, setRatings] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {}
    for (const r of initial.ratings) if (r.questionId) map[r.questionId] = r.value
    return map
  })
  // Nota geral (1-5), separada das perguntas — alimenta o desempenho do editor.
  const [overallRating, setOverallRating] = useState(initial.overallRating ?? 0)

  const [decision, setDecision] = useState<VideoStatus | null>(decisionFromStatus(video.status))
  const [decisionBusy, setDecisionBusy] = useState<VideoStatus | null>(null)
  const [decisionError, setDecisionError] = useState<string | null>(null)

  // Fila usada no swipe: a do projeto (galeria), quando veio uma; senão cai
  // para a fila por cliente que a API pública devolve.
  const queue = galleryQueue && galleryQueue.length > 0 ? galleryQueue : data.queue
  const queueIndex = queue.findIndex((q) => q.link === activeLink)
  const nextInQueue = queueIndex >= 0 ? queue[queueIndex + 1] : undefined
  const prevInQueue = queueIndex >= 0 ? queue[queueIndex - 1] : undefined

  // Cache dos vídeos vizinhos da fila, carregados de antemão (ver efeito de
  // prefetch abaixo). Sem isso, cada swipe esperava a viagem de rede inteira
  // pra trocar de vídeo — no celular isso trava o vídeo atual por um instante
  // (parece "pausar e depois passar"), bem diferente do swipe instantâneo do
  // Reels/Instagram. `inFlight` evita disparar o mesmo fetch em duplicidade.
  const prefetchCache = useRef(new Map<string, PublicVideo>())
  const inFlight = useRef(new Set<string>())

  function applyVideoData(res: PublicVideo, nextLink: string) {
    setData(res)
    setActiveLink(nextLink)
    setComments(res.comments)
    const map: Record<string, number> = {}
    for (const r of res.ratings) if (r.questionId) map[r.questionId] = r.value
    setRatings(map)
    setOverallRating(res.overallRating ?? 0)
    setDecision(decisionFromStatus(res.video.status))
    setDecisionError(null)
    setDraft('')
    setCurrent(0)
  }

  async function prefetch(targetLink: string | undefined) {
    if (!targetLink || prefetchCache.current.has(targetLink) || inFlight.current.has(targetLink))
      return
    inFlight.current.add(targetLink)
    try {
      const res = await publicService.getByLink(targetLink)
      prefetchCache.current.set(targetLink, res)
    } catch {
      // Falha silenciosa: o swipe cai de volta pro fetch normal (com spinner).
    } finally {
      inFlight.current.delete(targetLink)
    }
  }

  /** Troca para outro vídeo do mesmo cliente (swipe), recarregando todo o estado da tela. */
  async function loadVideo(nextLink: string) {
    if (switchingVideo) return
    const cached = prefetchCache.current.get(nextLink)
    if (cached) {
      applyVideoData(cached, nextLink)
      return
    }
    setSwitchingVideo(true)
    try {
      const res = await publicService.getByLink(nextLink)
      applyVideoData(res, nextLink)
    } catch {
      // Sem feedback bloqueante: se falhar, o cliente simplesmente continua no vídeo atual.
    } finally {
      setSwitchingVideo(false)
    }
  }

  // Assim que o vídeo atual muda, já busca os vizinhos da fila em segundo
  // plano — na hora do swipe de verdade, o vídeo já está pronto no cache.
  useEffect(() => {
    prefetch(nextInQueue?.link)
    prefetch(prevInQueue?.link)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextInQueue?.link, prevInQueue?.link])

  const sorted = useMemo(
    () => [...comments].sort((a, b) => a.timestamp - b.timestamp),
    [comments],
  )
  // Marcadores da timeline: todos os comentários (cliente + respostas da agência).
  const markers: StageMarker[] = useMemo(
    () => sorted.map((c) => ({ id: c.id, timestamp: c.timestamp, label: c.text })),
    [sorted],
  )

  function seek(t: number) {
    stageRef.current?.seek(t)
  }

  async function addComment() {
    const text = draft.trim()
    const name = authorName.trim()
    if (!text || !name) return
    setPostingComment(true)
    setCommentError(null)
    try {
      const created = await publicService.addComment(activeLink, {
        text,
        timestamp: Math.round(current),
        author: name,
      })
      try {
        window.localStorage.setItem(CLIENT_NAME_KEY, name)
      } catch {
        // localStorage indisponível (ex.: modo privado) — segue sem persistir.
      }
      setComments((prev) => [...prev, created])
      setDraft('')
      // Confirmação visual rápida (não bloqueia a tela).
      setCommentSent(true)
      setTimeout(() => setCommentSent(false), 1800)
    } catch (err) {
      setCommentError(err instanceof ApiError ? err.message : 'Não foi possível enviar.')
    } finally {
      setPostingComment(false)
    }
  }

  async function rate(questionId: string, category: string, value: number) {
    const prev = ratings[questionId] ?? 0
    setRatings((r) => ({ ...r, [questionId]: value })) // otimista
    try {
      await publicService.addRating(activeLink, { questionId, category, value })
    } catch {
      setRatings((r) => ({ ...r, [questionId]: prev })) // reverte
    }
  }

  async function decide(kind: VideoStatus) {
    setDecisionBusy(kind)
    setDecisionError(null)
    // Toca já no clique (não após o await) para não perder o gesto do usuário — alguns
    // navegadores (Safari/iOS) bloqueiam áudio iniciado fora do handler de interação direto.
    if (kind === 'aprovado') playApproveSound()
    try {
      if (kind === 'aprovado') await publicService.approve(activeLink, overallRating || undefined)
      else await publicService.requestChanges(activeLink)
      setDecision(kind)
    } catch (err) {
      setDecisionError(err instanceof ApiError ? err.message : 'Falha ao registrar a decisão.')
    } finally {
      setDecisionBusy(null)
    }
  }

  return (
    <div className="min-h-screen">
      {/* Top bar — logo da agência (branding) com fallback pro logo do sistema */}
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur"
      >
        <AgencyLogo branding={data.branding} />
        <div className="flex shrink-0 items-center gap-2">
          <span className="min-w-0 shrink truncate rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
            {video.clientName || 'Cliente'}
          </span>
          <ThemeToggle />
        </div>
      </motion.header>

      <FadeIn className="mx-auto max-w-6xl lg:grid lg:grid-cols-[1fr_400px] lg:gap-6 lg:px-6 lg:py-6">
        {/* LEFT: player / reels */}
        <div className="lg:min-w-0">
          <div className="flex items-start justify-between gap-3 px-4 pt-4 lg:px-0">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {video.type} · para aprovação
              </p>
              <VideoTitleField
                title={video.title}
                onSave={async (title) => {
                  const updated = await publicService.updateTitle(activeLink, title)
                  setData((prev) => ({ ...prev, video: { ...prev.video, title: updated.title } }))
                }}
                className="mt-1 font-display text-3xl leading-none tracking-wide sm:text-4xl"
              />
            </div>
            {(video.originalUrl || video.url) && (
              <button
                type="button"
                onClick={() =>
                  triggerDownload(video.originalUrl || video.url!, `${video.title || 'video'}.mp4`)
                }
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70"
              >
                <Download className="size-3.5" />
                Baixar vídeo
              </button>
            )}
          </div>

          <div className="relative">
            <VideoStage
              ref={stageRef}
              video={video}
              markers={markers}
              onCurrentChange={setCurrent}
              className="mt-4"
              hasNext={!!nextInQueue}
              hasPrev={!!prevInQueue}
              onSwipeNext={() => nextInQueue && loadVideo(nextInQueue.link)}
              onSwipePrev={() => prevInQueue && loadVideo(prevInQueue.link)}
              onTabChange={setPreviewTab}
              clientPhotoUrl={data.clientPhotoUrl}
              clientDescription={data.clientDescription}
            />
            {switchingVideo && (
              <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center">
                <span className="grid size-9 place-items-center rounded-full bg-black/60 text-white">
                  <Loader2 className="size-4 animate-spin" />
                </span>
              </div>
            )}
          </div>

          <p className="mt-3 px-4 text-center text-xs text-muted-foreground lg:px-0 lg:text-left">
            Esta é uma prévia otimizada para visualização — a entrega final mantém a qualidade
            original.
          </p>
        </div>

        {/* RIGHT: comments + ratings — escondido na aba Reels, que é só pra assistir */}
        <div className="mt-6 px-4 pb-40 lg:mt-14 lg:px-0 lg:pb-6">
          {previewTab === 'reels' ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
              No modo Reels você só assiste. Volte para a aba Player para comentar e avaliar.
            </div>
          ) : (
            <>
              {/* Comment composer */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <MessageSquarePlus className="size-4 text-primary" />
                  Comentar em {formatDuration(current)}
                </div>
                <input
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Seu nome"
                  className="mt-2 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                />
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Escreva um comentário neste ponto do vídeo…"
                  rows={2}
                  className="mt-2 w-full resize-none rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                />
                {commentError && (
                  <p className="mt-1 text-xs text-destructive">{commentError}</p>
                )}
                <button
                  type="button"
                  onClick={addComment}
                  disabled={!draft.trim() || !authorName.trim() || postingComment}
                  className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary font-display text-lg tracking-wide text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {postingComment && <Loader2 className="size-4 animate-spin" />}
                  ADICIONAR COMENTÁRIO
                </button>

                {/* Confirmação rápida de envio */}
                <AnimatePresence>
                  {commentSent && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="mt-2 flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-400"
                    >
                      <Check className="size-4" /> Comentário enviado
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* Comments list */}
              <h2 className="mt-6 font-display text-2xl tracking-wide">
                COMENTÁRIOS ({sorted.length})
              </h2>
              {sorted.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                  Nenhum comentário ainda. Assista e aponte os ajustes no ponto exato do vídeo.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-3">
                  {sorted.map((c) =>
                    isAgencyAuthor(c.authorRole) ? (
                      <AgencyReplyItem key={c.id} comment={c} onSeek={seek} />
                    ) : (
                      <ClientCommentItem key={c.id} comment={c} onSeek={seek} />
                    ),
                  )}
                </ul>
              )}

              {/* Ratings: uma linha por pergunta ativa da agência */}
              {data.ratingQuestions.length > 0 && (
                <>
                  <h2 className="mt-6 font-display text-2xl tracking-wide">NOTAS POR CATEGORIA</h2>
                  <div className="mt-3 flex flex-col gap-3">
                    {data.ratingQuestions.map((q) => (
                      <div
                        key={q.id}
                        className="flex items-center justify-between rounded-xl border border-border bg-card p-3"
                      >
                        <span className="text-sm font-medium">{q.text}</span>
                        <Stars
                          value={ratings[q.id] ?? 0}
                          onChange={(v) => rate(q.id, q.text, v)}
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Nota geral: em destaque, alimenta o desempenho do editor */}
              <div className="mt-6 rounded-xl border-2 border-primary/50 bg-primary/5 p-4 text-center">
                <p className="font-display text-xl tracking-wide">NOTA GERAL</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Sua avaliação geral do vídeo (obrigatória para aprovar).
                </p>
                <div className="mt-3 flex justify-center">
                  <Stars value={overallRating} onChange={setOverallRating} size="lg" />
                </div>
              </div>
            </>
          )}
        </div>
      </FadeIn>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-4 backdrop-blur lg:sticky lg:mx-auto lg:max-w-6xl lg:px-6">
        {decision ? (
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-xl bg-card p-3">
            <p className="text-sm font-medium">
              {decision === 'aprovado'
                ? 'Vídeo aprovado! A agência foi avisada.'
                : 'Ajustes solicitados. A agência recebeu seus comentários.'}
            </p>
            <button
              type="button"
              onClick={() => setDecision(null)}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-secondary px-3 text-sm font-medium text-foreground"
            >
              <RotateCcw className="size-4" />
              Refazer
            </button>
          </div>
        ) : (
          <div className="mx-auto max-w-6xl">
            {decisionError && (
              <p className="mb-2 text-center text-sm text-destructive">{decisionError}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => decide('ajuste')}
                disabled={decisionBusy !== null}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-primary bg-transparent font-display text-xl tracking-wide text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
              >
                {decisionBusy === 'ajuste' ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <RotateCcw className="size-5" />
                )}
                PEDIR AJUSTE
              </button>
              <button
                type="button"
                onClick={() => decide('aprovado')}
                disabled={decisionBusy !== null || overallRating === 0}
                title={overallRating === 0 ? 'Dê uma nota geral antes de aprovar' : undefined}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-primary font-display text-xl tracking-wide text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {decisionBusy === 'aprovado' ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Check className="size-5" />
                )}
                APROVAR
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tela dedicada de celebração após aprovar */}
      <AnimatePresence>
        {decision === 'aprovado' && (
          <ApprovedCelebration
            projectName={data.projectName || video.title}
            onReset={() => setDecision(null)}
            galleryLink={galleryLink}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function Stars({
  value,
  onChange,
  size = 'md',
}: {
  value: number
  onChange: (v: number) => void
  /** 'lg' para a nota geral em destaque. Default: 'md'. */
  size?: 'md' | 'lg'
}) {
  const reduce = useReducedMotion()
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value
        return (
          <motion.button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
            className={cn(
              'grid place-items-center',
              size === 'lg' ? 'size-12' : 'size-9',
            )}
            whileTap={reduce ? undefined : { scale: 0.8 }}
          >
            {/*
              Feedback imediato (UI otimista): a estrela pulsa e preenche na
              hora do clique — a chamada à API só reverte se falhar.
            */}
            <motion.span
              animate={reduce ? {} : { scale: filled ? [1, 1.35, 1] : 1 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
            >
              <Star
                className={cn(
                  'transition-colors',
                  size === 'lg' ? 'size-9' : 'size-6',
                  filled ? 'fill-primary text-primary' : 'text-muted-foreground',
                )}
              />
            </motion.span>
          </motion.button>
        )
      })}
    </div>
  )
}
