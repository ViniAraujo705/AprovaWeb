'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { motion, AnimatePresence } from '@/components/motion'
import { cn } from '@/lib/utils'

const MAX_ZOOM = 3

interface Box {
  width: number
  height: number
}

interface Point {
  x: number
  y: number
}

interface ImageCropModalProps {
  /** Arquivo local selecionado pelo usuário (ainda não enviado). */
  file: File
  /** Proporção largura/altura do enquadramento final (ex.: 1 para quadrado, 16/9 para capa). */
  aspect: number
  /** 'circle' recorta uma máscara redonda por cima do quadro (avatar); 'rect' mantém cantos retos (logo/capa). */
  shape?: 'circle' | 'rect'
  title?: string
  /** Largura do raster de saída; a altura é derivada de `aspect`. */
  outputWidth?: number
  /** PNG preserva transparência (logos); JPEG gera arquivo menor (fotos/avatares/capas). */
  outputType?: 'image/png' | 'image/jpeg'
  onCancel: () => void
  onConfirm: (file: File) => void
}

/** Distância euclidiana entre dois pointers — usada pro gesto de pinça (zoom por toque). */
function pointerDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Modal de recorte: zoom + arraste sobre um quadro de proporção fixa, ao estilo
 * dos seletores de foto de perfil de apps mobile. Sem dependência externa —
 * a matemática de origem/zoom é a mesma usada em `createVideoThumbnail`
 * (upload-view.tsx), só que interativa em vez de automática.
 */
export function ImageCropModal({
  file,
  aspect,
  shape = 'rect',
  title = 'Ajustar imagem',
  outputWidth = 640,
  outputType = 'image/jpeg',
  onCancel,
  onConfirm,
}: ImageCropModalProps) {
  // Criação e revogação precisam estar no mesmo efeito: no Strict Mode (dev), o
  // React monta/desmonta o efeito uma vez de teste logo de cara — se a criação
  // estivesse fora (ex.: um useMemo), esse desmonte simulado revogaria a URL
  // antes da imagem carregar. Recriando a cada "mount" do par, cada cleanup só
  // revoga a URL que o próprio ciclo criou.
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const frameRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [frameSize, setFrameSize] = useState<Box | null>(null)
  const [naturalSize, setNaturalSize] = useState<Box | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [processing, setProcessing] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const dragState = useRef<{
    pointers: Map<number, Point>
    origin: Point | null
    startPan: Point
    startDistance: number | null
  }>({
    pointers: new Map(),
    origin: null,
    startPan: { x: 0, y: 0 },
    startDistance: null,
  })

  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setFrameSize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  // Escala mínima que garante a imagem cobrindo o quadro inteiro (equivalente a object-fit: cover).
  const baseScale = useMemo(() => {
    if (!frameSize || !naturalSize) return null
    return Math.max(frameSize.width / naturalSize.width, frameSize.height / naturalSize.height)
  }, [frameSize, naturalSize])

  const scale = baseScale != null ? baseScale * zoom : null

  function clampPan(nextPan: Point, currentScale: number): Point {
    if (!frameSize || !naturalSize) return nextPan
    const imgW = naturalSize.width * currentScale
    const imgH = naturalSize.height * currentScale
    const maxPanX = Math.max(0, (imgW - frameSize.width) / 2)
    const maxPanY = Math.max(0, (imgH - frameSize.height) / 2)
    return {
      x: Math.min(maxPanX, Math.max(-maxPanX, nextPan.x)),
      y: Math.min(maxPanY, Math.max(-maxPanY, nextPan.y)),
    }
  }

  // Sempre que o zoom (ou o tamanho do quadro) muda, o intervalo de pan válido muda junto.
  useEffect(() => {
    if (scale == null) return
    setPan((prev) => clampPan(prev, scale))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, frameSize?.width, frameSize?.height])

  function applyZoomDelta(delta: number) {
    setZoom((prev) => Math.min(MAX_ZOOM, Math.max(1, prev + delta)))
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    applyZoomDelta(-e.deltaY * 0.0015)
  }

  // Arraste (1 ponteiro) e pinça de zoom (2 ponteiros) compartilham o mesmo
  // rastreador de pointers — cobre mouse e toque sem depender de lib externa.
  function onPointerDown(e: React.PointerEvent) {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const points = dragState.current.pointers
    points.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (points.size === 1) {
      dragState.current.origin = { x: e.clientX, y: e.clientY }
      dragState.current.startPan = pan
      setIsDragging(true)
    } else if (points.size === 2) {
      const [a, b] = Array.from(points.values())
      dragState.current.startDistance = pointerDistance(a, b)
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const points = dragState.current.pointers
    if (!points.has(e.pointerId)) return
    points.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (points.size === 2 && dragState.current.startDistance != null) {
      const [a, b] = Array.from(points.values())
      const distance = pointerDistance(a, b)
      const ratio = distance / dragState.current.startDistance
      if (Number.isFinite(ratio) && ratio > 0) {
        setZoom((prev) => Math.min(MAX_ZOOM, Math.max(1, prev * ratio)))
      }
      dragState.current.startDistance = distance
      return
    }

    if (points.size === 1 && scale != null && dragState.current.origin) {
      const dx = e.clientX - dragState.current.origin.x
      const dy = e.clientY - dragState.current.origin.y
      setPan(
        clampPan({ x: dragState.current.startPan.x + dx, y: dragState.current.startPan.y + dy }, scale),
      )
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const points = dragState.current.pointers
    points.delete(e.pointerId)
    dragState.current.startDistance = null
    if (points.size === 0) {
      setIsDragging(false)
      dragState.current.origin = null
    } else if (points.size === 1) {
      const [p] = Array.from(points.values())
      dragState.current.origin = p
      dragState.current.startPan = pan
    }
  }

  async function handleConfirm() {
    if (!frameSize || !naturalSize || scale == null || !imgRef.current) return
    setProcessing(true)
    try {
      const maxPanX = Math.max(0, (naturalSize.width * scale - frameSize.width) / 2)
      const maxPanY = Math.max(0, (naturalSize.height * scale - frameSize.height) / 2)
      const srcX = (maxPanX - pan.x) / scale
      const srcY = (maxPanY - pan.y) / scale
      const srcW = frameSize.width / scale
      const srcH = frameSize.height / scale

      const outputHeight = Math.round(outputWidth / aspect)
      const canvas = document.createElement('canvas')
      canvas.width = outputWidth
      canvas.height = outputHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas indisponível')
      ctx.drawImage(imgRef.current, srcX, srcY, srcW, srcH, 0, 0, outputWidth, outputHeight)

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, outputType, outputType === 'image/jpeg' ? 0.9 : undefined),
      )
      if (!blob) throw new Error('Falha ao gerar a imagem recortada')
      const croppedFile = new File([blob], file.name, { type: outputType })
      onConfirm(croppedFile)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 grid place-items-center p-4">
        <motion.div
          className="absolute inset-0 bg-black/80"
          onClick={onCancel}
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        />
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="relative flex w-full max-w-sm flex-col items-center rounded-2xl border border-border bg-card p-5 shadow-2xl"
          initial={{ y: 8, scale: 0.98 }}
          animate={{ y: 0, scale: 1 }}
          exit={{ y: 8, scale: 0.98 }}
          transition={{ duration: 0.15 }}
        >
          <div className="flex w-full items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancelar"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <div
            ref={frameRef}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={cn(
              'relative mt-4 w-full touch-none select-none overflow-hidden bg-secondary',
              shape === 'circle' ? 'rounded-full' : 'rounded-lg',
              isDragging ? 'cursor-grabbing' : 'cursor-grab',
            )}
            style={{ aspectRatio: aspect, maxHeight: '60vh' }}
          >
            {loadError ? (
              <div className="absolute inset-0 grid place-items-center text-center text-xs text-muted-foreground">
                Não foi possível carregar a imagem.
              </div>
            ) : !objectUrl ? (
              <div className="absolute inset-0 grid place-items-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={imgRef}
                src={objectUrl}
                alt=""
                draggable={false}
                onLoad={(e) => {
                  const img = e.currentTarget
                  setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
                }}
                onError={() => setLoadError(true)}
                className="pointer-events-none absolute left-1/2 top-1/2"
                style={
                  frameSize && naturalSize && scale != null
                    ? {
                        width: naturalSize.width * scale,
                        height: naturalSize.height * scale,
                        transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px)`,
                      }
                    : { opacity: 0 }
                }
              />
            )}
            {/* Grade 3x3 discreta — referência visual de enquadramento, não interativa. */}
            <div className="pointer-events-none absolute inset-0 opacity-20">
              <div className="absolute left-1/3 top-0 h-full w-px bg-white" />
              <div className="absolute left-2/3 top-0 h-full w-px bg-white" />
              <div className="absolute top-1/3 left-0 w-full h-px bg-white" />
              <div className="absolute top-2/3 left-0 w-full h-px bg-white" />
            </div>
          </div>

          <div className="mt-4 flex w-full items-center gap-3">
            <ZoomOut className="size-4 shrink-0 text-muted-foreground" />
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              aria-label="Zoom"
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
            />
            <ZoomIn className="size-4 shrink-0 text-muted-foreground" />
          </div>

          <div className="mt-5 flex w-full gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={processing}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-secondary text-sm font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={processing || !naturalSize || loadError}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {processing ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Usar foto
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
