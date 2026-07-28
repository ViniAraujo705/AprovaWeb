'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Check, RotateCcw, ArrowLeft } from 'lucide-react'
import { motion, useReducedMotion } from '@/components/motion'

/**
 * Tela dedicada de confirmação após a aprovação do vídeo.
 * Celebração leve: check animado + confete sutil (desligado em reduced-motion),
 * agradecimento e nome do projeto aprovado.
 */
export function ApprovedCelebration({
  projectName,
  onReset,
  galleryLink,
}: {
  projectName: string
  onReset: () => void
  /** linkPublico da galeria do projeto (`/g/:link`), quando o vídeo foi aberto a partir dela — habilita o botão de voltar para ver os outros vídeos. */
  galleryLink?: string
}) {
  const reduce = useReducedMotion()

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-background px-6 text-center"
      role="dialog"
      aria-modal="true"
      aria-label="Vídeo aprovado"
    >
      {!reduce && <Confetti />}

      <div className="relative z-10 flex max-w-sm flex-col items-center">
        {/* Check animado */}
        <motion.span
          initial={reduce ? { opacity: 0 } : { scale: 0, rotate: -20 }}
          animate={reduce ? { opacity: 1 } : { scale: 1, rotate: 0 }}
          transition={
            reduce
              ? { duration: 0.2 }
              : { type: 'spring', stiffness: 260, damping: 16, delay: 0.1 }
          }
          className="grid size-20 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg"
        >
          <Check className="size-10" strokeWidth={3} />
        </motion.span>

        <motion.h1
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: reduce ? 0.1 : 0.25 }}
          className="mt-6 font-display text-4xl leading-none tracking-wide sm:text-5xl"
        >
          VÍDEO APROVADO!
        </motion.h1>

        <motion.p
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: reduce ? 0.1 : 0.35 }}
          className="mt-3 text-sm text-muted-foreground"
        >
          Obrigado! A agência já foi avisada e vai seguir com a publicação.
        </motion.p>

        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: reduce ? 0.1 : 0.45 }}
          className="mt-5 rounded-full bg-secondary px-4 py-2 text-sm font-medium text-foreground"
        >
          {projectName}
        </motion.div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {galleryLink && (
            <Link
              href={`/g/${galleryLink}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <ArrowLeft className="size-4" />
              Ver outros vídeos do projeto
            </Link>
          )}
          <button
            type="button"
            onClick={onReset}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-secondary px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
          >
            <RotateCcw className="size-4" />
            Revisar novamente
          </button>
        </div>
      </div>
    </motion.div>
  )
}

/** Confete sutil em CSS (animação desligada por prefers-reduced-motion). */
function Confetti() {
  const pieces = useMemo(() => {
    const colors = [
      'var(--primary)',
      'var(--foreground)',
      'var(--muted-foreground)',
      '#34d399', // emerald-400 — toque de cor discreto
    ]
    return Array.from({ length: 28 }).map((_, i) => {
      const left = Math.random() * 100
      const delay = Math.random() * 0.6
      const duration = 2.4 + Math.random() * 1.6
      const drift = (Math.random() - 0.5) * 160
      const rotate = 180 + Math.random() * 540
      const size = 6 + Math.random() * 6
      return {
        id: i,
        style: {
          left: `${left}%`,
          width: `${size}px`,
          height: `${size * 1.6}px`,
          background: colors[i % colors.length],
          animation: `aprova-confetti-fall ${duration}s ${delay}s ease-in forwards`,
          '--confetti-x': `${drift}px`,
          '--confetti-r': `${rotate}deg`,
        } as React.CSSProperties,
      }
    })
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 rounded-[1px] opacity-0"
          style={p.style}
        />
      ))}
    </div>
  )
}
