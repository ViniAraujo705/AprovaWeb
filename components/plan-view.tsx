'use client'

/** Tela "Meu Plano" (/configuracoes/plano) — plano atual, uso vs. limite por eixo e upgrade. */
import Link from 'next/link'
import { Check, Gauge, Infinity as InfinityIcon, Sparkles } from 'lucide-react'
import { usePlanLimit } from '@/components/plan-limit-provider'
import { ErrorState, LoadingState } from '@/components/states'
import { FadeIn } from '@/components/motion'
import { planPricing, formatBRL } from '@/lib/plan-pricing'
import type { PlanId, PlanLimits, PlanUsage } from '@/lib/types'
import { cn } from '@/lib/utils'

type UsageAxis = {
  key: keyof PlanUsage
  label: string
  limitKey: keyof PlanLimits
}

const AXES: UsageAxis[] = [
  { key: 'clients', label: 'Clientes', limitKey: 'maxClients' },
  { key: 'videosThisMonth', label: 'Vídeos este mês', limitKey: 'maxVideosPerMonth' },
  { key: 'ratingQuestions', label: 'Perguntas de avaliação', limitKey: 'maxRatingQuestions' },
  { key: 'extraEditors', label: 'Editores extras', limitKey: 'maxExtraEditors' },
]

export function PlanView() {
  const { planStatus, loading, refetch, openUpgradeModal } = usePlanLimit()

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:py-10">
      <h1 className="font-display text-4xl tracking-wide sm:text-5xl">MEU PLANO</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Seu plano atual e o quanto você já usou de cada limite.
      </p>

      {loading ? (
        <LoadingState className="mt-8" />
      ) : !planStatus ? (
        <ErrorState className="mt-8" message="Não foi possível carregar seu plano." onRetry={refetch} />
      ) : (
        <>
          <PlanCard
            plan={planStatus.plan}
            onUpgrade={() => openUpgradeModal()}
          />

          <FadeIn className="mt-6" y={6}>
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Gauge className="size-4 text-primary" />
                Uso do plano
              </div>
              <div className="mt-5 flex flex-col gap-5">
                {AXES.map((axis) => (
                  <UsageRow
                    key={axis.key}
                    label={axis.label}
                    used={planStatus.usage[axis.key]}
                    limit={planStatus.limits[axis.limitKey] as number | null}
                  />
                ))}
              </div>

              {/* Armazenamento não vem com um contador de uso do backend (só o
                  teto) — mostrado como informação, sem barra de progresso. */}
              <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-sm">
                <span className="text-foreground">Armazenamento</span>
                <span className="text-muted-foreground">
                  {planStatus.limits.storageGb === null
                    ? 'Ilimitado'
                    : `Até ${planStatus.limits.storageGb}GB`}
                </span>
              </div>
            </div>
          </FadeIn>
        </>
      )}
    </div>
  )
}

function PlanCard({
  plan,
  onUpgrade,
}: {
  plan: PlanId
  onUpgrade: () => void
}) {
  const pricing = planPricing(plan)
  const isTopTier = plan === 'agencia'

  return (
    <FadeIn y={6}>
      <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5 ring-1 ring-primary/20 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4 text-primary" />
            Plano {pricing.name}
          </div>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            Plano atual
          </span>
        </div>

        <p className="mt-3 font-display text-3xl tracking-wide">
          {pricing.monthly === 0 ? 'Grátis' : `${formatBRL(pricing.monthly)}/mês`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{pricing.description}</p>

        <ul className="mt-4 space-y-2">
          {pricing.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              {feature}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          {!isTopTier && (
            <button
              type="button"
              onClick={onUpgrade}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Fazer upgrade
            </button>
          )}
          <Link
            href="/planos"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-secondary px-4 text-sm font-medium text-foreground hover:bg-secondary/70"
          >
            Ver todos os planos
          </Link>
        </div>
      </div>
    </FadeIn>
  )
}

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  if (limit === null) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <InfinityIcon className="size-3.5" /> Ilimitado
        </span>
      </div>
    )
  }

  const ratio = limit > 0 ? used / limit : used > 0 ? 1 : 0
  const reached = used >= limit
  const near = !reached && ratio >= 0.8

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span
          className={cn(
            'font-medium',
            reached ? 'text-destructive' : near ? 'text-amber-500' : 'text-muted-foreground',
          )}
        >
          {used}/{limit}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            reached ? 'bg-destructive' : near ? 'bg-amber-500' : 'bg-primary',
          )}
          style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
        />
      </div>
    </div>
  )
}
