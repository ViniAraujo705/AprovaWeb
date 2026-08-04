'use client'

import { useState } from 'react'
import { AlertTriangle, Check, CreditCard, Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FadeIn } from '@/components/motion'
import { usePlanLimit } from '@/components/plan-limit-provider'
import { billingService } from '@/lib/services'
import { ApiError } from '@/lib/api'
import type { BillingCycle, PlanId } from '@/lib/types'
import { PLAN_PRICING, formatBRL } from '@/lib/plan-pricing'
import { PENDING_CHECKOUT_PLAN_KEY } from '@/lib/config'

type Billing = 'monthly' | 'annual'

export function PlansView() {
  const { planStatus } = usePlanLimit()
  const [billing, setBilling] = useState<Billing>('monthly')
  const [checkingOut, setCheckingOut] = useState<PlanId | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  async function startCheckout(plan: PlanId) {
    setCheckingOut(plan)
    setCheckoutError(null)
    try {
      const cycle: BillingCycle = billing === 'annual' ? 'ANNUALLY' : 'MONTHLY'
      const { url } = await billingService.checkout(plan, cycle)
      if (!url) throw new Error('URL de checkout vazia.')
      // A tela de retorno (Meu Plano) usa isso pra saber qual plano esperar
      // enquanto reconsulta /plans/me — não dá pra confiar só no `?status=
      // sucesso` da URL, já que o webhook da Mercado Pago é assíncrono.
      sessionStorage.setItem(PENDING_CHECKOUT_PLAN_KEY, plan)
      window.location.href = url
    } catch (err) {
      setCheckoutError(
        err instanceof ApiError
          ? err.status === 502
            ? 'A Mercado Pago está indisponível no momento. Tente novamente em instantes.'
            : err.message
          : 'Não foi possível iniciar o checkout. Tente novamente.',
      )
      setCheckingOut(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-10">
      <h1 className="font-display text-4xl tracking-wide sm:text-5xl">PLANOS</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Compare os planos — assinar leva você direto para o checkout seguro da Mercado Pago.
      </p>

      <div className="mt-6 inline-flex rounded-lg border border-border bg-secondary p-1 text-sm">
        <button
          type="button"
          onClick={() => setBilling('monthly')}
          className={cn(
            'rounded-md px-3 py-1.5 font-medium transition-colors',
            billing === 'monthly' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
          )}
        >
          Mensal
        </button>
        <button
          type="button"
          onClick={() => setBilling('annual')}
          className={cn(
            'rounded-md px-3 py-1.5 font-medium transition-colors',
            billing === 'annual' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
          )}
        >
          Anual <span className="text-primary">(mais barato)</span>
        </button>
      </div>

      {checkoutError && (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" /> {checkoutError}
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PLAN_PRICING.map((plan) => {
          const isCurrent = planStatus?.plan === plan.id
          const highlighted = plan.id === 'pro'
          const price =
            plan.monthly === 0
              ? 'Grátis'
              : billing === 'annual' && plan.annualMonthly !== null
                ? `${formatBRL(plan.annualMonthly)}/mês`
                : `${formatBRL(plan.monthly)}/mês`

          return (
            <FadeIn key={plan.id} y={6}>
              <div
                className={cn(
                  'flex h-full flex-col rounded-2xl border p-5 sm:p-6',
                  highlighted
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/40'
                    : 'border-border bg-card',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {highlighted ? (
                      <Sparkles className="size-4 text-primary" />
                    ) : (
                      <CreditCard className="size-4 text-muted-foreground" />
                    )}
                    {plan.name}
                  </div>
                  {isCurrent && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      Plano atual
                    </span>
                  )}
                </div>

                <p className="mt-3 font-display text-3xl tracking-wide">{price}</p>
                {billing === 'annual' && plan.annualTotal !== null && (
                  <p className="text-xs text-muted-foreground">
                    {formatBRL(plan.annualTotal)}/ano cobrados de uma vez
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>

                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <button
                    type="button"
                    disabled
                    className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-secondary px-4 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Plano atual
                  </button>
                ) : plan.id === 'free' ? (
                  // Não existe "checkout" pro Free — voltar pra ele é cancelar
                  // a assinatura atual, ação que mora em Meu Plano.
                  <p className="mt-6 text-center text-xs text-muted-foreground">
                    Cancele sua assinatura em{' '}
                    <span className="font-medium text-foreground">Meu Plano</span> para voltar ao
                    Free.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => startCheckout(plan.id)}
                    disabled={checkingOut !== null}
                    className={cn(
                      'mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50',
                      highlighted
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-foreground',
                    )}
                  >
                    {checkingOut === plan.id && <Loader2 className="size-4 animate-spin" />}
                    Assinar
                  </button>
                )}
              </div>
            </FadeIn>
          )
        })}
      </div>
    </div>
  )
}
