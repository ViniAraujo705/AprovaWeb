'use client'

/**
 * Aba "Produtividade" de /relatorios. Tudo vem pronto de
 * GET /reports/productivity (cadeias de versões tratadas como uma entrega,
 * data real de aprovação, prazos, notas, clientes e equipe).
 *
 * Ao puxar o relatório (abrir a aba ou trocar o período) aparece um
 * "checklist" que vai marcando cada parte enquanto os dados chegam; depois o
 * conteúdo entra em cascata, os números contam até o valor e as barras sobem.
 * Tudo isso some com `prefers-reduced-motion`.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  Clock,
  Download,
  FileBarChart,
  Hourglass,
  MessageSquare,
  Printer,
  Sparkles,
  Star,
  Timer,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import { productivityReportService } from '@/lib/services'
import { productionStageLabel, type ProductivityApprovals, type ProductivityReport } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { ErrorState, EmptyState } from '@/components/states'
import { motion, AnimatePresence, useReducedMotion } from '@/components/motion'
import { cn } from '@/lib/utils'
import { Gesture } from '@/components/gestures'
import { ClientAvatar } from '@/components/client-avatar'

/* --------------------------------- período -------------------------------- */

type Period = '30' | '90' | '180' | '365' | 'all'

const PERIODS: { value: Period; label: string; phrase: string }[] = [
  { value: '30', label: '30 dias', phrase: 'nos últimos 30 dias' },
  { value: '90', label: '3 meses', phrase: 'nos últimos 3 meses' },
  { value: '180', label: '6 meses', phrase: 'nos últimos 6 meses' },
  { value: '365', label: '12 meses', phrase: 'nos últimos 12 meses' },
  { value: 'all', label: 'Tudo', phrase: 'desde o início' },
]

function periodRange(p: Period): { from: string | null; to: string | null } {
  if (p === 'all') return { from: null, to: null }
  return { from: new Date(Date.now() - Number(p) * 86_400_000).toISOString(), to: null }
}

/* --------------------------------- formatos ------------------------------- */

const dec = (n: number) => n.toFixed(1).replace('.', ',')
const pctOf = (part: number, total: number) => (total ? Math.round((part / total) * 100) : null)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function fmtHours(h: number | null): string {
  if (h === null) return '—'
  if (h < 1) return '< 1 h'
  if (h < 48) return `${Math.round(h)} h`
  return `${dec(h / 24)} dias`
}

function monthLabel(key: string, long = false): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  const txt = long
    ? d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}

const BUCKET_LABEL: Record<string, string> = {
  ate_1d: 'até 1 dia',
  '1_3d': '1 a 3 dias',
  '3_7d': '3 a 7 dias',
  '7_14d': '1 a 2 semanas',
  mais_14d: '+2 semanas',
}

/* --------------------------------- animação ------------------------------- */

const PULL_STEPS = ['Entregas e aprovações', 'Prazos e versões', 'Notas dos clientes', 'Clientes e equipe']
const STEP_MS = 260

/** Conta de 0 até `value` quando o número aparece (ou muda). */
function useCountUp(value: number, decimals = 0, duration = 900): string {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(reduce ? value : 0)
  const from = useRef(0)
  useEffect(() => {
    if (reduce) {
      setShown(value)
      return
    }
    const start = performance.now()
    const initial = from.current
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - k, 3)
      setShown(initial + (value - initial) * eased)
      if (k < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration, reduce])
  return decimals ? dec(Number(shown.toFixed(decimals))) : String(Math.round(shown))
}

function CountUp({ value, decimals = 0, suffix = '' }: { value: number; decimals?: number; suffix?: string }) {
  const v = useCountUp(value, decimals)
  return (
    <>
      {v}
      {suffix}
    </>
  )
}

/**
 * Checklist que vai marcando enquanto o relatório é puxado. Chama `onDone`
 * quando todos os passos estão marcados E os dados já chegaram.
 */
function ReportPull({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, PULL_STEPS.length - (ready ? 0 : 1))), STEP_MS)
    return () => clearInterval(id)
  }, [ready])
  useEffect(() => {
    if (ready && step >= PULL_STEPS.length) {
      const id = setTimeout(onDone, 320)
      return () => clearTimeout(id)
    }
  }, [ready, step, onDone])
  const allDone = step >= PULL_STEPS.length

  return (
    <motion.div
      key="pull"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16, scale: 0.98 }}
      transition={{ duration: 0.25 }}
      className="mt-6 flex justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-deep p-7 text-deep-foreground shadow-xl">
        {/* Folha do relatório sendo "impressa" */}
        <motion.div
          className="absolute inset-x-0 top-0 h-1 origin-left bg-primary"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: (Math.min(step, PULL_STEPS.length) / PULL_STEPS.length) || 0.06 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
        <div className="flex items-center gap-4">
          <motion.span
            className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground"
            animate={allDone ? { scale: [1, 1.18, 1], rotate: [0, -8, 0] } : { rotate: [0, 6, -6, 0] }}
            transition={allDone ? { duration: 0.4 } : { duration: 1.2, repeat: Infinity }}
          >
            {allDone ? <Check className="size-6" strokeWidth={3} /> : <FileBarChart className="size-6" />}
          </motion.span>
          <div>
            <p className="font-display text-lg leading-tight">{allDone ? 'Relatório no check!' : 'Puxando o relatório…'}</p>
            <p className="text-sm text-deep-muted">Conferindo tudo antes de mostrar.</p>
          </div>
        </div>
        <ul className="mt-6 space-y-3">
          {PULL_STEPS.map((label, i) => {
            const done = i < step
            const active = i === step
            return (
              <li key={label} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    'grid size-5 place-items-center rounded-md border transition-colors',
                    done ? 'border-primary bg-primary text-primary-foreground' : 'border-deep-muted/50',
                  )}
                >
                  <AnimatePresence>
                    {done && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
                        <Check className="size-3.5" strokeWidth={3} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
                <span className={cn('transition-colors', done ? 'text-deep-foreground' : 'text-deep-muted')}>{label}</span>
                {active && (
                  <motion.span
                    className="ml-auto h-1.5 w-16 overflow-hidden rounded-full bg-deep-muted/30"
                    aria-hidden
                  >
                    <motion.span
                      className="block h-full w-1/2 rounded-full bg-primary"
                      animate={{ x: ['-100%', '200%'] }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </motion.span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </motion.div>
  )
}

const reveal = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
}

function Section({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.section variants={reveal} className={className}>
      {children}
    </motion.section>
  )
}

/* ---------------------------------- view ---------------------------------- */

export function ProductivityReport({ onOpenRatings }: { onOpenRatings?: () => void }) {
  const reduce = useReducedMotion()
  const [period, setPeriod] = useState<Period>('30')
  const [pulling, setPulling] = useState(true)
  const { data, loading, error, refetch } = useQuery<ProductivityReport>(
    (signal) => productivityReportService.get(signal, periodRange(period)),
    [period],
  )

  function changePeriod(p: Period) {
    if (p === period) return
    setPeriod(p)
    if (!reduce) setPulling(true)
  }

  const showPull = !reduce && (pulling || (loading && !data))
  const phrase = PERIODS.find((p) => p.value === period)!.phrase
  const periodLabel = PERIODS.find((p) => p.value === period)!.label

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div
          role="radiogroup"
          aria-label="Período"
          className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 text-sm"
        >
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={period === p.value}
              onClick={() => changePeriod(p.value)}
              className={cn(
                'inline-flex min-h-9 items-center whitespace-nowrap rounded-lg px-3.5 font-medium transition-colors',
                period === p.value
                  ? 'bg-primary font-semibold text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!data}
            onClick={() => data && exportCsv(data, periodLabel)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
          >
            <Download className="size-4" /> CSV
          </button>
          <button
            type="button"
            disabled={!data}
            onClick={() => window.print()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
          >
            <Printer className="size-4" /> PDF
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {error && !loading ? (
          <motion.div key="error" className="mt-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ErrorState message={error} onRetry={refetch} />
          </motion.div>
        ) : showPull ? (
          <ReportPull key={`pull-${period}`} ready={!loading && !!data} onDone={() => setPulling(false)} />
        ) : data && data.summary.sent + data.summary.approved + data.now.open === 0 && period === 'all' ? (
          <motion.div key="empty" className="mt-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <EmptyState
              icon={<FileBarChart className="size-7" />}
              title="Nada pra medir ainda"
              description="Assim que houver vídeos enviados para aprovação, os relatórios aparecem aqui."
            />
          </motion.div>
        ) : data ? (
          <motion.div
            key={`report-${period}`}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0 }}
            variants={{ show: { transition: { staggerChildren: reduce ? 0 : 0.08 } } }}
            className={cn('mt-6 space-y-6', loading && 'opacity-60')}
          >
            <Highlights data={data} phrase={phrase} />
            <KpiGrid data={data} />
            <NowSection data={data} />
            <MonthlySection data={data} />
            <div className="grid gap-6 lg:grid-cols-2">
              <ApprovalTimeSection data={data} />
              <RatingsSection data={data} onOpenRatings={onOpenRatings} />
            </div>
            <ClientsSection data={data} />
            <TeamSection data={data} />
            <Section>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Cada vídeo conta uma vez, mesmo com várias versões. &quot;Enviados&quot; contam pela data do primeiro
                envio; aprovados, nota, versões, tempo e prazo contam pela data da aprovação. &quot;Tempo até
                aprovar&quot; vai do primeiro envio até o cliente aprovar (mediana: metade sai mais rápido que isso).
                &quot;No prazo&quot; considera quando a versão aprovada foi enviada. A parte de &quot;agora&quot; mostra
                a situação deste momento, sem filtro de período.
              </p>
            </Section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}

/* -------------------------------- destaques ------------------------------- */

type Insight = { icon: React.ReactNode; text: React.ReactNode; tone?: 'good' | 'bad' }

function buildInsights(d: ProductivityReport, phrase: string): Insight[] {
  const out: Insight[] = []
  const s = d.summary
  const prev = s.previous

  if (s.approved > 0) {
    let tail = ''
    if (prev && prev.approved > 0) {
      const diff = Math.round(((s.approved - prev.approved) / prev.approved) * 100)
      tail = diff === 0 ? ', no mesmo ritmo do período anterior' : `, ${Math.abs(diff)}% ${diff > 0 ? 'a mais' : 'a menos'} que no período anterior`
    }
    out.push({
      icon: <TrendingUp className="size-4" />,
      text: (
        <>
          <b>{plural(s.approved, 'vídeo aprovado', 'vídeos aprovados')}</b> {phrase}
          {tail}.
        </>
      ),
      tone: prev && s.approved < prev.approved ? 'bad' : 'good',
    })
  }

  if (s.medianHoursToApprove !== null) {
    const p = prev?.medianHoursToApprove ?? null
    const faster = p !== null && s.medianHoursToApprove < p
    out.push({
      icon: <Timer className="size-4" />,
      text: (
        <>
          Metade das aprovações sai em até <b>{fmtHours(s.medianHoursToApprove)}</b> depois do envio
          {p !== null && Math.abs(p - s.medianHoursToApprove) >= 1
            ? ` (${fmtHours(Math.abs(p - s.medianHoursToApprove))} ${faster ? 'mais rápido' : 'mais devagar'} que antes)`
            : ''}
          .
        </>
      ),
      tone: p === null ? undefined : faster ? 'good' : 'bad',
    })
  }

  const ranked = d.clients.filter((c) => c.approved >= 2)
  const fastest = [...ranked]
    .filter((c) => c.medianHoursToApprove !== null)
    .sort((a, b) => a.medianHoursToApprove! - b.medianHoursToApprove!)[0]
  if (fastest && ranked.length > 1) {
    out.push({
      icon: <Trophy className="size-4" />,
      text: (
        <>
          <b>{fastest.name}</b> é quem aprova mais rápido: {fmtHours(fastest.medianHoursToApprove)}.
        </>
      ),
      tone: 'good',
    })
  }

  const mostRounds = [...ranked]
    .filter((c) => (c.averageVersions ?? 0) >= 1.5)
    .sort((a, b) => b.averageVersions! - a.averageVersions!)[0]
  if (mostRounds) {
    out.push({
      icon: <MessageSquare className="size-4" />,
      text: (
        <>
          <b>{mostRounds.name}</b> pede mais ajustes: {dec(mostRounds.averageVersions!)} versões por vídeo até aprovar.
        </>
      ),
      tone: 'bad',
    })
  }

  const waiting = d.now.waitingList[0]
  if (waiting && waiting.days >= 3) {
    out.push({
      icon: <Hourglass className="size-4" />,
      text: (
        <>
          <b>{waiting.name}</b> está esperando {waiting.clientName || 'o cliente'} há {plural(waiting.days, 'dia', 'dias')}. Vale
          um lembrete.
        </>
      ),
      tone: 'bad',
    })
  }

  const onTime = pctOf(s.onTime, s.withDeadline)
  if (onTime !== null) {
    out.push({
      icon: <Clock className="size-4" />,
      text: (
        <>
          <b>{onTime}%</b> das entregas com prazo saíram no prazo.
        </>
      ),
      tone: onTime >= 80 ? 'good' : 'bad',
    })
  }

  return out.slice(0, 4)
}

function Highlights({ data, phrase }: { data: ProductivityReport; phrase: string }) {
  const insights = buildInsights(data, phrase)
  const s = data.summary
  const onTime = pctOf(s.onTime, s.withDeadline)
  const health =
    data.now.overdue > 0 || (onTime !== null && onTime < 60)
      ? 'critical'
      : (s.averageScore ?? 10) < 7 || (onTime !== null && onTime < 80)
        ? 'attention'
        : s.approved > 0
          ? 'check'
          : 'empty'
  const title = {
    check: 'Operação no check',
    attention: 'Vale um check',
    critical: 'Hora de um check-up',
    empty: 'Período tranquilo',
  }[health]

  return (
    <Section className="overflow-hidden rounded-3xl bg-deep text-deep-foreground">
      <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center">
        <div className="flex items-center gap-5 lg:w-72 lg:shrink-0">
          <Gesture state={health} onDeep className="h-20 w-auto shrink-0 sm:h-24" />
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              <Sparkles className="size-3.5" /> Destaques
            </p>
            <p className="mt-1 font-display text-2xl leading-tight">{title}</p>
          </div>
        </div>
        {insights.length > 0 ? (
          <ul className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
            {insights.map((ins, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.12, duration: 0.4 }}
                className="flex gap-3 rounded-2xl bg-white/5 p-4 text-sm leading-snug text-deep-muted [&_b]:font-semibold [&_b]:text-deep-foreground"
              >
                <span
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-full',
                    ins.tone === 'bad' ? 'bg-warning text-warning-foreground' : 'bg-primary text-primary-foreground',
                  )}
                >
                  {ins.icon}
                </span>
                <span>{ins.text}</span>
              </motion.li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-deep-muted">Nenhuma aprovação {phrase}. Troque o período para ver mais dados.</p>
        )}
      </div>
    </Section>
  )
}

/* ----------------------------------- KPIs --------------------------------- */

function Delta({
  current,
  previous,
  better,
  format,
}: {
  current: number | null
  previous: number | null
  better: 'up' | 'down'
  format: (n: number) => string
}) {
  if (current === null || previous === null) return <span className="text-xs text-muted-foreground">sem comparação</span>
  const diff = current - previous
  if (Math.abs(diff) < 0.05) return <span className="text-xs text-muted-foreground">igual ao anterior</span>
  const good = better === 'up' ? diff > 0 : diff < 0
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', good ? 'text-success-ink' : 'text-danger-ink')}>
      {diff > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {format(Math.abs(diff))} vs anterior
    </span>
  )
}

function Kpi({
  label,
  icon,
  children,
  foot,
  tone,
}: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
  foot?: React.ReactNode
  tone?: 'danger'
}) {
  return (
    <div
      className={cn(
        'flex flex-col rounded-2xl border p-5',
        tone === 'danger' ? 'border-danger-border bg-danger-soft' : 'border-border bg-card',
      )}
    >
      <div className={cn('flex items-center gap-1.5 text-sm', tone === 'danger' ? 'text-danger-ink' : 'text-muted-foreground')}>
        {icon}
        {label}
      </div>
      <p
        className={cn(
          'mt-2 font-display text-3xl leading-none tabular-nums sm:text-4xl',
          tone === 'danger' ? 'text-danger-ink' : 'text-foreground',
        )}
      >
        {children}
      </p>
      {foot && <div className="mt-2">{foot}</div>}
    </div>
  )
}

function rate(a: ProductivityApprovals | null, kind: 'firstTry' | 'onTime'): number | null {
  if (!a) return null
  return kind === 'firstTry' ? pctOf(a.firstTry, a.approved) : pctOf(a.onTime, a.withDeadline)
}

function KpiGrid({ data }: { data: ProductivityReport }) {
  const s = data.summary
  const p = s.previous
  const firstTry = rate(s, 'firstTry')
  const onTime = rate(s, 'onTime')
  const pp = (n: number) => `${Math.round(n)} p.p.`
  return (
    <Section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <Kpi label="Aprovados" icon={<Check className="size-4" />} foot={<Delta current={s.approved} previous={p?.approved ?? null} better="up" format={(n) => String(Math.round(n))} />}>
        <CountUp value={s.approved} />
      </Kpi>
      <Kpi label="Enviados" icon={<ArrowRight className="size-4" />} foot={<Delta current={s.sent} previous={s.previousSent} better="up" format={(n) => String(Math.round(n))} />}>
        <CountUp value={s.sent} />
      </Kpi>
      <Kpi
        label="Nota dos clientes"
        icon={<Star className="size-4" />}
        foot={
          s.averageScore !== null ? (
            <Delta current={s.averageScore} previous={p?.averageScore ?? null} better="up" format={dec} />
          ) : (
            <span className="text-xs text-muted-foreground">sem avaliações</span>
          )
        }
      >
        {s.averageScore === null ? '—' : <CountUp value={s.averageScore} decimals={1} />}
      </Kpi>
      <Kpi
        label="Tempo até aprovar"
        icon={<Timer className="size-4" />}
        foot={<Delta current={s.medianHoursToApprove} previous={p?.medianHoursToApprove ?? null} better="down" format={fmtHours} />}
      >
        {fmtHours(s.medianHoursToApprove)}
      </Kpi>
      <Kpi
        label="Aprovados de primeira"
        icon={<Trophy className="size-4" />}
        foot={<Delta current={firstTry} previous={rate(p, 'firstTry')} better="up" format={pp} />}
      >
        {firstTry === null ? '—' : <CountUp value={firstTry} suffix="%" />}
      </Kpi>
      <Kpi label="No prazo" icon={<Clock className="size-4" />} foot={<Delta current={onTime} previous={rate(p, 'onTime')} better="up" format={pp} />}>
        {onTime === null ? '—' : <CountUp value={onTime} suffix="%" />}
      </Kpi>
      <Kpi
        label="Comentários por vídeo"
        icon={<MessageSquare className="size-4" />}
        foot={
          <Delta
            current={s.clientCommentsPerDelivery}
            previous={p?.clientCommentsPerDelivery ?? null}
            better="down"
            format={dec}
          />
        }
      >
        {s.clientCommentsPerDelivery === null ? '—' : <CountUp value={s.clientCommentsPerDelivery} decimals={1} />}
      </Kpi>
      <Kpi
        label="Em aberto agora"
        icon={<Hourglass className="size-4" />}
        tone={data.now.overdue > 0 ? 'danger' : undefined}
        foot={
          <span className={cn('text-xs', data.now.overdue > 0 ? 'font-semibold text-danger-ink' : 'text-muted-foreground')}>
            {data.now.overdue > 0 ? `${plural(data.now.overdue, 'atrasado', 'atrasados')} · ` : ''}
            {data.now.waitingClient} com o cliente
          </span>
        }
      >
        <CountUp value={data.now.open} />
      </Kpi>
    </Section>
  )
}

/* ---------------------------------- agora --------------------------------- */

function NowSection({ data }: { data: ProductivityReport }) {
  const { now } = data
  const maxStage = Math.max(1, ...now.byStage.map((s) => s.total))
  if (now.open === 0) return null
  return (
    <Section className="grid gap-4 lg:grid-cols-3">
      <ListCard
        title="Prazo vencido"
        empty="Nenhum vídeo atrasado."
        tone="danger"
        icon={<AlertTriangle className="size-4" />}
        items={now.overdueList.map((v) => ({ ...v, badge: v.days === 0 ? 'venceu ontem' : `${plural(v.days + 1, 'dia', 'dias')} atrasado` }))}
      />
      <ListCard
        title="Esperando o cliente"
        empty="Nenhum vídeo parado no cliente."
        icon={<Hourglass className="size-4" />}
        items={now.waitingList.map((v) => ({ ...v, badge: v.days === 0 ? 'hoje' : `há ${plural(v.days, 'dia', 'dias')}` }))}
      />
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-display text-base text-foreground">No Kanban agora</h3>
        <p className="text-xs text-muted-foreground">Vídeos em aberto por etapa.</p>
        <ul className="mt-4 space-y-3">
          {now.byStage.map((s, i) => (
            <li key={s.stage} className="text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{productionStageLabel[s.stage]}</span>
                <span className="font-semibold tabular-nums text-foreground">{s.total}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                <motion.div
                  className="h-full rounded-full bg-chart-2"
                  initial={{ width: 0 }}
                  animate={{ width: `${(s.total / maxStage) * 100}%` }}
                  transition={{ delay: 0.3 + i * 0.06, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}

function ListCard({
  title,
  empty,
  icon,
  items,
  tone,
}: {
  title: string
  empty: string
  icon: React.ReactNode
  items: { videoId: string; name: string; clientName: string; badge: string }[]
  tone?: 'danger'
}) {
  return (
    <div className={cn('rounded-2xl border p-5', tone === 'danger' && items.length ? 'border-danger-border bg-danger-soft' : 'border-border bg-card')}>
      <h3 className={cn('flex items-center gap-2 font-display text-base', tone === 'danger' && items.length ? 'text-danger-ink' : 'text-foreground')}>
        {icon}
        {title}
        <span className="ml-auto text-sm tabular-nums">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-3 -mx-2 max-h-64 overflow-y-auto">
          {items.map((v) => (
            <li key={v.videoId}>
              <Link
                href={`/videos/${v.videoId}/revisao`}
                className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-foreground/5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{v.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{v.clientName}</span>
                </span>
                <span className="shrink-0 text-xs font-medium text-muted-foreground">{v.badge}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ------------------------------ volume mensal ----------------------------- */

const SERIES = [
  { key: 'sent' as const, label: 'Enviados', className: 'bg-chart-2' },
  { key: 'approved' as const, label: 'Aprovados', className: 'bg-chart-1 dark:bg-chart-3' },
]

function niceMax(n: number): number {
  if (n <= 4) return 4
  const step = Math.pow(10, Math.floor(Math.log10(n)))
  return Math.ceil(n / step) * step
}

function MonthlySection({ data }: { data: ProductivityReport }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = niceMax(Math.max(...data.monthly.flatMap((m) => [m.sent, m.approved]), 1))
  const ticks = [max, max / 2, 0]
  const last = data.monthly.length - 1

  return (
    <Section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-foreground">Ritmo dos últimos 12 meses</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Quantos vídeos entraram e quantos o cliente aprovou em cada mês.</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {SERIES.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-2 text-muted-foreground">
              <span className={cn('size-3 rounded-[4px]', s.className)} /> {s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <div className="flex h-48 flex-col justify-between pb-0 text-right text-[11px] tabular-nums text-muted-foreground">
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {Number.isInteger(t) ? t : dec(t)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-48">
            {ticks.map((t, i) => (
              <div key={t} className="absolute inset-x-0 border-t border-border/70" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }} />
            ))}
          </div>
          <div className="relative flex h-48 items-end gap-1 sm:gap-2" onMouseLeave={() => setHover(null)}>
            {data.monthly.map((m, i) => (
              <div
                key={m.month}
                className="group relative flex h-full flex-1 items-end justify-center gap-[2px]"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${monthLabel(m.month, true)}: ${m.sent} enviados, ${m.approved} aprovados`}
              >
                <div className={cn('absolute inset-y-0 -inset-x-0.5 rounded-lg transition-colors', hover === i && 'bg-foreground/5')} />
                {SERIES.map((s, si) => (
                  <motion.div
                    key={s.key}
                    className={cn('relative w-full max-w-4 rounded-t-[4px]', s.className, m[s.key] === 0 && 'opacity-0')}
                    initial={{ height: 0 }}
                    animate={{ height: `${(m[s.key] / max) * 100}%` }}
                    transition={{ delay: 0.2 + i * 0.04 + si * 0.05, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                  />
                ))}
                {hover === i && (
                  <div
                    className={cn(
                      'pointer-events-none absolute bottom-full z-10 mb-2 w-44 rounded-xl border border-border bg-popover p-3 text-xs shadow-lg',
                      i < 2 ? 'left-0' : i > data.monthly.length - 3 ? 'right-0' : 'left-1/2 -translate-x-1/2',
                    )}
                  >
                    <p className="font-semibold text-foreground">{monthLabel(m.month, true)}</p>
                    {SERIES.map((s) => (
                      <p key={s.key} className="mt-1 flex items-center justify-between gap-2 text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={cn('size-2 rounded-[3px]', s.className)} />
                          {s.label}
                        </span>
                        <span className="font-semibold tabular-nums text-foreground">{m[s.key]}</span>
                      </p>
                    ))}
                    <p className="mt-1 flex justify-between text-muted-foreground">
                      Nota média <span className="font-semibold tabular-nums text-foreground">{m.averageScore === null ? '—' : dec(m.averageScore)}</span>
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1 sm:gap-2">
            {data.monthly.map((m, i) => (
              <span
                key={m.month}
                className={cn(
                  'flex-1 text-center text-[11px]',
                  i === last ? 'font-semibold text-foreground' : 'text-muted-foreground',
                  i % 2 === 1 && i !== last && 'max-sm:invisible',
                )}
              >
                {monthLabel(m.month)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Section>
  )
}

/* ------------------------- tempo até aprovar / notas ----------------------- */

function ApprovalTimeSection({ data }: { data: ProductivityReport }) {
  const total = data.approvalTime.reduce((s, b) => s + b.total, 0)
  const max = Math.max(1, ...data.approvalTime.map((b) => b.total))
  return (
    <Section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="font-display text-xl text-foreground">Quanto o cliente demora</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">Do primeiro envio até a aprovação, no período.</p>
      {total === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Sem aprovações no período.</p>
      ) : (
        <div className="mt-6 flex h-44 items-end gap-3">
          {data.approvalTime.map((b, i) => (
            <div key={b.bucket} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${BUCKET_LABEL[b.bucket]}: ${b.total}`}>
              <span className="text-sm font-semibold tabular-nums text-foreground">{b.total}</span>
              <motion.div
                className="w-full max-w-12 rounded-t-[4px] bg-chart-1 dark:bg-chart-3"
                initial={{ height: 0 }}
                animate={{ height: `${(b.total / max) * 100}%` }}
                transition={{ delay: 0.3 + i * 0.07, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                style={{ minHeight: b.total ? 4 : 0 }}
              />
              <span className="text-center text-[11px] leading-tight text-muted-foreground">{BUCKET_LABEL[b.bucket]}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function RatingsSection({ data, onOpenRatings }: { data: ProductivityReport; onOpenRatings?: () => void }) {
  const rows = [...data.ratingDistribution].sort((a, b) => b.stars - a.stars)
  const total = rows.reduce((s, r) => s + r.total, 0)
  const max = Math.max(1, ...rows.map((r) => r.total))
  return (
    <Section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-foreground">O que os clientes deram</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Estrelas na aprovação, no período.</p>
        </div>
        {onOpenRatings && (
          <button type="button" onClick={onOpenRatings} className="shrink-0 text-sm font-medium text-primary-ink hover:underline print:hidden">
            Ver avaliações
          </button>
        )}
      </div>
      {total === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Nenhuma nota no período.</p>
      ) : (
        <ul className="mt-5 space-y-2.5">
          {rows.map((r, i) => (
            <li key={r.stars} className="flex items-center gap-3 text-sm">
              <span className="flex w-20 shrink-0 items-center gap-0.5" aria-label={`${r.stars} estrelas`}>
                {Array.from({ length: 5 }).map((_, k) => (
                  <Star key={k} className={cn('size-3.5', k < r.stars ? 'fill-warning text-warning' : 'text-border')} />
                ))}
              </span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-secondary">
                <motion.div
                  className="h-full rounded-full bg-chart-1 dark:bg-chart-3"
                  initial={{ width: 0 }}
                  animate={{ width: `${(r.total / max) * 100}%` }}
                  transition={{ delay: 0.3 + i * 0.07, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">{r.total}</span> · {pctOf(r.total, total)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/* --------------------------------- clientes ------------------------------- */

type ClientSort = 'approved' | 'score' | 'versions' | 'time' | 'open'

const CLIENT_COLS: { key: ClientSort; label: string }[] = [
  { key: 'approved', label: 'Aprovados' },
  { key: 'score', label: 'Nota' },
  { key: 'versions', label: 'Versões' },
  { key: 'time', label: 'Aprova em' },
  { key: 'open', label: 'Em aberto' },
]

function ClientsSection({ data }: { data: ProductivityReport }) {
  const [sort, setSort] = useState<ClientSort | null>(null)
  const rows = useMemo(() => {
    if (!sort) return data.clients
    const val = (c: ProductivityReport['clients'][number]): number | null =>
      ({ approved: c.approved, score: c.averageScore, versions: c.averageVersions, time: c.medianHoursToApprove, open: c.overdue * 1000 + c.open })[sort]
    const asc = sort === 'versions' || sort === 'time'
    return [...data.clients].sort((a, b) => {
      const va = val(a)
      const vb = val(b)
      if (va === null) return 1
      if (vb === null) return -1
      return asc ? va - vb : vb - va
    })
  }, [data.clients, sort])

  if (rows.length === 0) return null
  return (
    <Section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="font-display text-xl text-foreground">Por cliente</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">Clique numa coluna para ordenar.</p>

      {/* Desktop: tabela */}
      <div className="mt-4 hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Cliente</th>
              {CLIENT_COLS.map((c) => (
                <th key={c.key} className="px-3 py-2 text-right font-medium">
                  <button
                    type="button"
                    onClick={() => setSort(sort === c.key ? null : c.key)}
                    className={cn('inline-flex items-center gap-1 hover:text-foreground', sort === c.key && 'font-semibold text-foreground')}
                  >
                    {c.label}
                    {sort === c.key && <ArrowDown className="size-3" />}
                  </button>
                </th>
              ))}
              <th className="py-2 pl-3 text-right font-medium">No prazo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.clientId ?? c.name} className="border-b border-border/60 last:border-0">
                <td className="py-3 pr-3">
                  <ClientName client={c} />
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  <span className="font-semibold text-foreground">{c.approved}</span>
                  <span className="text-muted-foreground"> / {c.sent} env.</span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-foreground">{c.averageScore === null ? '—' : dec(c.averageScore)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-foreground">{c.averageVersions === null ? '—' : dec(c.averageVersions)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-foreground">{fmtHours(c.medianHoursToApprove)}</td>
                <td className="px-3 py-3 text-right">
                  <OpenCell c={c} />
                </td>
                <td className="py-3 pl-3 text-right tabular-nums text-foreground">
                  {c.withDeadline ? `${pctOf(c.onTime, c.withDeadline)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Celular: cards */}
      <ul className="mt-4 space-y-3 md:hidden">
        {rows.map((c) => (
          <li key={c.clientId ?? c.name} className="rounded-xl bg-secondary/50 p-3">
            <ClientName client={c} />
            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <MiniStat label="Aprovados" value={`${c.approved}/${c.sent}`} />
              <MiniStat label="Nota" value={c.averageScore === null ? '—' : dec(c.averageScore)} />
              <MiniStat label="Versões" value={c.averageVersions === null ? '—' : dec(c.averageVersions)} />
              <MiniStat label="Aprova em" value={fmtHours(c.medianHoursToApprove)} />
              <MiniStat label="No prazo" value={c.withDeadline ? `${pctOf(c.onTime, c.withDeadline)}%` : '—'} />
              <div>
                <dt className="text-muted-foreground">Em aberto</dt>
                <dd className="mt-0.5">
                  <OpenCell c={c} />
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function ClientName({ client }: { client: ProductivityReport['clients'][number] }) {
  const inner = (
    <span className="flex min-w-0 items-center gap-2.5">
      <ClientAvatar name={client.name} photoUrl={client.photoUrl} seed={client.clientId ?? client.name} size="sm" />
      <span className="truncate font-medium text-foreground">{client.name}</span>
      {!client.clientId && <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">avulso</span>}
    </span>
  )
  return client.clientId ? (
    <Link href={`/clientes/${client.clientId}`} className="hover:underline">
      {inner}
    </Link>
  ) : (
    inner
  )
}

function OpenCell({ c }: { c: ProductivityReport['clients'][number] }) {
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5 tabular-nums">
      <span className="font-semibold text-foreground">{c.open}</span>
      {c.overdue > 0 && (
        <span className="rounded-full bg-danger-soft px-1.5 py-0.5 text-[11px] font-semibold text-danger-ink">{c.overdue} atrasado{c.overdue === 1 ? '' : 's'}</span>
      )}
      {c.waitingClient > 0 && (
        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">{c.waitingClient} com o cliente</span>
      )}
    </span>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  )
}

/* ---------------------------------- equipe -------------------------------- */

function TeamSection({ data }: { data: ProductivityReport }) {
  if (data.team.length === 0) return null
  const maxApproved = Math.max(1, ...data.team.map((t) => t.approved))
  return (
    <Section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-xl text-foreground">Por pessoa</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Aprovados e gravações no período; em aberto e atrasados de agora.</p>
        </div>
        <Link href="/equipe/desempenho" className="inline-flex items-center gap-1 text-sm font-medium text-primary-ink hover:underline print:hidden">
          Desempenho detalhado <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <ul className="mt-4 divide-y divide-border/60">
        {data.team.map((t, i) => (
          <li key={t.userId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <span className="flex min-w-0 flex-1 items-center gap-2.5 sm:w-52 sm:flex-none">
              <ClientAvatar name={t.name} photoUrl={t.avatarUrl} seed={t.userId} size="sm" />
              <span className="truncate text-sm font-medium text-foreground">{t.name}</span>
              {t.role === 'owner' && <span className="shrink-0 text-[10px] text-muted-foreground">dono</span>}
            </span>
            <div className="order-last flex h-2 min-w-0 basis-full overflow-hidden rounded-full bg-secondary sm:order-none sm:basis-auto sm:flex-1">
              <motion.div
                className="h-full rounded-full bg-chart-1 dark:bg-chart-3"
                initial={{ width: 0 }}
                animate={{ width: `${(t.approved / maxApproved) * 100}%` }}
                transition={{ delay: 0.3 + i * 0.06, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <span className="flex shrink-0 items-center justify-end gap-3 text-xs tabular-nums text-muted-foreground sm:w-80">
              <span>
                <b className="text-foreground">{t.approved}</b> aprov.
              </span>
              <span>nota <b className="text-foreground">{t.averageScore === null ? '—' : dec(t.averageScore)}</b></span>
              <span>
                <b className="text-foreground">{t.open}</b> em aberto
              </span>
              {t.overdue > 0 && <span className="font-semibold text-danger-ink">{t.overdue} atras.</span>}
              <span>
                <b className="text-foreground">{t.recordings}</b> grav.
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/* ----------------------------------- CSV ---------------------------------- */

function exportCsv(d: ProductivityReport, periodLabel: string) {
  const s = d.summary
  const n = (v: number | null, f: (x: number) => string = String) => (v === null ? '' : f(v))
  const rows: string[][] = [
    ['Relatório de produtividade — Check', periodLabel],
    [],
    ['Métrica', 'Período', 'Período anterior'],
    ['Enviados', String(s.sent), n(s.previousSent)],
    ['Aprovados', String(s.approved), n(s.previous?.approved ?? null)],
    ['Nota média (0-10)', n(s.averageScore, dec), n(s.previous?.averageScore ?? null, dec)],
    ['Aprovados de primeira', String(s.firstTry), n(s.previous?.firstTry ?? null)],
    ['Média de versões', n(s.averageVersions, dec), n(s.previous?.averageVersions ?? null, dec)],
    ['Tempo até aprovar (mediana, horas)', n(s.medianHoursToApprove, dec), n(s.previous?.medianHoursToApprove ?? null, dec)],
    ['No prazo / com prazo', `${s.onTime}/${s.withDeadline}`, s.previous ? `${s.previous.onTime}/${s.previous.withDeadline}` : ''],
    ['Comentários do cliente por vídeo', n(s.clientCommentsPerDelivery, dec), n(s.previous?.clientCommentsPerDelivery ?? null, dec)],
    [],
    ['Agora'],
    ['Em aberto', String(d.now.open)],
    ['Com o cliente', String(d.now.waitingClient)],
    ['Em ajuste', String(d.now.inAdjustment)],
    ['Atrasados', String(d.now.overdue)],
    [],
    ['Mês', 'Enviados', 'Aprovados', 'Nota média'],
    ...d.monthly.map((m) => [monthLabel(m.month, true), String(m.sent), String(m.approved), n(m.averageScore, dec)]),
    [],
    ['Cliente', 'Enviados', 'Aprovados', 'Nota', 'Versões', 'Aprova em (h)', 'No prazo', 'Com prazo', 'Em aberto', 'Com o cliente', 'Atrasados'],
    ...d.clients.map((c) => [
      c.name,
      String(c.sent),
      String(c.approved),
      n(c.averageScore, dec),
      n(c.averageVersions, dec),
      n(c.medianHoursToApprove, dec),
      String(c.onTime),
      String(c.withDeadline),
      String(c.open),
      String(c.waitingClient),
      String(c.overdue),
    ]),
    [],
    ['Pessoa', 'Aprovados', 'Nota', 'Em aberto', 'Atrasados', 'Gravações'],
    ...d.team.map((t) => [t.name, String(t.approved), n(t.averageScore, dec), String(t.open), String(t.overdue), String(t.recordings)]),
  ]
  const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(';')).join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `relatorio-check-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
