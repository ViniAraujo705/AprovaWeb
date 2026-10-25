'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { RotateCcw, ArrowLeft } from 'lucide-react'
import { motion, useReducedMotion } from '@/components/motion'
import { Gesture } from '@/components/gestures'
import { CheckLogo } from '@/components/page-header'

/**
 * Tela dedicada de confirmação após a aprovação do vídeo ("Deu check!").
 * Gesto 1 do sistema de gestos (a mão que vira check) + chuva sutil de checks
 * (desligada em reduced-motion), agradecimento e nome do projeto aprovado.
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
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background"
      role="dialog"
      aria-modal="true"
      aria-label="Vídeo aprovado"
    >
      {!reduce && <Confetti />}

      <div className="relative z-10 mx-auto grid w-full max-w-5xl flex-1 items-center gap-8 px-6 py-12 md:grid-cols-[1fr_1.2fr] md:gap-12">
        {/* Gesto 1: a própria mão forma o check */}
        <motion.div
          initial={reduce ? { opacity: 0 } : { scale: 0.6, rotate: -12, opacity: 0 }}
          animate={reduce ? { opacity: 1 } : { scale: 1, rotate: 0, opacity: 1 }}
          transition={
            reduce
              ? { duration: 0.2 }
              : { type: 'spring', stiffness: 220, damping: 15, delay: 0.1 }
          }
          className="flex justify-center"
        >
          <Gesture state="check" className="h-40 w-auto sm:h-56 md:h-72" />
        </motion.div>

        <div className="text-center md:text-left">
          <motion.span
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: reduce ? 0.1 : 0.2 }}
            className="inline-flex rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground"
          >
            Vídeo aprovado
          </motion.span>

          <motion.h1
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: reduce ? 0.1 : 0.25 }}
            className="mt-5 font-display text-6xl leading-[0.95] sm:text-7xl md:text-8xl"
          >
            Deu <span className="text-success-ink">check!</span>
          </motion.h1>

          <motion.p
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: reduce ? 0.1 : 0.35 }}
            className="mt-5 text-base text-muted-foreground sm:text-lg"
          >
            Obrigado! A agência já foi avisada e vai seguir com a publicação de{' '}
            <span className="font-semibold text-foreground">{projectName}</span>.
          </motion.p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 md:justify-start">
            {galleryLink && (
              <Link
                href={`/g/${galleryLink}`}
                className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-primary px-6 font-display text-base text-primary-foreground transition-opacity hover:opacity-90"
              >
                <ArrowLeft className="size-4" />
                Ver os outros vídeos
              </Link>
            )}
            <button
              type="button"
              onClick={onReset}
              className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-foreground px-6 text-base font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <RotateCcw className="size-4" />
              Revisar novamente
            </button>
          </div>
        </div>
      </div>

      <p className="relative z-10 flex items-center justify-center gap-2 pb-8 text-sm text-muted-foreground">
        Aprovações feitas com <CheckLogo className="h-5 w-[82px]" />
      </p>
    </motion.div>
  )
}

/** Confete sutil em CSS (animação desligada por prefers-reduced-motion). */
function Confetti() {
  const pieces = useMemo(() => {
    // Pequenos "checks" em lima e verde-sálvia caindo, como no layout.
    const colors = ['var(--primary)', 'var(--chart-2)', 'var(--primary-ink)']
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
          width: `${size * 1.6}px`,
          height: `${size}px`,
          color: colors[i % colors.length],
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
        <svg
          key={p.id}
          viewBox="0 0 16 10"
          fill="none"
          className="absolute top-0 opacity-0"
          style={p.style}
        >
          <path d="M2 5l4 3 8-6" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ))}
    </div>
  )
}
