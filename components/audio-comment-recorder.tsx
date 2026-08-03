'use client'

/**
 * Botão de gravação de áudio pro comentário do cliente (MediaRecorder).
 * Não lida com upload nem preview — só grava e devolve o Blob pronto via
 * `onRecorded`; quem chama decide o que fazer com ele (preview, envio).
 */
import { useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Limite de duração por gravação, pra não deixar um áudio esquecido gravando indefinidamente. */
const MAX_SECONDS = 120

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** `MediaRecorder` só aceita alguns mimeTypes — usa o primeiro suportado pelo navegador. */
function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  const candidates = ['audio/webm', 'audio/mp4', 'audio/ogg']
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type))
}

export function AudioCommentRecorder({
  onRecorded,
  disabled,
  className,
}: {
  onRecorded: (blob: Blob) => void
  disabled?: boolean
  className?: string
}) {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  // Solta o microfone se o componente sumir da tela no meio de uma gravação.
  useEffect(() => stopStream, [])

  async function start() {
    setError(null)
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Gravação de áudio não é suportada neste navegador.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const mimeType = pickSupportedMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stopStream()
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
        chunksRef.current = []
        if (blob.size > 0) onRecorded(blob)
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
      setElapsed(0)
      timerRef.current = setInterval(() => {
        setElapsed((s) => {
          if (s + 1 >= MAX_SECONDS) {
            recorderRef.current?.stop()
            setRecording(false)
            return MAX_SECONDS
          }
          return s + 1
        })
      }, 1000)
    } catch {
      setError('Não foi possível acessar o microfone. Verifique a permissão do navegador.')
    }
  }

  function stop() {
    recorderRef.current?.stop()
    setRecording(false)
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={recording ? stop : start}
        disabled={disabled && !recording}
        aria-label={recording ? 'Parar gravação' : 'Gravar um áudio'}
        title={recording ? 'Parar gravação' : 'Gravar um áudio'}
        className={cn(
          'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors disabled:opacity-40',
          recording
            ? 'bg-destructive text-white hover:opacity-90'
            : 'bg-secondary text-foreground hover:bg-secondary/70',
        )}
      >
        {recording ? <Square className="size-3.5 fill-current" /> : <Mic className="size-3.5" />}
        {recording ? formatElapsed(elapsed) : 'Gravar áudio'}
      </button>
      {recording && (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <span className="size-1.5 animate-pulse rounded-full bg-destructive" />
          Gravando…
        </span>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
