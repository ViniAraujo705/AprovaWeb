'use client'

/**
 * Palco de vídeo compartilhado entre a tela do cliente, a revisão interna e o
 * canal do cliente (visão agência). Encapsula: abas Player/Reels com o MESMO
 * elemento <video> (morph de layout, sem reiniciar a reprodução), botão de
 * play, barra de progresso e marcadores de comentário.
 *
 * O componente controla a reprodução internamente e expõe:
 * - `onCurrentChange(t)`: tempo atual (para compor comentários no ponto exato).
 * - via ref: `seek(t)` para pular a um marcador/comentário.
 */
import Image from 'next/image'
import { createPortal } from 'react-dom'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  Play,
  Pause,
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  MoreHorizontal,
  Music2,
  Loader2,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Maximize,
  Minimize,
  Film,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Video } from '@/lib/types'
import { formatDuration } from '@/lib/format'
import { motion, AnimatePresence, useReducedMotion } from '@/components/motion'

/** Safari iOS: API proprietária de tela cheia nativa do `<video>`, não tipada pelo TS DOM lib. */
type IOSVideoElement = HTMLVideoElement & { webkitEnterFullscreen?: () => void }

export interface StageMarker {
  id: string
  timestamp: number
  label: string
}

export interface VideoStageHandle {
  seek: (t: number) => void
}

interface VideoStageProps {
  video: Video
  markers: StageMarker[]
  onCurrentChange?: (t: number) => void
  /** Cor de destaque da borda do Reels/marcadores. Default: primary (rosa). */
  className?: string
  /** Limite de altura do player. A tela pública usa um limite menor para comentários permanecerem acessíveis. */
  playerMaxHeightClass?: string
  /**
   * Navegação por swipe na aba "Preview Reels" (estilo feed do Instagram):
   * arrastar para cima avança, para baixo volta. Só entre vídeos do mesmo
   * cliente — quem monta a fila é quem usa o componente (ex.: `ClientReview`).
   */
  onSwipeNext?: () => void
  onSwipePrev?: () => void
  hasNext?: boolean
  hasPrev?: boolean
  /** Avisa o componente pai qual aba está ativa (ex.: `ClientReview` esconde comentário/nota na aba Reels). */
  onTabChange?: (tab: 'player' | 'reels') => void
  /** Foto de perfil do cliente (configurada pelo owner), usada como avatar no chrome do Reels. */
  clientPhotoUrl?: string | null
  /** Legenda do cliente (configurada pelo owner), exibida no chrome do Reels. Sem ela, cai no texto padrão. */
  clientDescription?: string | null
}

export const VideoStage = forwardRef<VideoStageHandle, VideoStageProps>(function VideoStage(
  {
    video,
    markers,
    onCurrentChange,
    className,
    playerMaxHeightClass,
    onSwipeNext,
    onSwipePrev,
    hasNext,
    hasPrev,
    onTabChange,
    clientPhotoUrl,
    clientDescription,
  },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null)
  // Espelha `current` em ref: lido pelo <video> do modo tela cheia ao montar,
  // sem depender de closures desatualizadas dentro dos handlers de evento.
  const currentRef = useRef(0)
  // Zera a ref já durante o PRÓPRIO render (não num useEffect) sempre que o
  // vídeo muda. Isso evita uma corrida real: o <video> novo lê `currentRef`
  // no handler `onLoadedMetadata` assim que carrega os metadados — se esse
  // vídeo já estiver em cache do navegador, esse evento pode disparar antes
  // do useEffect (assíncrono/passivo) rodar, herdando o ponto de reprodução
  // do vídeo ANTERIOR em vez de começar do zero. Zerar aqui garante que o
  // valor já esteja correto antes de qualquer evento do elemento recém-montado.
  const prevVideoIdRef = useRef(video.id)
  if (prevVideoIdRef.current !== video.id) {
    prevVideoIdRef.current = video.id
    currentRef.current = 0
  }
  // Id do vídeo dono da instância atual de `videoRef`. Necessário porque o
  // <video> que está SAINDO (crossfade do AnimatePresence) continua montado
  // por ~320ms com a MESMA ref do <video> que já ENTROU — sem essa checagem,
  // o desmonte do vídeo antigo roda por último e zera `videoRef.current`,
  // deixando o vídeo novo (já tocando) sem ref daí em diante. Isso travava a
  // troca de vídeos: o efeito abaixo faz `if (!el) return` e nada mais tocava.
  const activeVideoIdRef = useRef<string | null>(null)

  function bindVideoRef(id: string) {
    return (el: HTMLVideoElement | null) => {
      if (el) {
        videoRef.current = el
        activeVideoIdRef.current = id
      } else if (activeVideoIdRef.current === id) {
        videoRef.current = null
        activeVideoIdRef.current = null
      }
    }
  }

  const [tab, setTab] = useState<'player' | 'reels'>('player')
  useEffect(() => {
    onTabChange?.(tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(video.duration || 0)
  // Proporção real (largura/altura) do arquivo de vídeo, lida do próprio
  // elemento ao carregar os metadados. A aba Player usava uma caixa 16:9 fixa
  // com `object-cover`: vídeos que não são 16:9 (comum aqui, já que muito
  // conteúdo é pensado pra Reels/vertical) ficavam com as laterais cortadas
  // pra preencher a caixa. Com a proporção real, a caixa se ajusta ao vídeo e
  // nada precisa ser cortado.
  const [aspectRatio, setAspectRatio] = useState<number | null>(null)
  // O Preview Reels também é usado para aprovar peças horizontais. Nesses
  // casos o aparelho gira para paisagem e o arquivo usa `contain`, evitando
  // que a moldura vertical corte as laterais do vídeo.
  const reelsLandscape = (aspectRatio ?? 9 / 16) > 1
  // Tela cheia fiel ao Reels, aberta ao tocar em play na aba "Preview Reels".
  // Só no celular — no computador o toque apenas pausa/retoma o vídeo já
  // visível na moldura em mockup (ver `isDesktop` abaixo), sem cobrir a tela.
  const [fullscreen, setFullscreen] = useState(false)
  // Mesmo breakpoint `lg` usado na moldura do Reels (mockup de celular a
  // partir do desktop) — abaixo dele o comportamento touch original se mantém.
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    setIsDesktop(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  // Sentido da última troca de vídeo (1 = próximo, -1 = anterior), usado para
  // animar a transição estilo feed do Instagram: o vídeo que sai e o que
  // entra deslizam no mesmo sentido do swipe.
  const [direction, setDirection] = useState<1 | -1>(1)
  const reduceMotion = useReducedMotion()

  // Velocidade de reprodução — só a aba Player (Reels imita um feed, sem
  // controle de velocidade). Precisa ser reaplicada a cada troca de vídeo
  // porque o <video> remonta (fica com o `playbackRate` padrão do navegador).
  const PLAYBACK_RATES = [1, 1.5, 2, 3] as const
  const [playbackRate, setPlaybackRate] = useState<(typeof PLAYBACK_RATES)[number]>(1)
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate
  }, [playbackRate, video.id])
  function cyclePlaybackRate() {
    const next = PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(playbackRate) + 1) % PLAYBACK_RATES.length]
    setPlaybackRate(next)
  }

  // Tela cheia do Player (distinta da tela cheia estilo Reels): usa a
  // Fullscreen API nativa do navegador em cima da própria moldura do vídeo,
  // então o vídeo preenche a tela toda mantendo nossos controles (play,
  // velocidade) já sobrepostos a ele.
  const playerFrameRef = useRef<HTMLDivElement>(null)
  const [playerFullscreen, setPlayerFullscreen] = useState(false)
  useEffect(() => {
    function onFullscreenChange() {
      setPlayerFullscreen(document.fullscreenElement === playerFrameRef.current)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])
  async function togglePlayerFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
      return
    }
    const frame = playerFrameRef.current
    // Alguns Safari no iOS anunciam suporte à Fullscreen API padrão
    // (`document.fullscreenEnabled === true`) mas rejeitam a chamada em
    // elementos genéricos como este <div> — só o próprio <video> suporta tela
    // cheia nativa de fato, via essa API proprietária. Por isso o fallback
    // depende do resultado REAL da chamada (await + catch), não só da
    // checagem de suporte feita de antemão — checar só isso deixava o botão
    // sem efeito nenhum nesses navegadores (funcionava só no computador).
    if (frame?.requestFullscreen && document.fullscreenEnabled) {
      try {
        await frame.requestFullscreen()
        return
      } catch {
        // cai para o fallback nativo do <video> abaixo
      }
    }
    const el = videoRef.current as IOSVideoElement | null
    el?.webkitEnterFullscreen?.()
  }

  // Indicador de "pausado" com um pequeno atraso pra exibir: toda troca de
  // vídeo (swipe) passa por um instante pausado/sem áudio enquanto o novo
  // <video> monta e o autoplay mudo assume — sem esse atraso, esse instante
  // natural virava um pisca-pisca feio do ícone de pausa a cada swipe, mesmo
  // com a troca de vídeo instantânea (dado prefetchado). Só aparece se o
  // vídeo continuar parado além do tempo normal de troca.
  const [showPaused, setShowPaused] = useState(false)
  useEffect(() => {
    if (playing) {
      setShowPaused(false)
      return
    }
    const t = setTimeout(() => setShowPaused(true), 350)
    return () => clearTimeout(t)
  }, [playing])

  const total = duration || video.duration || 0
  // Vídeo otimizado ainda sendo preparado no backend: thumbnail + aviso sutil.
  const processing = video.processingStatus === 'processando'
  // Reprodução sempre no arquivo original (qualidade máxima enviada), nunca na
  // versão "otimizada" do backend — que costuma vir com bitrate/resolução bem
  // mais baixos. `originalUrl` é o mesmo arquivo usado em "baixar original".
  const playbackUrl = video.originalUrl || video.url

  function updateCurrent(t: number) {
    setCurrent(t)
    currentRef.current = t
    onCurrentChange?.(t)
  }

  function togglePlay() {
    const el = videoRef.current
    if (!el) {
      setPlaying((p) => !p) // sem fonte real: alterna estado visual
      return
    }
    if (el.paused) el.play().catch(() => {})
    else el.pause()
  }

  /**
   * Toque na aba Reels: no celular, o primeiro toque abre a tela cheia e os
   * seguintes pausam/retomam. No computador não faz sentido cobrir a tela
   * inteira (o mockup de celular já mostra o vídeo por completo) — só
   * pausa/retoma. A tela cheia também só faz sentido quando há outro vídeo
   * na fila pra deslizar — com um único vídeo ela só prendia o cliente numa
   * caixa preta sem conseguir rolar a página até "Aprovar"/"Pedir ajuste",
   * então nesse caso o toque também só pausa/retoma, igual ao desktop.
   */
  function handleReelsTap() {
    if (processing) return
    if (isDesktop || !(hasNext || hasPrev)) {
      togglePlay()
      return
    }
    if (!fullscreen) setFullscreen(true)
    else togglePlay()
  }

  /** Aba "Preview Reels": já entra tocando sozinho, igual ao feed do Instagram. */
  function switchToReels() {
    setTab('reels')
    autoplay(videoRef.current)
  }

  /**
   * Início automático de reprodução em Reels/tela cheia — inclusive ao trocar
   * de vídeo por swipe, que dispara `play()` bem depois do gesto original
   * (só depois do fetch em `loadVideo` resolver). Sem gesto "fresco" o
   * bastante, navegadores mais rígidos (Safari/iOS) recusam silenciosamente
   * o autoplay com áudio e o vídeo fica pausado sem nenhum aviso. Autoplay
   * MUDO nunca é bloqueado, então tocamos mudo e desmutamos assim que a
   * reprodução realmente começa — não exige um novo gesto do usuário.
   */
  function autoplay(el: HTMLVideoElement | null) {
    if (!el) return
    el.muted = true
    el.play()
      .then(() => {
        el.muted = false
      })
      .catch(() => {})
  }

  /**
   * Troca de vídeo por distância OU velocidade: um flick rápido e curto
   * (comum no celular) deve trocar de vídeo mesmo sem percorrer 70px, do
   * mesmo jeito que Reels/TikTok respondem a toques rápidos.
   */
  function handleSwipeEnd(info: { offset: { y: number }; velocity: { y: number } }) {
    if ((info.offset.y < -70 || info.velocity.y < -500) && hasNext) goNext()
    else if ((info.offset.y > 70 || info.velocity.y > 500) && hasPrev) goPrev()
  }

  function goNext() {
    setDirection(1)
    onSwipeNext?.()
  }

  function goPrev() {
    setDirection(-1)
    onSwipePrev?.()
  }

  function closeFullscreen() {
    videoRef.current?.pause()
    setFullscreen(false)
  }

  // Troca de vídeo (swipe/botão Vídeo anterior|Próximo vídeo): o <video> é o
  // MESMO elemento, então sem isto ele herdaria o currentTime do vídeo
  // anterior — se esse ponto ficar além da duração do novo vídeo, o
  // navegador trava o playhead no fim e a barra de progresso para de andar.
  // Na aba Reels (ou já em tela cheia), o próximo vídeo já entra tocando,
  // igual ao feed do Instagram — só a aba Player some fica pausada por padrão.
  useEffect(() => {
    currentRef.current = 0
    updateCurrent(0)
    setDuration(video.duration || 0)
    setAspectRatio(null)
    const el = videoRef.current
    if (!el) return
    el.currentTime = 0
    if (fullscreen || tab === 'reels') {
      autoplay(el)
    } else {
      el.pause()
      setPlaying(false)
    }
  }, [video.id])

  // Ao abrir a tela cheia, o <video> remonta (sai da caixa inline e entra no
  // portal) — retoma do ponto onde estava e começa a tocar automaticamente.
  useEffect(() => {
    if (!fullscreen) return
    const el = videoRef.current
    if (!el) return
    el.currentTime = currentRef.current
    autoplay(el)
  }, [fullscreen])

  // Trava o scroll da página por trás enquanto a tela cheia está aberta. Além
  // do overflow, também trava o overscroll-behavior: sem isso, um arrasto pra
  // BAIXO no topo da tela é interceptado pelo gesto nativo de "puxar pra
  // atualizar" do navegador (Chrome/Android) antes de chegar no framer-motion,
  // fazendo o swipe pra trás (vídeo anterior) parecer travado — só o pra cima
  // funcionava, já que não existe gesto nativo equivalente nesse sentido.
  useEffect(() => {
    if (!fullscreen) return
    const prevOverflow = document.body.style.overflow
    const prevOverscroll = document.body.style.overscrollBehavior
    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'
    return () => {
      document.body.style.overflow = prevOverflow
      document.body.style.overscrollBehavior = prevOverscroll
    }
  }, [fullscreen])

  function seek(t: number) {
    const clamped = Math.max(0, Math.min(total || t, t))
    updateCurrent(clamped)
    if (videoRef.current) videoRef.current.currentTime = clamped
  }

  useImperativeHandle(ref, () => ({ seek }))

  function scrub(e: React.MouseEvent<HTMLDivElement>) {
    if (!total) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    seek(Math.round(pct * total))
  }

  /**
   * Slide vertical (estilo feed do Instagram) ao trocar de vídeo na aba
   * Reels/tela cheia: quem sai e quem entra deslizam no sentido do swipe.
   * No Player (ou com reduced-motion) vira um fade simples, sem deslocamento.
   */
  const slideInReels = tab === 'reels' && !reduceMotion
  const slideVariants = {
    enter: (dir: 1 | -1) =>
      slideInReels ? { y: dir > 0 ? '100%' : '-100%', opacity: 1 } : { opacity: 0 },
    center: { y: 0, opacity: 1 },
    exit: (dir: 1 | -1) =>
      slideInReels ? { y: dir > 0 ? '-100%' : '100%', opacity: 1 } : { opacity: 0 },
  }
  const fullscreenSlideVariants = {
    enter: (dir: 1 | -1) =>
      reduceMotion ? { opacity: 0 } : { y: dir > 0 ? '100%' : '-100%', opacity: 1 },
    center: { y: 0, opacity: 1 },
    exit: (dir: 1 | -1) =>
      reduceMotion ? { opacity: 0 } : { y: dir > 0 ? '-100%' : '100%', opacity: 1 },
  }

  return (
    <div className={className}>
      {/* Tabs */}
      <div className="flex gap-2 px-4 lg:px-0">
        <TabButton active={tab === 'player'} onClick={() => setTab('player')}>
          Player
        </TabButton>
        <TabButton active={tab === 'reels'} onClick={switchToReels}>
          Preview Reels
        </TabButton>
      </div>

      {/*
        Player e "Preview Reels" compartilham o MESMO elemento <video>: ao trocar
        de aba, a reprodução continua exatamente do mesmo ponto, sem reiniciar
        (a troca de formato em si é instantânea, não animada — ver comentário
        abaixo).
      */}
      <div className="mt-3">
        <div className={cn('flex justify-center', tab === 'reels' ? 'px-0' : 'px-4 lg:px-0')}>
          <div
            // `w-full` sempre: sem isso, a caixa interna (que também é `w-full`,
            // agora relativa a ESTE div em vez de ser ela mesma o item flex
            // direto) perde a referência de largura e a aba Player colapsa pra
            // 0×0 — o max-w-[300px] do chassi abaixo (só na Reels) é quem limita
            // a largura final, não este wrapper.
            className={cn(
              'w-full',
              tab === 'reels' &&
                // Chassi estilo iPhone Pro Max ao redor da tela, no celular e no
                // desktop. Gradiente "titânio roxo" + os botões laterais abaixo
                // (decorativos). No celular ganha uma margem lateral pra moldura
                // não colar na borda da tela; no desktop vira o mockup estreito
                // ao lado do painel de comentários.
                cn(
                  'relative mx-3 bg-gradient-to-br from-[#8b7aa8] via-[#1c1a22] to-[#0a0a0c] shadow-[0_35px_60px_-15px_rgba(0,0,0,0.7)] sm:mx-auto',
                  reelsLandscape
                    ? 'rounded-[2rem] p-[9px] sm:max-w-[560px] lg:max-w-[520px] lg:p-[11px]'
                    : 'rounded-[2.75rem] p-[10px] sm:max-w-[360px] lg:max-w-[300px] lg:p-[12px]',
                ),
            )}
          >
            {tab === 'reels' && (
              <>
                {/* Botão de Ação */}
                <span className="absolute -left-[2px] top-[92px] h-7 w-[3px] rounded-l-sm bg-[#2a2730]" />
                {/* Volume + / − */}
                <span className="absolute -left-[2px] top-[132px] h-12 w-[3px] rounded-l-sm bg-[#2a2730]" />
                <span className="absolute -left-[2px] top-[184px] h-12 w-[3px] rounded-l-sm bg-[#2a2730]" />
                {/* Botão lateral (power) */}
                <span className="absolute -right-[2px] top-[150px] h-24 w-[3px] rounded-r-sm bg-[#2a2730]" />
              </>
            )}
            <div
              ref={playerFrameRef}
              // Moldura: define a largura final da caixa (incl. max-w no desktop),
              // cor de fundo, borda e cantos arredondados. Não é animada com Framer
              // Motion `layout` — o morph entre Player e Reels deixava um
              // transform: scale(...) grudado sem nunca terminar de resolver (tanto
              // em teste automatizado quanto no Safari do iPhone), espremendo o
              // Reels de volta na proporção do Player. A troca de formato agora é
              // instantânea; o <video> continua sendo o mesmo elemento, então a
              // reprodução não reinicia mesmo sem a animação.
              //
              // Player: a altura vem da propriedade CSS `aspect-ratio` aplicada
              // aqui mesmo, direto em cima da largura JÁ DEFINIDA pela moldura —
              // sem o risco de arredondamento de um `padding-top` percentual (que
              // podia sobrar uma fração de pixel cortada pelo `overflow-hidden`
              // nas laterais em telas de celular). Reels continua usando o spacer
              // de padding-top abaixo, sem mudanças.
              style={tab === 'player' ? { aspectRatio: aspectRatio || 16 / 9 } : undefined}
              className={cn(
                'relative overflow-hidden bg-black select-none',
                tab === 'player'
                  ? // `max-h` evita que vídeos verticais, ao usar a proporção real
                    // (ver aspectRatio acima), estourem a altura da página no
                    // desktop — a coluna do Player é `1fr` num grid largo
                    // (InternalReview etc.), então largura total + proporção
                    // vertical vira uma caixa gigantesca. Acima do cap, o
                    // `object-contain` do <video> centraliza com faixas pretas,
                    // igual já acontecia com a caixa 16:9 fixa antes desta aba
                    // passar a usar a proporção real do arquivo.
                    cn('w-full sm:rounded-xl', playerMaxHeightClass ?? 'lg:max-h-[75vh]')
                  : // Reels: a "tela" fica sempre dentro do chassi de iPhone acima
                    // (que já define a largura máxima) — raio = raio do chassi
                    // menos a espessura do bezel, pra aninhar certinho como o
                    // vidro por dentro do corpo do aparelho.
                    reelsLandscape
                      ? 'w-full rounded-[1.5rem] border-0 shadow-none lg:rounded-[1.35rem]'
                      : 'w-full rounded-[2.15rem] border-0 shadow-none lg:rounded-[2rem]',
              )}
            >
            {/*
              Spacer do Reels: padding-top percentual cria a altura a partir da
              largura já definida pela moldura acima — por isso fica num elemento
              à parte: se o padding-top estivesse no mesmo elemento que tem
              max-w-[300px], a porcentagem seria calculada em cima da largura do
              PAI (não do max-width já aplicado), dando uma altura enorme e errada
              no desktop. No Player a altura já vem do `aspect-ratio` da moldura
              (acima), então este spacer fica sem padding (0) nessa aba.

              216.67% = 19.5:9, a proporção real da tela de um iPhone Pro Max —
              e não 9:16 (177.78%), que deixava a moldura baixa e atarracada
              perto de um aparelho de verdade.
            */}
            <div style={{ paddingTop: tab === 'player' ? undefined : reelsLandscape ? '46.1539%' : '216.6667%' }} />

            <div className="absolute inset-0">
              <AnimatePresence initial={false} custom={direction} mode="popLayout">
                <motion.div
                  key={video.id}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0"
                >
                  {playbackUrl && !processing && !fullscreen ? (
                    <video
                      ref={bindVideoRef(video.id)}
                      src={playbackUrl}
                      poster={video.posterUrl || undefined}
                      playsInline
                      className={cn(
                        'h-full w-full',
                        tab === 'player' || reelsLandscape ? 'object-contain' : 'object-cover',
                      )}
                      onLoadedMetadata={(e) => {
                        const d = e.currentTarget.duration
                        if (Number.isFinite(d)) setDuration(Math.round(d))
                        const { videoWidth, videoHeight } = e.currentTarget
                        if (videoWidth && videoHeight) setAspectRatio(videoWidth / videoHeight)
                        e.currentTarget.currentTime = currentRef.current
                      }}
                      onTimeUpdate={(e) => updateCurrent(e.currentTarget.currentTime)}
                      onPlay={() => setPlaying(true)}
                      onPause={() => setPlaying(false)}
                      onClick={tab === 'reels' ? handleReelsTap : togglePlay}
                    />
                  ) : video.posterUrl ? (
                    <Image
                      src={video.posterUrl}
                      alt={`Prévia do vídeo ${video.title}`}
                      fill
                      className="object-cover opacity-80"
                      sizes="(min-width: 1024px) 60vw, 100vw"
                      unoptimized
                      priority
                    />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-muted-foreground/60">
                      <Film className="size-10" />
                    </span>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Indicador sutil de "preparando vídeo" (status_processamento) */}
              {processing && <ProcessingOverlay />}

              {/* Chrome do Reels (aparece só nessa aba, com fade) */}
              <AnimatePresence>
                {tab === 'reels' && !processing && (
                  <ReelsChrome
                    client={video.clientName}
                    photoUrl={clientPhotoUrl}
                    description={clientDescription}
                    framed
                  />
                )}
              </AnimatePresence>
              {tab === 'reels' && reelsLandscape && !processing && (
                <span className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-black/55 px-2 py-1 text-[10px] font-medium text-white/85 backdrop-blur-sm">
                  Prévia horizontal
                </span>
              )}

              {/*
                Navegação por swipe da aba Reels (estilo feed do Instagram): uma
                camada arrastável por cima do vídeo. Disponível mesmo enquanto o
                vídeo processa, senão o cliente fica preso num vídeo sem player.
                Toque sem arrastar continua alternando play/pause.
              */}
              {tab === 'reels' && !fullscreen && (hasNext || hasPrev) && (
                <motion.div
                  drag="y"
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={0.55}
                  onDragEnd={(_, info) => handleSwipeEnd(info)}
                  onTap={handleReelsTap}
                  className="absolute inset-0 z-10 cursor-grab touch-none select-none overscroll-none active:cursor-grabbing"
                />
              )}

              {/* Dica sutil de swipe — só quando há próximo vídeo na fila do cliente */}
              {tab === 'reels' && !fullscreen && !processing && hasNext && (
                <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 animate-bounce text-white/80">
                  <ChevronUp className="size-6" />
                </div>
              )}

              {/* Indicador de pausado — Reels sempre tenta tocar sozinho, mas se
                  o navegador recusar o autoplay (ou o usuário pausar de propósito)
                  isso deixa claro na tela, em vez de parecer travado. */}
              {tab === 'reels' && !fullscreen && !processing && showPaused && (
                <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
                  <span className="grid size-16 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm">
                    <Play className="size-7 fill-current" />
                  </span>
                </div>
              )}

              {/* Velocidade de reprodução e tela cheia — só no player */}
              {tab === 'player' && !processing && playbackUrl && (
                <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cyclePlaybackRate}
                    aria-label="Velocidade de reprodução"
                    className="inline-flex min-h-8 items-center gap-1 rounded-full bg-black/50 px-2.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/70"
                  >
                    <Gauge className="size-3.5" />
                    {playbackRate}x
                  </button>
                  <button
                    type="button"
                    onClick={togglePlayerFullscreen}
                    aria-label={playerFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                    className="inline-flex size-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
                  >
                    {playerFullscreen ? (
                      <Minimize className="size-3.5" />
                    ) : (
                      <Maximize className="size-3.5" />
                    )}
                  </button>
                </div>
              )}

              {/* Botão de play — só no player */}
              {tab === 'player' && !processing && (
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={playing ? 'Pausar' : 'Reproduzir'}
                  className={cn(
                    'absolute inset-0 grid place-items-center transition-opacity',
                    playing && playbackUrl ? 'opacity-0 hover:opacity-100' : 'opacity-100',
                  )}
                >
                  <span className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105">
                    {playing ? (
                      <Pause className="size-7 fill-current" />
                    ) : (
                      <Play className="size-7 fill-current" />
                    )}
                  </span>
                </button>
              )}
            </div>
          </div>
          </div>
        </div>

        {/*
          Botões explícitos de navegação — alternativa ao swipe, disponível nas
          duas abas (o swipe por arrastar só existe na aba Reels). Sem isso,
          quem fica na aba Player não tinha nenhum jeito de trocar de vídeo.
        */}
        {(hasNext || hasPrev) && (
          <div className="mt-3 grid grid-cols-2 gap-2 px-4 lg:px-0">
            <button
              type="button"
              onClick={goPrev}
              disabled={!hasPrev}
              className="inline-flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg bg-secondary px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="size-4 shrink-0" />
              <span className="truncate">Vídeo anterior</span>
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!hasNext}
              className="inline-flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg bg-secondary px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="truncate">Próximo vídeo</span>
              <ChevronRight className="size-4 shrink-0" />
            </button>
          </div>
        )}

        {/* Barra de progresso com marcadores de comentário — só no player */}
        {tab === 'player' && !processing && (
          <div className="px-4 pt-3 lg:px-0">
            <div onClick={scrub} className="group relative h-6 cursor-pointer">
              <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: total ? `${(current / total) * 100}%` : '0%' }}
                />
              </div>
              {/* markers */}
              {total > 0 &&
                markers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    title={`${formatDuration(m.timestamp)} — ${m.label}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      seek(m.timestamp)
                    }}
                    className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-background"
                    style={{ left: `${(m.timestamp / total) * 100}%` }}
                  />
                ))}
              {/* playhead */}
              <span
                className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background"
                style={{ left: total ? `${(current / total) * 100}%` : '0%' }}
              />
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>{formatDuration(current)}</span>
              <span>{formatDuration(total)}</span>
            </div>
          </div>
        )}
      </div>

      {/*
        Tela cheia fiel ao Reels: um portal pro <body> (fora de qualquer
        ancestral animado pelo Framer Motion, que criaria um novo containing
        block e quebraria o position:fixed). O <video> da caixa inline fica
        desmontado enquanto isso — evita dois vídeos tocando ao mesmo tempo.
      */}
      {fullscreen &&
        playbackUrl &&
        createPortal(
          <div className="fixed inset-0 z-[100] h-[100dvh] w-screen overflow-hidden overscroll-none bg-black">
            <AnimatePresence initial={false} custom={direction} mode="popLayout">
              <motion.div
                key={video.id}
                custom={direction}
                variants={fullscreenSlideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0"
              >
                <video
                  ref={bindVideoRef(video.id)}
                  src={playbackUrl}
                  poster={video.posterUrl || undefined}
                  playsInline
                  autoPlay
                  className={cn('h-full w-full', reelsLandscape ? 'object-contain' : 'object-cover')}
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration
                    if (Number.isFinite(d)) setDuration(Math.round(d))
                    e.currentTarget.currentTime = currentRef.current
                  }}
                  onTimeUpdate={(e) => updateCurrent(e.currentTarget.currentTime)}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onClick={handleReelsTap}
                />
              </motion.div>
            </AnimatePresence>

            <ReelsChrome
              client={video.clientName}
              photoUrl={clientPhotoUrl}
              description={clientDescription}
            />

            {reelsLandscape && (
              <span className="pointer-events-none absolute left-16 top-4 z-20 rounded-full bg-black/55 px-2 py-1 text-[10px] font-medium text-white/85 backdrop-blur-sm">
                Prévia horizontal
              </span>
            )}

            {/* Camada de gesto: arrastar troca de vídeo, tocar pausa/retoma */}
            <motion.div
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.55}
              onDragEnd={(_, info) => handleSwipeEnd(info)}
              onTap={handleReelsTap}
              className="absolute inset-0 z-10 cursor-grab touch-none select-none active:cursor-grabbing"
            />

            {hasNext && (
              <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 animate-bounce text-white/80">
                <ChevronUp className="size-6" />
              </div>
            )}

            {/* Indicador de pausado — mesma lógica da aba Reels inline. */}
            {showPaused && (
              <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
                <span className="grid size-16 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm">
                  <Play className="size-7 fill-current" />
                </span>
              </div>
            )}

            {/* Botão de voltar */}
            <button
              type="button"
              onClick={closeFullscreen}
              aria-label="Voltar"
              className="absolute left-3 top-3 z-30 grid size-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm"
            >
              <ChevronLeft className="size-6" />
            </button>
          </div>,
          document.body,
        )}
    </div>
  )
})

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-11 flex-1 rounded-lg px-4 text-sm font-medium transition-colors lg:flex-none',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

/**
 * Sobreposição de "chrome" do Reels (gradientes, notch, barra lateral de ícones
 * e legenda), renderizada por cima do mesmo <video> compartilhado.
 */
function ReelsChrome({
  client,
  photoUrl,
  description,
  framed = false,
}: {
  client: string
  photoUrl?: string | null
  description?: string | null
  /** Dentro da moldura de iPhone: desenha a Ilha Dinâmica. Na tela cheia real fica só uma pílula discreta, já que o aparelho tem a sua própria. */
  framed?: boolean
}) {
  const handle = (client || 'cliente').toLowerCase().replace(/\s+/g, '')
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="pointer-events-none absolute inset-0"
    >
      {/* Notch — dentro da moldura vira a Ilha Dinâmica (pill preta + pontinho
          de câmera); na tela cheia real fica só uma pílula discreta, já que o
          aparelho de verdade tem a sua própria. */}
      {framed ? (
        <div className="absolute left-1/2 top-3 z-20 flex h-6 w-24 -translate-x-1/2 items-center justify-end rounded-full bg-black pr-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] lg:top-4 lg:h-7 lg:w-28">
          <span className="size-1.5 rounded-full bg-[#2c3d66]" />
        </div>
      ) : (
        <div className="absolute left-1/2 top-3 z-20 h-1.5 w-16 -translate-x-1/2 rounded-full bg-white/30" />
      )}
      {/* Gradientes */}
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/60 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent" />

      {/* Barra de ícones */}
      <div className="absolute bottom-24 right-2 flex flex-col items-center gap-5 text-white">
        <RailIcon icon={Heart} label="12,4 mil" />
        <RailIcon icon={MessageCircle} label="318" />
        <RailIcon icon={Send} label="204" />
        <RailIcon icon={Bookmark} label="Salvar" />
        <MoreHorizontal className="size-6" />
      </div>

      {/* Legenda */}
      <div className="absolute inset-x-0 bottom-0 p-3 pr-14 text-white">
        <div className="flex items-center gap-2">
          {photoUrl ? (
            <span className="relative size-8 shrink-0 overflow-hidden rounded-full">
              <Image src={photoUrl} alt="" fill className="object-cover" sizes="32px" unoptimized />
            </span>
          ) : (
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {(client || 'C').slice(0, 1)}
            </span>
          )}
          <span className="text-sm font-semibold">@{handle}</span>
          <span className="rounded border border-white/50 px-1.5 py-0.5 text-[10px]">Seguir</span>
        </div>
        <p className="mt-2 text-sm leading-snug">{description || 'Gostou do resultado?💛'}</p>
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <Music2 className="size-3.5" />
          <span className="truncate">Áudio original · {client}</span>
        </div>
      </div>
    </motion.div>
  )
}

function RailIcon({ icon: Icon, label }: { icon: typeof Heart; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <Icon className="size-7" />
      <span className="text-[10px] font-medium">{label}</span>
    </div>
  )
}

/** Indicador sutil enquanto o vídeo otimizado é preparado no backend. */
function ProcessingOverlay() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-black/50 backdrop-blur-[2px]">
      <div className="flex flex-col items-center gap-2 rounded-xl bg-background/80 px-4 py-3 text-center">
        <Loader2 className="size-5 animate-spin text-primary" />
        <p className="text-sm font-medium text-foreground">Preparando vídeo…</p>
        <p className="max-w-[16rem] text-xs text-muted-foreground">
          A versão otimizada está sendo gerada. Você já pode comentar e avaliar.
        </p>
      </div>
    </div>
  )
}
