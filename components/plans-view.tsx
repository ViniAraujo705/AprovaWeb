'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Building2, Check, CreditCard, Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FadeIn, AnimatePresence, motion } from '@/components/motion'
import { usePlanLimit } from '@/components/plan-limit-provider'
import { billingService } from '@/lib/services'
import { ApiError } from '@/lib/api'
import type { BillingCycle, PlanId } from '@/lib/types'
import { PLAN_PRICING, formatBRL, planPricing } from '@/lib/plan-pricing'
import { PENDING_CHECKOUT_PLAN_KEY } from '@/lib/config'

/** Só dígitos, 11 (CPF) ou 14 (CNPJ) — mesma regra que a Asaas valida no back. */
function isValidCpfCnpjDigits(digits: string): boolean {
  return digits.length === 11 || digits.length === 14
}

type Billing = 'monthly' | 'annual'

// Desconto do anual sobre o mensal, calculado a partir do Pro (referência
// pra badge "-XX%" ao lado do toggle Anual — mesma ideia do Free, que não
// tem opção anual).
const annualSavingsPct = (() => {
  const pro = planPricing('pro')
  if (!pro.monthly || pro.annualMonthly === null) return null
  return Math.round((1 - pro.annualMonthly / pro.monthly) * 100)
})()

const PLAN_ICONS: Record<PlanId, typeof CreditCard> = {
  free: CreditCard,
  pro: Sparkles,
  agencia: Building2,
}

function describeCheckoutError(err: unknown): string {
  return err instanceof ApiError
    ? err.status === 502
      ? 'A Asaas está indisponível no momento. Tente novamente em instantes.'
      : err.message
    : 'Não foi possível iniciar o checkout. Tente novamente.'
}

export function PlansView() {
  const { planStatus } = usePlanLimit()
  const [billing, setBilling] = useState<Billing>('monthly')
  const [checkingOut, setCheckingOut] = useState<PlanId | null>(null)
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null)

  async function confirmCheckout(plan: PlanId, cpfCnpj: string) {
    setCheckingOut(plan)
    try {
      const cycle: BillingCycle = billing === 'annual' ? 'YEARLY' : 'MONTHLY'
      const { url } = await billingService.checkout(plan, cycle, cpfCnpj)
      if (!url) throw new Error('URL de checkout vazia.')
      // A tela de retorno (Meu Plano) usa isso pra saber qual plano esperar
      // enquanto reconsulta /plans/me — não dá pra confiar só no `?status=
      // sucesso` da URL, já que o webhook da Asaas é assíncrono.
      sessionStorage.setItem(PENDING_CHECKOUT_PLAN_KEY, plan)
      window.location.href = url
    } catch (err) {
      setCheckingOut(null)
      throw err
    }
  }

  const pendingPlanPricing = PLAN_PRICING.find((p) => p.id === pendingPlan) ?? null

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-10">
      <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">planos</h1>
      <p className="mt-2 text-base text-muted-foreground">
        compare os planos, assinar leva você direto para o checkout seguro.
      </p>

      <div className="mt-6 inline-flex rounded-full bg-secondary p-1 text-sm">
        <button
          type="button"
          onClick={() => setBilling('monthly')}
          className={cn(
            'rounded-full px-4 py-2 font-medium transition-colors',
            billing === 'monthly'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          mensal
        </button>
        <button
          type="button"
          onClick={() => setBilling('annual')}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-4 py-2 font-medium transition-colors',
            billing === 'annual'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          anual
          {annualSavingsPct !== null && (
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                billing === 'annual'
                  ? 'bg-white/20 text-primary-foreground'
                  : 'bg-emerald-500/15 text-emerald-600',
              )}
            >
              -{annualSavingsPct}%
            </span>
          )}
        </button>
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {PLAN_PRICING.map((plan) => {
          const isCurrent = planStatus?.plan === plan.id
          const highlighted = plan.id === 'pro'
          const Icon = PLAN_ICONS[plan.id]
          const isFree = plan.monthly === 0
          const price =
            billing === 'annual' && plan.annualMonthly !== null
              ? formatBRL(plan.annualMonthly)
              : formatBRL(plan.monthly)

          return (
            <FadeIn key={plan.id} y={6}>
              <div className="relative h-full">
                {highlighted && (
                  <span className="absolute -top-3.5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground shadow-md">
                    mais popular
                  </span>
                )}

                <div
                  className={cn(
                    'group relative flex h-full flex-col overflow-hidden rounded-3xl bg-card p-6 transition-all duration-300 ease-out hover:z-10 hover:-translate-y-1 hover:scale-[1.03] hover:shadow-2xl sm:p-7',
                    highlighted
                      ? 'border-2 border-foreground shadow-lg shadow-black/5'
                      : 'border border-border hover:border-foreground/20',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-base font-medium lowercase text-foreground">
                      <Icon className="size-4.5 text-muted-foreground" />
                      {plan.name}
                    </div>
                    {isCurrent && (
                      <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        plano atual
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>

                  <div className="mt-6 flex items-baseline gap-1">
                    {isFree ? (
                      <span className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                        grátis
                      </span>
                    ) : (
                      <>
                        <span className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                          {price}
                        </span>
                        <span className="text-base text-muted-foreground">/mês</span>
                      </>
                    )}
                  </div>
                  {billing === 'annual' && plan.annualTotal !== null && (
                    <p className="text-xs text-muted-foreground">
                      {formatBRL(plan.annualTotal)}/ano cobrados de uma vez
                    </p>
                  )}

                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
                        <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <button
                      type="button"
                      disabled
                      className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-secondary px-4 text-sm font-medium text-muted-foreground disabled:cursor-not-allowed"
                    >
                      plano atual
                    </button>
                  ) : plan.id === 'free' ? (
                    // Não existe "checkout" pro Free — voltar pra ele é cancelar
                    // a assinatura atual, ação que mora em Meu Plano.
                    <Link
                      href="/configuracoes/plano"
                      className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                    >
                      começar grátis
                    </Link>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setPendingPlan(plan.id)}
                        disabled={checkingOut !== null}
                        className={cn(
                          'mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50',
                          highlighted
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-foreground',
                        )}
                      >
                        {checkingOut === plan.id && <Loader2 className="size-4 animate-spin" />}
                        assinar
                      </button>
                      {highlighted && (
                        <p className="mt-2 text-center text-xs text-muted-foreground">
                          cancele quando quiser
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </FadeIn>
          )
        })}
      </div>

      <AnimatePresence>
        {pendingPlanPricing && (
          <CpfCnpjModal
            planName={pendingPlanPricing.name}
            onClose={() => setPendingPlan(null)}
            onConfirm={(cpfCnpj) => confirmCheckout(pendingPlanPricing.id, cpfCnpj)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function CpfCnpjModal({
  planName,
  onClose,
  onConfirm,
}: {
  planName: string
  onClose: () => void
  onConfirm: (cpfCnpj: string) => Promise<void>
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const digits = value.replace(/\D/g, '')

  async function handleConfirm() {
    if (!isValidCpfCnpjDigits(digits)) {
      setError('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onConfirm(digits)
      // Sucesso navega pra fora da página (checkout externo) — não há
      // estado de "sucesso" pra tratar aqui.
    } catch (err) {
      setError(describeCheckoutError(err))
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/70"
        onClick={() => !busy && onClose()}
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
      <motion.div
        className="relative w-full max-w-md rounded-xl border border-border bg-card p-5"
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
            <CreditCard className="size-5" />
          </span>
          <h3 className="text-lg font-bold tracking-tight">Assinar {planName}</h3>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          A Asaas exige o CPF ou CNPJ do pagador para emitir a cobrança.
        </p>
        <label className="mt-4 block text-sm font-medium text-foreground" htmlFor="checkout-cpf-cnpj">
          CPF ou CNPJ
        </label>
        <input
          id="checkout-cpf-cnpj"
          type="text"
          inputMode="numeric"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
          placeholder="Somente números"
          disabled={busy}
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
        />
        {error && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" /> {error}
          </p>
        )}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-secondary px-4 text-sm font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Continuar para pagamento
          </button>
        </div>
      </motion.div>
    </div>
  )
}
