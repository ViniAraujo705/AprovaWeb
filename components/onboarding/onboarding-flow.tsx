'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Briefcase,
  CalendarDays,
  Check,
  Film,
  Gift,
  HardDrive,
  Loader2,
  Lock,
  LogOut,
  MessageSquare,
  Plus,
  Send,
  Share,
  Smartphone,
  SquarePlus,
  Monitor,
  Sparkles,
  Star,
  Upload,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from '@/components/motion'
import { CheckLogo } from '@/components/page-header'
import { Celebration } from '@/components/launch-promo-celebration'
import { useAuth } from '@/components/auth-provider'
import { usePlanLimit } from '@/components/plan-limit-provider'
import { clientService, teamService, userService } from '@/lib/services'
import { ApiError } from '@/lib/api'
import { brandAccentStyle, useCheckIdentityStyle } from '@/lib/theme'
import { BRAND_SWATCHES, PLAN_TOUR, markOnboardingDone, type PlanTour } from '@/lib/onboarding'
import { planLabel, type PlanId } from '@/lib/types'
import { useInstallApp } from '@/lib/use-install-app'
import { cn } from '@/lib/utils'

type StepId = 'name' | 'brand' | 'client' | 'team' | 'how' | 'app' | 'plan'

const HEX_RE = /^#[0-9a-fA-F]{6}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EASE = [0.22, 1, 0.36, 1] as const

/** Mesmas datas de `launch-promo-celebration.tsx` (promo: conta nova já nasce no Agência). */
const PROMO_STARTS_AT = new Date('2026-11-10T00:00:00-03:00').getTime()
const PROMO_ENDS_AT = new Date('2026-12-01T00:00:00-03:00').getTime()
const PROMO_SEEN_KEY_PREFIX = 'check:promo-lancamento-visto:'

function nextPlanFor(plan: PlanId): PlanId | null {
  if (plan === 'portfolio' || plan === 'free') return 'pro'
  if (plan === 'pro') return 'agencia'
  return null
}

export function OnboardingFlow() {
  const router = useRouter()
  const { user, updateUser, logout } = useAuth()
  const { planStatus, bumpUsage, handlePlanLimitError } = usePlanLimit()
  const identity = useCheckIdentityStyle()
  const reduce = !!useReducedMotion()
  // Montado já no topo do fluxo pra não perder o convite de instalação do navegador.
  const installApp = useInstallApp()

  const plan: PlanId = planStatus?.plan ?? 'free'
  const tour = PLAN_TOUR[plan]
  const firstName = (user?.name ?? '').trim().split(/\s+/)[0]

  const inPromo = useMemo(() => {
    if (plan !== 'agencia' || !user?.createdAt) return false
    const t = new Date(user.createdAt).getTime()
    return t >= PROMO_STARTS_AT && t < PROMO_ENDS_AT
  }, [plan, user?.createdAt])

  // Free/Portfólio não têm marca própria: o passo do nome não salvaria nada,
  // então só mostra a cor (como aula, com cadeado).
  const steps: StepId[] = useMemo(
    () => (tour.whiteLabel ? ['name', 'brand', 'client', 'team', 'how', 'app', 'plan'] : ['brand', 'client', 'team', 'how', 'app', 'plan']),
    [tour.whiteLabel],
  )

  // -1 = boas-vindas; steps.length = tudo pronto.
  const [index, setIndex] = useState(-1)
  const [direction, setDirection] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Respostas
  const [agencyName, setAgencyName] = useState(user?.branding?.agencyName ?? '')
  const [color, setColor] = useState(user?.branding?.accentColor ?? '#d6f593')
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientCreated, setClientCreated] = useState<string | null>(null)
  const [emails, setEmails] = useState<string[]>([''])
  const [invited, setInvited] = useState<string[]>([])

  const step = index >= 0 && index < steps.length ? steps[index] : null

  // Trava curta contra toque duplo: sem ela, dois toques no "Continuar"
  // pulavam uma etapa inteira no celular.
  const lastGoRef = useRef(0)
  function go(delta: number) {
    const now = Date.now()
    if (now - lastGoRef.current < 400) return
    lastGoRef.current = now
    setError(null)
    setDirection(delta)
    setIndex((i) => Math.max(-1, Math.min(steps.length, i + delta)))
  }

  function finish(to: string) {
    if (user) {
      markOnboardingDone(user.id)
      try {
        // O presente do lançamento já foi contado na boas-vindas.
        localStorage.setItem(PROMO_SEEN_KEY_PREFIX + user.id, '1')
      } catch {
        // sem storage
      }
    }
    router.replace(to)
  }

  async function handleContinue() {
    if (busy) return
    setError(null)
    try {
      if (step === 'name') {
        if (!agencyName.trim()) return setError('Conta pra gente o nome da sua agência.')
        return go(1)
      }
      if (step === 'brand' && tour.whiteLabel) {
        if (!HEX_RE.test(color)) return setError('Cor inválida. Use o formato #RRGGBB.')
        setBusy(true)
        const branding = await userService.updateBranding({
          agencyName: agencyName.trim() || null,
          logoUrl: user?.branding?.logoUrl ?? null,
          accentColor: color.toLowerCase(),
        })
        updateUser({ branding })
      }
      if (step === 'client' && canAddClient && clientName.trim() && !clientCreated) {
        if (clientEmail.trim() && !EMAIL_RE.test(clientEmail.trim())) return setError('E-mail do cliente inválido.')
        setBusy(true)
        const created = await clientService.create({
          name: clientName.trim(),
          ...(clientEmail.trim() ? { email: clientEmail.trim() } : {}),
        })
        bumpUsage({ clients: 1 })
        setClientCreated(created.name)
      }
      if (step === 'team' && seatsToInvite > 0) {
        const list = emails.map((e) => e.trim()).filter(Boolean).filter((e) => !invited.includes(e))
        const bad = list.find((e) => !EMAIL_RE.test(e))
        if (bad) return setError(`“${bad}” não parece um e-mail válido.`)
        if (list.length) {
          setBusy(true)
          const sent: string[] = []
          for (const e of list) {
            await teamService.invite(e)
            sent.push(e)
          }
          setInvited((prev) => [...prev, ...sent])
        }
      }
      go(1)
    } catch (err) {
      if (handlePlanLimitError(err)) return
      setError(err instanceof ApiError ? err.message : 'Não deu pra salvar agora. Tente de novo ou pule esta etapa.')
    } finally {
      setBusy(false)
    }
  }

  const usedClients = planStatus?.usage.clients ?? 0
  const canAddClient = tour.maxClients === null || usedClients < tour.maxClients
  const seatsToInvite = Math.max(0, tour.maxTeamMembers - 1 - invited.length)

  // Enter avança (fora de textarea), como num formulário.
  const continueRef = useRef(handleContinue)
  continueRef.current = handleContinue
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing) return
      if (index === -1) return go(1)
      if (index >= 0 && index < steps.length) {
        e.preventDefault()
        void continueRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, steps.length])

  // Só entrada, sem `blur` e sem esperar a saída da etapa anterior: com
  // `AnimatePresence mode="wait"` a próxima etapa só montava depois que a
  // animação de saída terminasse — em alguns Android ela não terminava e a
  // tela ficava vazia (progresso avançado, conteúdo em branco).
  const enterFrom = reduce ? { opacity: 0 } : { opacity: 0, y: direction > 0 ? 16 : -16 }

  const footerHint: Record<StepId, string> = {
    name: 'Você poderá mudar o nome quando quiser.',
    brand: tour.whiteLabel ? 'Dá pra trocar a cor e enviar seu logo depois, em Configurações.' : 'Você pode liberar sua marca quando quiser.',
    client: 'Não se preocupe, você poderá cadastrar e editar clientes depois.',
    team: 'Convites podem ser enviados a qualquer momento em Equipe.',
    how: 'Seu projeto de exemplo já está pronto pra você testar.',
    app: 'Não ocupa espaço como app de loja e atualiza sozinho.',
    plan: 'Você pode trocar de plano quando quiser.',
  }

  const continueLabel =
    step === 'client' && canAddClient && clientName.trim() && !clientCreated
      ? 'Cadastrar e continuar'
      : step === 'team' && seatsToInvite > 0 && emails.some((e) => e.trim())
        ? 'Enviar convites'
        : step === 'plan'
          ? 'Concluir'
          : 'Continuar'

  // Promo de lançamento: fecha o tutorial com a celebração grande (chuva de
  // checks), em tela cheia — fora do container animado, que tem transform e
  // prenderia o `position: fixed` dela.
  if (index === steps.length && inPromo) {
    return <Celebration firstName={firstName} onClose={() => finish('/dashboard')} />
  }

  return (
    <div style={identity} className="relative flex min-h-dvh flex-col overflow-hidden bg-background text-foreground">
      <AmbientGlow reduce={reduce} />

      {/* Topo: voltar + logo + progresso segmentado */}
      <header className="relative z-10 mx-auto grid w-full max-w-5xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 pt-6 sm:px-8">
        <div className="flex items-center gap-3">
          {index >= 0 && index < steps.length && (
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Voltar"
              className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <ArrowLeft className="size-5" />
            </button>
          )}
          {index >= 0 && <CheckLogo className="hidden h-6 w-[98px] sm:inline-block" priority />}
        </div>
        <ProgressSegments total={steps.length} current={index} />
        <div className="flex justify-end">
          {index < steps.length ? (
            <button
              type="button"
              onClick={() => (index === -1 ? logout() : finish('/dashboard'))}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {index === -1 ? (
                <>
                  <LogOut className="size-3.5" /> Sair
                </>
              ) : (
                <>
                  Pular<span className="hidden sm:inline"> tutorial</span>
                </>
              )}
            </button>
          ) : null}
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col">
        <motion.section
            key={index}
            initial={enterFrom}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0.15 : 0.25, ease: EASE }}
            className="flex flex-1 flex-col"
          >
            {index === -1 && <WelcomeStep firstName={firstName} plan={plan} inPromo={inPromo} onStart={() => go(1)} reduce={reduce} />}

            {step && (
              <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-6 pt-10 sm:px-8 sm:pt-14">
                <div className="flex-1">
                  {step === 'name' && <NameStep value={agencyName} onChange={setAgencyName} />}
                  {step === 'brand' && (
                    <BrandStep
                      color={color}
                      onColor={setColor}
                      agencyName={agencyName || user?.branding?.agencyName || user?.name || ''}
                      logoUrl={user?.branding?.logoUrl ?? null}
                      locked={!tour.whiteLabel}
                      onUpgrade={() => finish('/planos')}
                    />
                  )}
                  {step === 'client' && (
                    <ClientStep
                      plan={plan}
                      tour={tour}
                      used={usedClients}
                      canAdd={canAddClient}
                      name={clientName}
                      email={clientEmail}
                      onName={setClientName}
                      onEmail={setClientEmail}
                      created={clientCreated}
                    />
                  )}
                  {step === 'team' && (
                    <TeamStep
                      plan={plan}
                      tour={tour}
                      ownerName={firstName || 'Você'}
                      emails={emails}
                      onEmails={setEmails}
                      invited={invited}
                      seatsLeft={seatsToInvite}
                    />
                  )}
                  {step === 'how' && <HowStep reduce={reduce} />}
                  {step === 'app' && <AppStep {...installApp} reduce={reduce} />}
                  {step === 'plan' && <PlanStep plan={plan} tour={tour} inPromo={inPromo} reduce={reduce} />}
                </div>

                <div className="sticky bottom-0 mt-8 flex flex-col items-center gap-2 bg-gradient-to-t from-background via-background to-transparent pb-2 pt-6">
                  {error && (
                    <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} role="alert" className="text-sm text-danger-ink">
                      {error}
                    </motion.p>
                  )}
                  <CtaButton onClick={handleContinue} busy={busy} reduce={reduce}>
                    {continueLabel}
                  </CtaButton>
                  <p className="text-center text-xs text-muted-foreground">{footerHint[step]}</p>
                </div>
              </div>
            )}

            {index === steps.length && !inPromo && (
              <DoneStep
                firstName={firstName}
                reduce={reduce}
                canUpload={tour.maxVideosPerMonth !== 0}
                onUpload={() => finish('/upload')}
                onDashboard={() => finish('/dashboard')}
              />
            )}
          </motion.section>
      </main>
    </div>
  )
}

/* ------------------------------- peças comuns ------------------------------ */

function ProgressSegments({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={current >= 0 ? `Etapa ${Math.min(current + 1, total)} de ${total}` : undefined}>
      {Array.from({ length: total }).map((_, i) => {
        const fill = current > i ? 1 : current === i ? 0.5 : 0
        return (
          <span key={i} className="relative h-1.5 w-6 overflow-hidden rounded-full bg-primary-ink/15 sm:w-8">
            <motion.span
              className="absolute inset-y-0 left-0 rounded-full bg-primary-ink"
              initial={false}
              animate={{ width: `${fill * 100}%` }}
              transition={{ duration: 0.5, ease: EASE }}
            />
          </span>
        )
      })}
    </div>
  )
}

function StepTitle({ title, subtitle }: { title: React.ReactNode; subtitle?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <motion.h1
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="font-display text-3xl font-extrabold leading-[1.08] tracking-tight text-balance sm:text-5xl"
      >
        {title}
      </motion.h1>
      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE, delay: 0.06 }}
          className="mx-auto mt-3 max-w-md text-base text-muted-foreground text-balance"
        >
          {subtitle}
        </motion.p>
      )}
    </div>
  )
}

/** Entra depois do título, como no vídeo de referência. */
function Reveal({ children, delay = 0.12, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

function CtaButton({
  children,
  onClick,
  busy,
  reduce,
}: {
  children: React.ReactNode
  onClick: () => void
  busy?: boolean
  reduce: boolean
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={busy}
      whileHover={reduce || busy ? undefined : { scale: 1.03 }}
      whileTap={reduce || busy ? undefined : { scale: 0.97 }}
      className="group inline-flex min-h-12 min-w-44 touch-manipulation select-none items-center justify-center gap-2 rounded-full bg-primary px-7 font-display text-base font-bold text-primary-foreground shadow-[0_10px_30px_-12px_var(--primary-ink)] transition-shadow hover:shadow-[0_14px_36px_-10px_var(--primary-ink)] disabled:opacity-70"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
      {!busy && <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />}
    </motion.button>
  )
}

function LockedNote({ children, cta, onClick }: { children: React.ReactNode; cta?: string; onClick?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
        <Lock className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 text-muted-foreground">
        {children}
        {cta && onClick && (
          <button type="button" onClick={onClick} className="ml-1 font-semibold text-primary-ink underline-offset-2 hover:underline">
            {cta}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Brilho de fundo. Gradiente radial estático de propósito: as manchas com
 * `blur` grande se mexendo sem parar eram redesenhadas a cada frame no Safari
 * do iPhone e deixavam a tela toda lenta (toques "não pegavam").
 */
function AmbientGlow(_: { reduce: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
      style={{
        backgroundImage:
          'radial-gradient(480px circle at 0% 0%, color-mix(in oklab, var(--primary) 22%, transparent), transparent 70%), radial-gradient(520px circle at 100% 100%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 70%)',
      }}
    />
  )
}

function useCountUp(target: number, run: boolean, duration = 900) {
  const [value, setValue] = useState(run ? 0 : target)
  useEffect(() => {
    if (!run) {
      setValue(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, run, duration])
  return value
}

/* --------------------------------- etapas --------------------------------- */

function WelcomeStep({
  firstName,
  plan,
  inPromo,
  onStart,
  reduce,
}: {
  firstName: string
  plan: PlanId
  inPromo: boolean
  onStart: () => void
  reduce: boolean
}) {
  const words = ['Boas-vindas,']
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 pb-12 pt-4 text-center">
      <WelcomeHero reduce={reduce} />

      <h1 className="mt-6 font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:mt-8 sm:text-7xl">
        {words.map((w, i) => (
          <motion.span
            key={w}
            className="inline-block"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40, rotate: -4 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.45 + i * 0.1 }}
          >
            {firstName ? w : 'Boas-vindas!'}
          </motion.span>
        ))}{' '}
        {firstName && (
          <motion.span
            className="relative inline-block whitespace-nowrap"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40, rotate: 4 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.55 }}
          >
            {/* marca-texto lima que passa por trás do nome */}
            <motion.span
              aria-hidden="true"
              className="absolute inset-x-[-0.12em] bottom-[0.08em] -z-10 h-[0.42em] origin-left rounded-full bg-primary"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.55, delay: reduce ? 0 : 0.8, ease: EASE }}
            />
            {firstName}!
          </motion.span>
        )}
      </h1>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE, delay: reduce ? 0.1 : 0.6 }}
        className="mt-4 max-w-lg text-lg text-muted-foreground text-balance"
      >
        Que bom ter você no Check. Em menos de 2 minutos a gente deixa tudo pronto pro seu primeiro check.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: EASE, delay: reduce ? 0.15 : 0.7 }}
        className="mt-5"
      >
        {inPromo ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground">
            <Gift className="size-4" />
            <span>
              Presente de lançamento<span className="hidden sm:inline">: sua conta já nasceu no plano Agência</span>
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium">
            <Sparkles className="size-4 text-primary-ink" /> Seu plano: <strong>{planLabel[plan]}</strong>
          </span>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE, delay: reduce ? 0.2 : 0.8 }}
        className="mt-9 flex flex-col items-center gap-3"
      >
        <div className="relative isolate">
          <CtaButton onClick={onStart} reduce={reduce}>
            Vamos começar
          </CtaButton>
        </div>
        <p className="text-xs text-muted-foreground">Fique tranquilo, você poderá alterar tudo isso a qualquer momento.</p>
      </motion.div>
    </div>
  )
}

/**
 * Ícone do Check que cai quicando e desenha o check, com pedacinhos do produto
 * (vídeo, comentário no tempo, estrelas, aprovado, equipe) flutuando em volta
 * e faíscas quando o traço termina.
 */
function WelcomeHero({ reduce }: { reduce: boolean }) {
  const chips: { x: number; y: number; delay: number; className?: string; node: React.ReactNode }[] = [
    {
      x: -104,
      y: -46,
      delay: 0.3,
      node: (
        <span className="flex items-center gap-1.5">
          <span className="grid size-5 place-items-center rounded-md bg-deep text-deep-foreground">
            <Film className="size-3" />
          </span>
          Reel v2
        </span>
      ),
    },
    {
      x: 112,
      y: -58,
      delay: 0.4,
      node: (
        <span className="flex items-center gap-1.5">
          <span className="rounded bg-warning-soft px-1 font-mono text-[10px] font-bold text-warning-ink">00:12</span>
          Amei essa parte!
        </span>
      ),
    },
    {
      x: -118,
      y: 34,
      delay: 0.5,
      className: 'hidden sm:flex',
      node: (
        <span className="flex items-center gap-0.5 text-amber-400">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="size-3.5 fill-current" />
          ))}
        </span>
      ),
    },
    {
      x: 100,
      y: 30,
      delay: 0.6,
      node: (
        <span className="flex items-center gap-1.5">
          <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-3" strokeWidth={3} />
          </span>
          Aprovado
        </span>
      ),
    },
    {
      x: 8,
      y: -98,
      delay: 0.7,
      className: 'hidden sm:flex',
      node: (
        <span className="flex items-center -space-x-1.5">
          {['#7ea67c', '#253326', '#d6f593'].map((c, i) => (
            <span key={c} className="size-5 rounded-full border-2 border-card" style={{ backgroundColor: c, zIndex: 3 - i }} />
          ))}
          <span className="pl-3">Equipe</span>
        </span>
      ),
    },
  ]

  return (
    <div className="relative grid size-24 place-items-center [--sx:1] sm:size-32 sm:[--sx:1.55]">
      {/* halo que respira atrás do ícone */}
      {!reduce && (
        <motion.span
          aria-hidden="true"
          className="absolute inset-[-40%] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--primary)_55%,transparent),transparent)]"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: [0, 0.9, 0.6], scale: [0.6, 1.1, 1] }}
          transition={{ duration: 1, delay: 0.1 }}
        />
      )}

      {/* ondas que saem quando o check se desenha */}
      {!reduce &&
        [0, 1].map((i) => (
          <motion.span
            key={i}
            aria-hidden="true"
            className="absolute inset-0 rounded-[30%] border-2 border-primary-ink/30"
            initial={{ scale: 1, opacity: 0 }}
            animate={{ scale: [1, 1.9], opacity: [0.6, 0] }}
            transition={{ duration: 1.4, delay: 0.5 + i * 0.2, ease: 'easeOut' }}
          />
        ))}

      {/* o ícone */}
      <motion.div
        className="relative grid size-full place-items-center rounded-[30%] bg-deep shadow-[0_24px_60px_-18px_rgba(37,51,38,0.7)]"
        initial={reduce ? { opacity: 0 } : { y: -160, scale: 0.4, rotate: -30, opacity: 0 }}
        animate={{ y: 0, scale: 1, rotate: 0, opacity: 1 }}
        transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 180, damping: 11, mass: 0.9 }}
      >
        <div className="grid size-[68%] place-items-center rounded-[26%] bg-primary">
          <svg viewBox="0 0 100 100" className="size-[78%]" fill="none" aria-hidden="true">
            <motion.path
              d="M18 54 L40 75 L84 26"
              stroke="var(--deep)"
              strokeWidth={13}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: reduce ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: reduce ? 0 : 0.3, ease: [0.65, 0, 0.35, 1] }}
            />
          </svg>
        </div>
      </motion.div>

      {/* faíscas */}
      {!reduce && (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * Math.PI * 2
            const dist = 92 + (i % 3) * 18
            return (
              <motion.span
                key={i}
                className={cn('absolute left-1/2 top-1/2 rounded-full', i % 2 ? 'size-2 bg-primary-ink' : 'size-2.5 bg-primary')}
                initial={{ x: '-50%', y: '-50%', scale: 0, opacity: 1 }}
                animate={{
                  x: `calc(-50% + ${Math.cos(angle) * dist}px)`,
                  y: `calc(-50% + ${Math.sin(angle) * dist}px)`,
                  scale: [0, 1.3, 0],
                  opacity: [1, 1, 0],
                }}
                transition={{ duration: 0.7, delay: 0.55, ease: 'easeOut' }}
              />
            )
          })}
        </div>
      )}

      {/* pedacinhos do produto flutuando em volta */}
      {chips.map((c, i) => (
        <motion.div
          key={i}
          aria-hidden="true"
          className={cn(
            'absolute left-1/2 top-1/2 flex whitespace-nowrap rounded-full border border-border bg-card px-2.5 py-1.5 text-[11px] font-semibold text-foreground shadow-[0_10px_30px_-12px_rgba(37,51,38,0.45)]',
            c.className,
          )}
          style={{ x: `calc(-50% + var(--sx) * ${c.x}px)`, y: `calc(-50% + var(--sx) * ${c.y}px)` }}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.3 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18, delay: reduce ? 0.1 : c.delay }}
        >
          <span className="flex">{c.node}</span>
        </motion.div>
      ))}
    </div>
  )
}

function NameStep({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <StepTitle
        title="Vamos deixar o Check com a sua cara?"
        subtitle="Primeiro, como sua agência se chama? O nome aparece pro seu cliente na tela de aprovação."
      />
      <Reveal className="mx-auto mt-10 w-full max-w-sm">
        <label className="flex flex-col gap-1.5 text-left">
          <span className="text-xs font-medium text-muted-foreground">Nome da agência</span>
          <input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            maxLength={60}
            placeholder="Ex.: Estúdio Norte"
            className="min-h-12 w-full rounded-xl border border-border bg-card px-4 text-base outline-none transition-colors placeholder:text-muted-foreground focus:border-primary-ink"
          />
        </label>
      </Reveal>
    </>
  )
}

function BrandStep({
  color,
  onColor,
  agencyName,
  logoUrl,
  locked,
  onUpgrade,
}: {
  color: string
  onColor: (c: string) => void
  agencyName: string
  logoUrl: string | null
  locked: boolean
  onUpgrade: () => void
}) {
  const valid = HEX_RE.test(color)
  return (
    <>
      <StepTitle
        title="Qual é a cor da sua marca?"
        subtitle={
          locked
            ? 'No Check, o seu cliente aprova numa tela com a cara da sua agência. Olha como fica:'
            : 'Ela aparece nos botões e destaques da tela que o seu cliente vê.'
        }
      />
      <div className="mx-auto mt-10 grid w-full max-w-3xl items-center gap-10 md:grid-cols-2">
        <Reveal delay={0.12} className="flex flex-col items-center gap-5">
          <div className={cn('grid grid-cols-6 gap-3', locked && 'pointer-events-none opacity-50')}>
            {BRAND_SWATCHES.map((c, i) => {
              const active = c.toLowerCase() === color.toLowerCase()
              return (
                <motion.button
                  key={c}
                  type="button"
                  onClick={() => onColor(c)}
                  aria-label={`Cor ${c}`}
                  aria-pressed={active}
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.35 + i * 0.03, type: 'spring', stiffness: 380, damping: 22 }}
                  whileHover={{ scale: 1.12 }}
                  className={cn(
                    'relative size-10 rounded-full ring-offset-2 ring-offset-background transition-shadow',
                    active ? 'ring-2 ring-foreground' : 'ring-1 ring-border',
                  )}
                  style={{ backgroundColor: c }}
                >
                  {active && (
                    <motion.span layoutId="swatch-check" className="absolute inset-0 grid place-items-center">
                      <Check className="size-4 text-white mix-blend-difference" strokeWidth={3} />
                    </motion.span>
                  )}
                </motion.button>
              )
            })}
          </div>
          <label className={cn('inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-xs', locked && 'opacity-50')}>
            <input
              type="color"
              value={valid ? color : '#d6f593'}
              onChange={(e) => onColor(e.target.value)}
              disabled={locked}
              aria-label="Outra cor"
              className="size-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
            />
            <span className="text-muted-foreground">Outra cor</span>
            <input
              value={color}
              onChange={(e) => onColor(e.target.value)}
              disabled={locked}
              maxLength={7}
              className="w-[4.5rem] bg-transparent font-mono font-semibold uppercase outline-none"
            />
          </label>
          {locked && (
            <LockedNote cta="Conhecer o Pro" onClick={onUpgrade}>
              Sua marca (nome, logo e cor) na tela do cliente é dos planos <strong className="text-foreground">Pro</strong> e{' '}
              <strong className="text-foreground">Agência</strong>. No Free, a tela leva a marca do Check.
            </LockedNote>
          )}
        </Reveal>

        <Reveal delay={0.18}>
          <ClientScreenPreview color={valid ? color : null} agencyName={agencyName} logoUrl={logoUrl} />
        </Reveal>
      </div>
    </>
  )
}

/** Celular com a tela de aprovação do cliente, pintando ao vivo com a cor escolhida. */
function ClientScreenPreview({ color, agencyName, logoUrl }: { color: string | null; agencyName: string; logoUrl: string | null }) {
  return (
    <div className="mx-auto w-[240px] rounded-[34px] border-[6px] border-foreground/85 bg-foreground/85 shadow-2xl">
      <motion.div
        className="theme-light overflow-hidden rounded-[28px] bg-background text-foreground"
        style={brandAccentStyle(color, { dark: false })}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-5 max-w-24 object-contain" />
          ) : (
            <span className="truncate font-display text-sm font-bold">{agencyName || 'Sua agência'}</span>
          )}
          <span className="size-5 rounded-full bg-primary transition-colors duration-500" />
        </div>
        <div className="p-3">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-[linear-gradient(135deg,#3a3f3c,#151816)]">
            <div className="absolute inset-x-2 bottom-2 h-1 rounded-full bg-white/25">
              <motion.div
                className="h-full w-full origin-left rounded-full bg-primary transition-colors duration-500"
                animate={{ scaleX: [0.1, 0.85, 0.1] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          </div>
          <p className="mt-2 font-display text-xs font-bold">Reel de lançamento · v2</p>
          <p className="text-[10px] text-muted-foreground">Enviado hoje para sua aprovação</p>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <span className="inline-flex h-8 items-center justify-center rounded-lg border border-border text-[10px] font-semibold">Pedir ajuste</span>
            <span className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-primary text-[10px] font-semibold text-primary-foreground transition-colors duration-500">
              <Check className="size-3" /> Aprovar
            </span>
          </div>
          <p className="mt-2 text-center text-[10px] font-medium text-primary-ink">Ver comentários (3)</p>
        </div>
      </motion.div>
    </div>
  )
}

function SeatDots({ total, used, icon: Icon }: { total: number; used: number; icon: typeof Users }) {
  const shown = Math.min(total, 10)
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {Array.from({ length: shown }).map((_, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 + i * 0.04, type: 'spring', stiffness: 400, damping: 22 }}
          className={cn(
            'grid size-7 place-items-center rounded-full',
            i < used ? 'bg-primary text-primary-foreground' : 'border border-dashed border-border text-muted-foreground/60',
          )}
        >
          <Icon className="size-3.5" />
        </motion.span>
      ))}
      {total > shown && <span className="text-xs font-semibold text-muted-foreground">+{total - shown}</span>}
    </div>
  )
}

function ClientStep({
  plan,
  tour,
  used,
  canAdd,
  name,
  email,
  onName,
  onEmail,
  created,
}: {
  plan: PlanId
  tour: PlanTour
  used: number
  canAdd: boolean
  name: string
  email: string
  onName: (v: string) => void
  onEmail: (v: string) => void
  created: string | null
}) {
  const max = tour.maxClients
  return (
    <>
      <StepTitle
        title="Quem é o seu primeiro cliente?"
        subtitle={
          max === null
            ? 'Cada cliente tem os próprios projetos, vídeos e área de aprovação.'
            : `No plano ${planLabel[plan]} você tem até ${max} ${max === 1 ? 'cliente ativo' : 'clientes ativos'}. Cada um com os próprios projetos e área de aprovação.`
        }
      />
      <Reveal className="mx-auto mt-8 flex w-full max-w-sm flex-col gap-5">
        {max !== null && max > 0 && (
          <div className="flex flex-col items-center gap-2">
            <SeatDots total={max} used={used + (created ? 1 : 0)} icon={Check} />
            <p className="text-xs text-muted-foreground">
              {used + (created ? 1 : 0)} de {max} em uso
              {used > 0 && ' · inclui o cliente de exemplo'}
            </p>
          </div>
        )}

        {created ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
          >
            <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-4" strokeWidth={3} />
            </span>
            <div className="text-left">
              <p className="font-semibold">{created}</p>
              <p className="text-xs text-muted-foreground">Cliente cadastrado. Partiu!</p>
            </div>
          </motion.div>
        ) : canAdd ? (
          <div className="flex flex-col gap-3 text-left">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Nome do cliente</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => onName(e.target.value)}
                placeholder="Ex.: Padaria Bom Dia"
                className="min-h-12 rounded-xl border border-border bg-card px-4 outline-none placeholder:text-muted-foreground focus:border-primary-ink"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">E-mail (opcional)</span>
              <input
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => onEmail(e.target.value)}
                placeholder="contato@cliente.com"
                className="min-h-12 rounded-xl border border-border bg-card px-4 outline-none placeholder:text-muted-foreground focus:border-primary-ink"
              />
            </label>
            <p className="text-center text-xs text-muted-foreground">Deixe em branco e clique em Continuar se quiser fazer isso depois.</p>
          </div>
        ) : (
          <LockedNote>
            Já deixamos um <strong className="text-foreground">cliente de exemplo</strong> com projeto e vídeo pra você explorar — ele ocupa a
            vaga do {planLabel[plan]}. Quando for cadastrar o seu, é só excluir o exemplo em Clientes
            {nextPlanFor(plan) ? ` ou passar pro ${planLabel[nextPlanFor(plan)!]} (até ${PLAN_TOUR[nextPlanFor(plan)!].maxClients} clientes).` : '.'}
          </LockedNote>
        )}
      </Reveal>
    </>
  )
}

function TeamStep({
  plan,
  tour,
  ownerName,
  emails,
  onEmails,
  invited,
  seatsLeft,
}: {
  plan: PlanId
  tour: PlanTour
  ownerName: string
  emails: string[]
  onEmails: (v: string[]) => void
  invited: string[]
  seatsLeft: number
}) {
  const max = tour.maxTeamMembers
  const next = nextPlanFor(plan)
  const solo = max <= 1
  return (
    <>
      <StepTitle
        title={solo ? 'Por enquanto, é você no comando' : 'Quem trabalha com você?'}
        subtitle={
          solo
            ? `O plano ${planLabel[plan]} é individual. Editores entram a partir do Pro.`
            : `No plano ${planLabel[plan]} cabem até ${max} pessoas na equipe, contando com você. Editores sobem vídeos e comentam internamente.`
        }
      />
      <Reveal className="mx-auto mt-8 flex w-full max-w-sm flex-col gap-5">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <TeamAvatar label={ownerName} filled you />
          {invited.map((e) => (
            <TeamAvatar key={e} label={e} filled />
          ))}
          {Array.from({ length: Math.min(Math.max(0, max - 1 - invited.length), 7) }).map((_, i) => (
            <TeamAvatar key={`empty-${i}`} label="" />
          ))}
        </div>

        {solo ? (
          next && (
            <LockedNote>
              Precisa de editor? No <strong className="text-foreground">{planLabel[next]}</strong> são até {PLAN_TOUR[next].maxTeamMembers} pessoas
              trabalhando junto.
            </LockedNote>
          )
        ) : seatsLeft > 0 ? (
          <div className="flex flex-col gap-2 text-left">
            <span className="text-xs font-medium text-muted-foreground">Convidar por e-mail (opcional)</span>
            <AnimatePresence initial={false}>
              {emails.map((value, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="relative"
                >
                  <input
                    type="email"
                    inputMode="email"
                    autoFocus={i === 0}
                    value={value}
                    onChange={(e) => onEmails(emails.map((v, j) => (j === i ? e.target.value : v)))}
                    placeholder="editor@suaagencia.com"
                    className="min-h-12 w-full rounded-xl border border-border bg-card px-4 pr-10 outline-none placeholder:text-muted-foreground focus:border-primary-ink"
                  />
                  {emails.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onEmails(emails.filter((_, j) => j !== i))}
                      aria-label="Remover"
                      className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            {emails.length < seatsLeft && (
              <button
                type="button"
                onClick={() => onEmails([...emails, ''])}
                className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary-ink/40 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary/10"
              >
                <Plus className="size-4" /> Adicionar pessoa
              </button>
            )}
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Convites enviados! Todas as vagas do {planLabel[plan]} estão preenchidas.
          </p>
        )}
      </Reveal>
    </>
  )
}

function TeamAvatar({ label, filled, you }: { label: string; filled?: boolean; you?: boolean }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex w-16 flex-col items-center gap-1"
    >
      <span
        className={cn(
          'grid size-12 place-items-center rounded-full text-sm font-bold uppercase',
          filled ? 'bg-primary text-primary-foreground' : 'border-2 border-dashed border-border text-muted-foreground/50',
        )}
      >
        {filled ? (label.trim()[0] ?? '?') : <Plus className="size-4" />}
      </span>
      <span className="w-full truncate text-center text-[10px] text-muted-foreground">{you ? 'Você' : filled ? label.split('@')[0] : 'Vaga'}</span>
    </motion.div>
  )
}

/** Aula animada: o vídeo toca, o cliente comenta no segundo exato e dá o check. */
function HowStep({ reduce }: { reduce: boolean }) {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    if (reduce) {
      setPhase(2)
      return
    }
    const id = setInterval(() => setPhase((p) => (p + 1) % 3), 2600)
    return () => clearInterval(id)
  }, [reduce])

  const stages = [
    { icon: Upload, title: 'Você envia o vídeo', text: 'Sobe o arquivo e o Check gera um link de aprovação.' },
    { icon: MessageSquare, title: 'O cliente comenta no segundo exato', text: 'Nada de “lá pelo meio do vídeo”: cada ajuste fica marcado no tempo.' },
    { icon: Check, title: 'Deu check!', text: 'Ele aprova com um toque e você é avisado na hora.' },
  ]

  return (
    <>
      <StepTitle title="Como o Check funciona" subtitle="Três passos entre o envio e a aprovação. Sem e-mail perdido, sem áudio de 5 minutos." />
      <div className="mx-auto mt-10 grid w-full max-w-4xl items-center gap-8 md:grid-cols-[1.1fr_1fr]">
        <Reveal delay={0.3}>
          <div className="relative mx-auto aspect-video w-full max-w-md overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#3a3f3c,#151816)] shadow-xl">
            <div className="absolute inset-0 grid place-items-center">
              <Film className="size-10 text-white/20" />
            </div>
            {/* timeline */}
            <div className="absolute inset-x-4 bottom-4 h-1.5 rounded-full bg-white/20">
              <motion.div
                className="h-full rounded-full bg-primary"
                animate={{ width: phase === 0 ? '18%' : phase === 1 ? '46%' : '100%' }}
                transition={{ duration: 1.2, ease: EASE }}
              />
              <AnimatePresence>
                {phase >= 1 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-white bg-warning"
                    style={{ left: 'calc(46% - 6px)' }}
                  />
                )}
              </AnimatePresence>
            </div>
            <AnimatePresence mode="wait">
              {phase === 0 && (
                <motion.div
                  key="up"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[#253326]"
                >
                  <Send className="size-3.5" /> Link enviado ao cliente
                </motion.div>
              )}
              {phase === 1 && (
                <motion.div
                  key="comment"
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute bottom-10 max-w-[70%] rounded-xl rounded-bl-sm bg-white px-3 py-2 text-xs text-[#253326] shadow-lg"
                  style={{ left: 'calc(46% - 12px)' }}
                >
                  <span className="mr-1 rounded bg-warning-soft px-1 font-mono font-semibold text-warning-ink">00:12</span>
                  Troca essa trilha por algo mais animado?
                </motion.div>
              )}
              {phase === 2 && (
                <motion.div
                  key="ok"
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 16 }}
                  className="absolute inset-0 grid place-items-center"
                >
                  <span className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-display text-lg font-extrabold text-primary-foreground shadow-[0_0_60px_-10px_var(--primary)]">
                    <Check className="size-5" strokeWidth={3} /> Deu check!
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Reveal>

        <ol className="flex flex-col gap-2">
          {stages.map((s, i) => (
            <motion.li
              key={s.title}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.1, duration: 0.4, ease: EASE }}
              onClick={() => setPhase(i)}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition-colors',
                phase === i ? 'border-primary-ink/40 bg-card shadow-sm' : 'border-transparent opacity-60 hover:opacity-100',
              )}
            >
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-full transition-colors',
                  phase === i ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground',
                )}
              >
                <s.icon className="size-4" />
              </span>
              <div>
                <p className="font-semibold">{s.title}</p>
                <p className="text-sm text-muted-foreground">{s.text}</p>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </>
  )
}

/** "Coloque o Check na tela inicial": um toque no Android/Chrome, passo a passo no iPhone. */
function AppStep({
  platform,
  installed,
  isMobile,
  install,
  reduce,
}: ReturnType<typeof useInstallApp> & { reduce: boolean }) {
  const [busy, setBusy] = useState(false)
  return (
    <>
      <StepTitle
        title={installed ? 'O Check já está na sua tela inicial' : 'Coloque o Check na sua tela inicial'}
        subtitle={
          installed
            ? 'Pronto! É só tocar no ícone pra abrir, como um aplicativo.'
            : 'Abre como aplicativo, em tela cheia, sem baixar nada na loja. Fica a um toque de distância quando o cliente aprovar.'
        }
      />
      <div className="mx-auto mt-10 grid w-full max-w-3xl items-center gap-10 md:grid-cols-2">
        <Reveal delay={0.3}>
          <HomeScreenMock installed={installed} reduce={reduce} />
        </Reveal>

        <Reveal delay={0.45} className="flex flex-col items-center gap-4 md:items-start">
          {installed ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              <Check className="size-4" strokeWidth={3} /> Instalado
            </span>
          ) : platform === 'prompt' ? (
            <>
              <motion.button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await install()
                  } finally {
                    setBusy(false)
                  }
                }}
                whileHover={reduce ? undefined : { scale: 1.03 }}
                whileTap={reduce ? undefined : { scale: 0.97 }}
                className="inline-flex min-h-14 items-center gap-2.5 rounded-2xl bg-deep px-6 font-display text-base font-bold text-deep-foreground shadow-lg"
              >
                {busy ? <Loader2 className="size-5 animate-spin" /> : <Smartphone className="size-5" />}
                {isMobile ? 'Adicionar à tela inicial' : 'Instalar o Check'}
              </motion.button>
              <p className="text-center text-xs text-muted-foreground md:text-left">
                Um toque e pronto. O navegador vai pedir sua confirmação.
              </p>
            </>
          ) : platform === 'ios' ? (
            <ol className="flex w-full flex-col gap-2">
              {[
                { icon: Share, text: 'Toque em Compartilhar, na barra do Safari' },
                { icon: SquarePlus, text: 'Escolha “Adicionar à Tela de Início”' },
                { icon: Check, text: 'Toque em “Adicionar”. Pronto!' },
              ].map((s, i) => (
                <motion.li
                  key={s.text}
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.12 }}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                    <s.icon className="size-4" />
                  </span>
                  <span>
                    <strong className="mr-1 font-display">{i + 1}.</strong>
                    {s.text}
                  </span>
                </motion.li>
              ))}
            </ol>
          ) : (
            <div className="flex w-full flex-col gap-2 text-sm">
              <div className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Smartphone className="size-4" />
                </span>
                <span className="text-muted-foreground">
                  <strong className="text-foreground">No celular:</strong> abra <strong className="text-foreground">checkprod.com.br</strong>,
                  entre na sua conta e toque em “Adicionar à tela inicial” no menu do navegador.
                </span>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
                  <Monitor className="size-4" />
                </span>
                <span className="text-muted-foreground">
                  <strong className="text-foreground">No computador:</strong> no Chrome ou Edge, clique no ícone de instalar na barra de
                  endereço.
                </span>
              </div>
            </div>
          )}
        </Reveal>
      </div>
    </>
  )
}

/** Tela inicial de celular onde o ícone do Check "cai" no lugar. */
function HomeScreenMock({ reduce }: { installed: boolean; reduce: boolean }) {
  const [drop, setDrop] = useState(false)
  useEffect(() => {
    if (reduce) {
      setDrop(true)
      return
    }
    const t = setTimeout(() => setDrop(true), 700)
    return () => clearTimeout(t)
  }, [reduce])
  const filler = ['#7ea67c', '#a9b3a5', '#c8d8be', '#54654e', '#d5d8cf', '#7ea67c', '#a9b3a5']
  return (
    <div className="mx-auto w-[220px] rounded-[34px] border-[6px] border-foreground/85 bg-[linear-gradient(160deg,#2b372b,#17201a)] p-4 pt-8 shadow-2xl">
      <div className="grid grid-cols-4 gap-3">
        {filler.map((c, i) => (
          <span key={i} className="aspect-square rounded-[10px] opacity-60" style={{ backgroundColor: c }} />
        ))}
        <div className="flex flex-col items-center gap-1">
          <motion.span
            className="relative block aspect-square w-full overflow-hidden rounded-[10px] shadow-[0_0_24px_-4px_#d6f593]"
            initial={reduce ? { opacity: 0 } : { y: -90, scale: 1.6, opacity: 0 }}
            animate={drop ? { y: 0, scale: 1, opacity: 1 } : undefined}
            transition={{ type: 'spring', stiffness: 260, damping: 15 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-check.png" alt="" className="size-full" />
          </motion.span>
          <span className="text-[9px] font-medium text-[#ebece7]">Check</span>
        </div>
      </div>
      <div className="mt-24 flex justify-center gap-3 rounded-2xl bg-white/10 p-2">
        {['#7ea67c', '#c8d8be', '#a9b3a5', '#54654e'].map((c) => (
          <span key={c} className="size-8 rounded-[9px] opacity-70" style={{ backgroundColor: c }} />
        ))}
      </div>
    </div>
  )
}

function PlanStep({ plan, tour, inPromo, reduce }: { plan: PlanId; tour: PlanTour; inPromo: boolean; reduce: boolean }) {
  const next = nextPlanFor(plan)
  const meters = [
    { icon: Briefcase, label: 'Clientes ativos', value: tour.maxClients, suffix: '' },
    { icon: Film, label: 'Vídeos/arquivos por mês', value: tour.maxVideosPerMonth, suffix: '' },
    { icon: Users, label: 'Pessoas na equipe', value: tour.maxTeamMembers, suffix: '' },
    { icon: HardDrive, label: 'Armazenamento', value: tour.storageGb, suffix: ' GB' },
  ]
  const features: { label: string; on: boolean; icon: typeof Users }[] = [
    { label: 'Aprovação e pedidos de ajuste pelo cliente', on: tour.maxVideosPerMonth !== 0, icon: Check },
    { label: 'Sua marca na tela do cliente', on: tour.whiteLabel, icon: Sparkles },
    { label: 'Calendário e publicação no Instagram/Facebook', on: tour.calendar && tour.publishContent, icon: CalendarDays },
    {
      label: tour.reports === 'advanced' ? 'Relatórios avançados e desempenho da equipe' : 'Relatórios',
      on: tour.reports !== 'none',
      icon: BarChart3,
    },
    { label: 'Processamento e suporte prioritários', on: tour.priority, icon: Zap },
  ]

  return (
    <>
      <StepTitle
        title={
          <>
            Seu plano <span className="relative whitespace-nowrap">{planLabel[plan]}</span>
          </>
        }
        subtitle={
          inPromo
            ? 'Presente de lançamento: o mais completo do Check, sem cartão. Olha tudo o que já é seu:'
            : 'Olha o que você já pode usar desde agora:'
        }
      />
      <div className="mx-auto mt-10 w-full max-w-3xl">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {meters.map((m, i) => (
            <Meter key={m.label} {...m} delay={0.3 + i * 0.08} reduce={reduce} />
          ))}
        </div>
        <ul className="mt-6 grid gap-2 sm:grid-cols-2">
          {features.map((f, i) => (
            <motion.li
              key={f.label}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.65 + i * 0.07, duration: 0.35 }}
              className={cn(
                'flex items-center gap-3 rounded-xl border border-border px-3.5 py-2.5 text-sm',
                f.on ? 'bg-card' : 'bg-transparent text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-lg',
                  f.on ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground',
                )}
              >
                {f.on ? <Check className="size-3.5" strokeWidth={3} /> : <Lock className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1">{f.label}</span>
              {!f.on && next && <span className="text-[10px] font-semibold uppercase tracking-wide">{planLabel[next]}</span>}
            </motion.li>
          ))}
        </ul>
      </div>
    </>
  )
}

function Meter({
  icon: Icon,
  label,
  value,
  suffix,
  delay,
  reduce,
}: {
  icon: typeof Users
  label: string
  value: number | null
  suffix: string
  delay: number
  reduce: boolean
}) {
  const [run, setRun] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setRun(true), delay * 1000)
    return () => clearTimeout(t)
  }, [delay])
  const n = useCountUp(value ?? 0, run && !reduce)
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: EASE }}
      className="rounded-2xl border border-border bg-card p-4 text-left"
    >
      <Icon className="size-4 text-primary-ink" />
      <p className="mt-3 font-display text-3xl font-extrabold tabular-nums">
        {value === null ? '∞' : run || reduce ? n.toLocaleString('pt-BR') : 0}
        <span className="text-base font-bold">{suffix}</span>
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </motion.div>
  )
}

function DoneStep({
  firstName,
  reduce,
  canUpload,
  onUpload,
  onDashboard,
}: {
  firstName: string
  reduce: boolean
  canUpload: boolean
  onUpload: () => void
  onDashboard: () => void
}) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 pb-16 text-center">
      <div className="relative grid size-40 place-items-center sm:size-48">
        {!reduce &&
          [0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute inset-0 rounded-full border-2 border-primary-ink/30"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: [0.6, 1.4], opacity: [0.7, 0] }}
              transition={{ duration: 2.4, delay: 0.7 + i * 0.8, repeat: Infinity, ease: 'easeOut' }}
            />
          ))}
        <motion.div
          initial={reduce ? { opacity: 0 } : { scale: 0, rotate: -25 }}
          animate={reduce ? { opacity: 1 } : { scale: 1, rotate: 0 }}
          transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 200, damping: 14 }}
          className="grid size-[80%] place-items-center rounded-full bg-primary shadow-[0_0_100px_-20px_var(--primary-ink)]"
        >
          <svg viewBox="0 0 100 100" className="size-[56%]" fill="none" aria-hidden="true">
            <motion.path
              d="M22 53 L42 72 L80 30"
              stroke="var(--primary-foreground)"
              strokeWidth={11}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: reduce ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.55, delay: reduce ? 0 : 0.35, ease: [0.65, 0, 0.35, 1] }}
            />
          </svg>
        </motion.div>
      </div>

      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5, ease: EASE }}
        className="mt-8 font-display text-4xl font-extrabold tracking-tight sm:text-6xl"
      >
        Tudo pronto{firstName ? `, ${firstName}` : ''}!
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.75, duration: 0.5, ease: EASE }}
        className="mt-3 text-lg text-muted-foreground text-balance"
      >
        Seu painel já está pronto, com um projeto de exemplo pra você explorar.
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.5, ease: EASE }}
        className="mt-10 flex flex-col items-center gap-3 sm:flex-row"
      >
        <CtaButton onClick={onDashboard} reduce={reduce}>
          Ir para o painel
        </CtaButton>
        {canUpload && (
          <button
            type="button"
            onClick={onUpload}
            className="inline-flex min-h-12 items-center rounded-full px-6 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Enviar meu primeiro vídeo
          </button>
        )}
      </motion.div>
    </div>
  )
}
