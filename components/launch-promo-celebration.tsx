'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, Gift, Users, Palette, BarChart3, Zap, FolderKanban } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from '@/components/motion'
import { CheckLogo } from '@/components/page-header'
import { useAuth } from '@/components/auth-provider'
import { usePlanLimit } from '@/components/plan-limit-provider'

/**
 * Promo de lançamento: quem cria a conta de 10/11/2026 até o fim de 30/11/2026
 * (horário de Brasília) já nasce no plano Agência — o backend aplica isso no
 * cadastro (src/plans/launch-promo.config.ts no Aprova-back; as datas daqui
 * precisam bater com as de lá). Esta tela agradece e explica o presente, uma
 * vez por usuário. `?boas-vindas=1` força a exibição, pra conferir o visual.
 */
const PROMO_STARTS_AT = new Date('2026-11-10T00:00:00-03:00').getTime()
const PROMO_ENDS_AT = new Date('2026-12-01T00:00:00-03:00').getTime()
const SEEN_KEY_PREFIX = 'check:promo-lancamento-visto:'

/**
 * Esta tela é da marca Check, não da agência: fixa as cores da identidade no
 * próprio container, por cima de qualquer cor de marca (white label) que a
 * agência tenha aplicado nos tokens globais — senão uma marca preta/branca
 * apagaria o check e o botão.
 */
const CHECK_IDENTITY = {
  '--primary': '#d6f593',
  '--primary-foreground': '#253326',
  '--deep': '#1c2a1e',
  '--deep-foreground': '#ebece7',
  '--deep-muted': '#a9b3a5',
  '--chart-2': '#7ea67c',
} as React.CSSProperties

const PERKS = [
  { icon: FolderKanban, text: 'Até 30 clientes e 500 entregas por mês' },
  { icon: Users, text: 'Equipe de até 8 pessoas trabalhando junto' },
  { icon: Palette, text: 'Sua marca na tela do cliente' },
  { icon: BarChart3, text: 'Relatórios avançados e desempenho da equipe' },
  { icon: Zap, text: 'Processamento e suporte prioritários' },
]

function readSeen(userId: string): boolean {
  try {
    return localStorage.getItem(SEEN_KEY_PREFIX + userId) === '1'
  } catch {
    return false
  }
}

function markSeen(userId: string) {
  try {
    localStorage.setItem(SEEN_KEY_PREFIX + userId, '1')
  } catch {
    // sem storage: pode aparecer de novo numa próxima visita, sem prejuízo
  }
}

export function LaunchPromoCelebration() {
  const { user } = useAuth()
  const { planStatus } = usePlanLimit()
  const searchParams = useSearchParams()
  const forced = searchParams.get('boas-vindas') === '1'
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!user) return
    if (forced) {
      setOpen(true)
      return
    }
    if (user.teamRole !== 'owner' || !user.createdAt || planStatus?.plan !== 'agencia') return
    const created = new Date(user.createdAt).getTime()
    if (Number.isNaN(created) || created < PROMO_STARTS_AT || created >= PROMO_ENDS_AT) return
    if (readSeen(user.id)) return
    setOpen(true)
  }, [user, planStatus?.plan, forced])

  function close() {
    if (user) markSeen(user.id)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const firstName = (user?.name ?? '').trim().split(/\s+/)[0]

  return (
    <AnimatePresence>
      {open && <Celebration firstName={firstName} onClose={close} />}
    </AnimatePresence>
  )
}

function Celebration({ firstName, onClose }: { firstName: string; onClose: () => void }) {
  const reduce = useReducedMotion()
  const rise = (delay: number) =>
    reduce
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2, delay: 0.05 } }
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { type: 'spring' as const, stiffness: 260, damping: 24, delay },
        }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={CHECK_IDENTITY}
      className="fixed inset-0 z-[60] overflow-y-auto bg-deep text-deep-foreground"
      role="dialog"
      aria-modal="true"
      aria-labelledby="promo-title"
    >
      <Glow reduce={!!reduce} />
      {!reduce && <CheckRain />}

      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-6xl flex-col px-5 py-6 sm:px-8">
        <motion.div {...rise(0)} className="flex justify-center md:justify-start">
          <CheckLogo onDeep className="h-7 w-[114px]" priority />
        </motion.div>

        <div className="grid flex-1 items-center gap-8 py-8 md:grid-cols-[0.85fr_1.15fr] md:gap-12">
          <div className="flex justify-center">
            <BigCheck reduce={!!reduce} />
          </div>

          <div className="text-center md:text-left">
            <motion.span
              {...rise(0.45)}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground"
            >
              <Gift className="size-4" />
              Presente de lançamento
            </motion.span>

            <motion.h1
              id="promo-title"
              {...rise(0.55)}
              className="mt-5 font-display text-4xl font-extrabold leading-[0.98] tracking-tight sm:text-5xl lg:text-6xl"
            >
              {firstName ? `${firstName}, obrigado` : 'Obrigado'} por dar{' '}
              <span className="relative whitespace-nowrap text-primary">
                check
                <Underline reduce={!!reduce} />
              </span>{' '}
              com a gente!
            </motion.h1>

            <motion.p {...rise(0.7)} className="mt-5 text-base text-deep-muted sm:text-lg">
              Você chegou no começo de tudo — e quem chega cedo ganha presente. Sua conta já nasceu no{' '}
              <span className="font-semibold text-deep-foreground">plano Agência</span>, o mais completo do
              Check. Sem cartão, sem pegadinha: é só começar a aprovar.
            </motion.p>

            <ul className="mx-auto mt-6 grid max-w-md gap-2 text-left sm:max-w-xl sm:grid-cols-2 md:mx-0">
              {PERKS.map((perk, i) => (
                <motion.li
                  key={perk.text}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: reduce ? 0.05 : 0.85 + i * 0.08 }}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                    <perk.icon className="size-4" />
                  </span>
                  {perk.text}
                </motion.li>
              ))}
            </ul>

            <motion.div {...rise(1.35)} className="mt-7 flex flex-col items-center gap-3 md:items-start">
              <motion.button
                type="button"
                onClick={onClose}
                ref={(el) => el?.focus({ preventScroll: true })}
                whileHover={reduce ? undefined : { scale: 1.03 }}
                whileTap={reduce ? undefined : { scale: 0.97 }}
                className="group inline-flex min-h-14 items-center gap-2.5 rounded-2xl bg-primary px-8 font-display text-lg font-bold text-primary-foreground shadow-[0_0_40px_-8px_var(--primary)] transition-shadow hover:shadow-[0_0_56px_-6px_var(--primary)]"
              >
                Bora dar o primeiro check
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
              </motion.button>
              <p className="text-xs text-deep-muted">Promo válida para cadastros até 30 de novembro.</p>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/** Check gigante que se desenha dentro de um círculo lima, com anéis pulsando atrás. */
function BigCheck({ reduce }: { reduce: boolean }) {
  return (
    <div className="relative grid size-48 place-items-center sm:size-64 lg:size-72">
      {!reduce &&
        [0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-full border-2 border-primary/40"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: [0.6, 1.35], opacity: [0.7, 0] }}
            transition={{ duration: 2.6, delay: 0.9 + i * 0.85, repeat: Infinity, ease: 'easeOut' }}
          />
        ))}
      <motion.div
        initial={reduce ? { opacity: 0 } : { scale: 0, rotate: -25 }}
        animate={reduce ? { opacity: 1 } : { scale: 1, rotate: 0 }}
        transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 200, damping: 14, delay: 0.1 }}
        className="relative grid size-[78%] place-items-center rounded-full bg-primary shadow-[0_0_120px_-20px_var(--primary)]"
      >
        <svg viewBox="0 0 100 100" className="size-[58%]" fill="none" aria-hidden="true">
          <motion.path
            d="M22 53 L42 72 L80 30"
            stroke="var(--primary-foreground)"
            strokeWidth={11}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.55, delay: reduce ? 0 : 0.45, ease: [0.65, 0, 0.35, 1] }}
          />
        </svg>
      </motion.div>
      {!reduce && <Sparkles />}
    </div>
  )
}

/** Faíscas que estouram do check assim que ele termina de se desenhar. */
function Sparkles() {
  const rays = Array.from({ length: 10 })
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {rays.map((_, i) => {
        const angle = (i / rays.length) * Math.PI * 2
        const dist = 150 + (i % 2) * 30
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 size-2.5 rounded-full bg-primary"
            initial={{ x: '-50%', y: '-50%', scale: 0, opacity: 1 }}
            animate={{
              x: `calc(-50% + ${Math.cos(angle) * dist}px)`,
              y: `calc(-50% + ${Math.sin(angle) * dist}px)`,
              scale: [0, 1.2, 0],
              opacity: [1, 1, 0],
            }}
            transition={{ duration: 0.9, delay: 0.95, ease: 'easeOut' }}
          />
        )
      })}
    </div>
  )
}

/** Sublinhado lima que se desenha embaixo da palavra "check". */
function Underline({ reduce }: { reduce: boolean }) {
  return (
    <svg
      viewBox="0 0 200 20"
      preserveAspectRatio="none"
      className="absolute -bottom-2 left-0 h-3 w-full sm:h-4"
      fill="none"
      aria-hidden="true"
    >
      <motion.path
        d="M3 14 C 50 4, 120 4, 197 10"
        stroke="var(--primary)"
        strokeWidth={5}
        strokeLinecap="round"
        initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.6, delay: reduce ? 0 : 1.0, ease: 'easeOut' }}
      />
    </svg>
  )
}

/** Brilho lima difuso que respira no fundo verde-profundo. */
function Glow({ reduce }: { reduce: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <motion.div
        className="absolute -left-32 -top-32 size-[520px] rounded-full bg-primary/20 blur-[120px]"
        animate={reduce ? undefined : { x: [0, 60, 0], y: [0, 40, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-40 -right-24 size-[560px] rounded-full bg-primary/10 blur-[140px]"
        animate={reduce ? undefined : { x: [0, -50, 0], y: [0, -30, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

/** Chuva de checks lima (mesma animação do "Deu check!", mais farta). */
function CheckRain() {
  const pieces = useMemo(() => {
    const colors = ['var(--primary)', 'var(--chart-2)', 'var(--deep-foreground)']
    return Array.from({ length: 46 }).map((_, i) => {
      const size = 7 + Math.random() * 9
      return {
        id: i,
        style: {
          left: `${Math.random() * 100}%`,
          width: `${size * 1.6}px`,
          height: `${size}px`,
          color: colors[i % colors.length],
          animation: `aprova-confetti-fall ${2.8 + Math.random() * 2}s ${0.4 + Math.random() * 1.2}s ease-in forwards`,
          '--confetti-x': `${(Math.random() - 0.5) * 200}px`,
          '--confetti-r': `${180 + Math.random() * 540}deg`,
        } as React.CSSProperties,
      }
    })
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <svg key={p.id} viewBox="0 0 16 10" fill="none" className="absolute top-0 opacity-0" style={p.style}>
          <path d="M2 5l4 3 8-6" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ))}
    </div>
  )
}
