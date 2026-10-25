'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check, CreditCard, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FadeIn, AnimatePresence, motion } from '@/components/motion'
import { usePlanLimit } from '@/components/plan-limit-provider'
import { billingService, type CheckoutPayer } from '@/lib/services'
import { ApiError } from '@/lib/api'
import type { BillingCycle, PlanId } from '@/lib/types'
import { PLAN_PRICING, formatBRL, planPricing } from '@/lib/plan-pricing'
import { PENDING_CHECKOUT_PLAN_KEY } from '@/lib/config'

/** Só dígitos, 11 (CPF) ou 14 (CNPJ) — mesma regra que a Asaas valida no back. */
function isValidCpfCnpjDigits(digits: string): boolean {
  return digits.length === 11 || digits.length === 14
}

/** DDD + telefone brasileiro, sem pontuação. */
function isValidPhoneNumberDigits(digits: string): boolean {
  return digits.length === 10 || digits.length === 11
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

  async function confirmCheckout(plan: PlanId, payer: CheckoutPayer) {
    setCheckingOut(plan)
    try {
      const cycle: BillingCycle = billing === 'annual' ? 'YEARLY' : 'MONTHLY'
      const { url } = await billingService.checkout(plan, cycle, payer)
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
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      {/* Seção de planos no padrão da apresentação de marca: fundo verde
          profundo, cards com contorno e o Pro em lima como destaque. */}
      <section className="rounded-3xl bg-deep px-5 py-8 text-deep-foreground sm:px-10 sm:py-12">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Planos</p>
            <h1 className="mt-4 max-w-2xl font-display text-4xl leading-[1.05] sm:text-5xl">
              Comece grátis. Cresça quando o volume pedir.
            </h1>
          </div>
          <div className="inline-flex shrink-0 self-start rounded-full border border-white/15 p-1 text-sm lg:self-auto">
            <button
              type="button"
              onClick={() => setBilling('monthly')}
              className={cn(
                'rounded-full px-5 py-2.5 font-semibold transition-colors',
                billing === 'monthly' ? 'bg-primary text-primary-foreground' : 'text-deep-muted hover:text-deep-foreground',
              )}
            >
              Mensal
            </button>
            <button
              type="button"
              onClick={() => setBilling('annual')}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-5 py-2.5 font-semibold transition-colors',
                billing === 'annual' ? 'bg-primary text-primary-foreground' : 'text-deep-muted hover:text-deep-foreground',
              )}
            >
              Anual
              {annualSavingsPct !== null && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                    billing === 'annual' ? 'bg-deep text-primary' : 'bg-primary/15 text-primary',
                  )}
                >
                  -{annualSavingsPct}%
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="mt-10 grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PLAN_PRICING.map((plan) => {
            const isCurrent = planStatus?.plan === plan.id
            const highlighted = plan.id === 'pro'
            const isFree = plan.monthly === 0
            const price =
              billing === 'annual' && plan.annualMonthly !== null
                ? formatBRL(plan.annualMonthly)
                : formatBRL(plan.monthly)
            const outlineBtn =
              'border border-deep-foreground/70 text-deep-foreground hover:bg-white/5'
            const featuredBtn = 'bg-deep text-deep-foreground hover:opacity-90'

            return (
              <FadeIn key={plan.id} y={6}>
                <div
                  className={cn(
                    'flex h-full flex-col rounded-3xl p-6 transition-transform duration-300 ease-out hover:-translate-y-1',
                    highlighted ? 'bg-primary text-primary-foreground' : 'border border-white/10 text-deep-foreground',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-xl">{plan.name}</p>
                    {isCurrent ? (
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
                          highlighted ? 'bg-deep text-primary' : 'bg-white/10 text-deep-foreground',
                        )}
                      >
                        Plano atual
                      </span>
                    ) : (
                      highlighted && (
                        <span className="shrink-0 rounded-full bg-deep px-3 py-1 text-xs font-semibold text-primary">
                          Mais escolhido
                        </span>
                      )
                    )}
                  </div>

                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="font-display text-5xl leading-none">{isFree ? formatBRL(0) : price}</span>
                    {!isFree && (
                      <span className={cn('text-base', highlighted ? 'text-primary-foreground/70' : 'text-deep-muted')}>/mês</span>
                    )}
                  </div>
                  {billing === 'annual' && plan.annualTotal !== null && (
                    <p className={cn('mt-1.5 text-xs', highlighted ? 'text-primary-foreground/70' : 'text-deep-muted')}>
                      {formatBRL(plan.annualTotal)}/ano cobrados de uma vez
                    </p>
                  )}

                  <p className={cn('mt-4 text-sm leading-6', highlighted ? 'text-primary-foreground/80' : 'text-deep-muted')}>
                    {plan.description}
                  </p>

                  {isCurrent ? (
                    <button
                      type="button"
                      disabled
                      className={cn(
                        'mt-6 inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-semibold disabled:cursor-not-allowed',
                        highlighted ? 'bg-deep/15 text-primary-foreground/70' : 'bg-white/10 text-deep-muted',
                      )}
                    >
                      Plano atual
                    </button>
                  ) : plan.id === 'free' ? (
                    // Não existe "checkout" pro Free — voltar pra ele é cancelar
                    // a assinatura atual, ação que mora em Meu Plano.
                    <Link
                      href="/configuracoes/plano"
                      className={cn('mt-6 inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors', outlineBtn)}
                    >
                      Começar grátis
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingPlan(plan.id)}
                      disabled={checkingOut !== null}
                      className={cn(
                        'mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all disabled:opacity-50',
                        highlighted ? featuredBtn : outlineBtn,
                      )}
                    >
                      {checkingOut === plan.id && <Loader2 className="size-4 animate-spin" />}
                      Assinar {plan.name}
                    </button>
                  )}
                  {highlighted && !isCurrent && (
                    <p className="mt-2 text-center text-xs text-primary-foreground/70">Cancele quando quiser</p>
                  )}

                  <ul className={cn('mt-6 flex-1 space-y-3 border-t pt-5', highlighted ? 'border-deep/15' : 'border-white/10')}>
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm leading-5">
                        <Check
                          className={cn('mt-0.5 size-4 shrink-0', highlighted ? 'text-primary-foreground' : 'text-primary')}
                          strokeWidth={3}
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </FadeIn>
            )
          })}
        </div>
      </section>

      <AnimatePresence>
        {pendingPlanPricing && (
          <CpfCnpjModal
            planName={pendingPlanPricing.name}
            onClose={() => setPendingPlan(null)}
            onConfirm={(payer) => confirmCheckout(pendingPlanPricing.id, payer)}
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
  onConfirm: (payer: CheckoutPayer) => Promise<void>
}) {
  const [payer, setPayer] = useState({
    cpfCnpj: '',
    phoneNumber: '',
    postalCode: '',
    address: '',
    addressNumber: '',
    complement: '',
    province: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const digits = payer.cpfCnpj.replace(/\D/g, '')
  const phoneDigits = payer.phoneNumber.replace(/\D/g, '')
  const postalCodeDigits = payer.postalCode.replace(/\D/g, '')

  function updatePayer(field: keyof typeof payer, value: string) {
    setPayer((current) => ({ ...current, [field]: value }))
  }

  async function handleConfirm() {
    if (!isValidCpfCnpjDigits(digits)) {
      setError('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.')
      return
    }
    if (!isValidPhoneNumberDigits(phoneDigits)) {
      setError('Informe um telefone com DDD válido.')
      return
    }
    if (postalCodeDigits.length !== 8) {
      setError('Informe um CEP válido com 8 dígitos.')
      return
    }
    if (!payer.address.trim() || !payer.addressNumber.trim() || !payer.province.trim()) {
      setError('Preencha rua, número e bairro para continuar.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onConfirm({
        cpfCnpj: digits,
        phoneNumber: phoneDigits,
        postalCode: postalCodeDigits,
        address: payer.address.trim(),
        addressNumber: payer.addressNumber.trim(),
        complement: payer.complement.trim() || undefined,
        province: payer.province.trim(),
      })
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
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        initial={{ y: 8, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 8, scale: 0.98 }}
        transition={{ duration: 0.2 }}
      >
        <div className="border-b border-border px-5 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary-ink">
              <CreditCard className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Checkout seguro</p>
              <h3 className="font-display text-xl">Assinar {planName}</h3>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Informe os dados de cobrança uma única vez. O cartão será inserido com segurança na Asaas.
          </p>
        </div>

        <div className="max-h-[65vh] space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          <section>
            <h4 className="text-sm font-semibold text-foreground">Dados do titular</h4>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-foreground" htmlFor="checkout-cpf-cnpj">CPF ou CNPJ</label>
                <input id="checkout-cpf-cnpj" type="text" inputMode="numeric" autoFocus value={payer.cpfCnpj} onChange={(e) => updatePayer('cpfCnpj', e.target.value)} placeholder="Somente números" disabled={busy} className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary-ink disabled:opacity-50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground" htmlFor="checkout-phone-number">Telefone com DDD</label>
                <input id="checkout-phone-number" type="tel" inputMode="tel" value={payer.phoneNumber} onChange={(e) => updatePayer('phoneNumber', e.target.value)} placeholder="Ex.: 85999999999" disabled={busy} className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary-ink disabled:opacity-50" />
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-baseline justify-between gap-3">
              <h4 className="text-sm font-semibold text-foreground">Endereço de cobrança</h4>
              <span className="text-xs text-muted-foreground">A cidade é identificada pelo CEP</span>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-6">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-foreground" htmlFor="checkout-postal-code">CEP</label>
                <input id="checkout-postal-code" type="text" inputMode="numeric" value={payer.postalCode} onChange={(e) => updatePayer('postalCode', e.target.value)} placeholder="Somente números" disabled={busy} className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary-ink disabled:opacity-50" />
              </div>
              <div className="sm:col-span-4">
                <label className="block text-sm font-medium text-foreground" htmlFor="checkout-address">Rua, avenida ou logradouro</label>
                <input id="checkout-address" type="text" value={payer.address} onChange={(e) => updatePayer('address', e.target.value)} disabled={busy} className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary-ink disabled:opacity-50" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-foreground" htmlFor="checkout-address-number">Número</label>
                <input id="checkout-address-number" type="text" value={payer.addressNumber} onChange={(e) => updatePayer('addressNumber', e.target.value)} disabled={busy} className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary-ink disabled:opacity-50" />
              </div>
              <div className="sm:col-span-4">
                <label className="block text-sm font-medium text-foreground" htmlFor="checkout-province">Bairro</label>
                <input id="checkout-province" type="text" value={payer.province} onChange={(e) => updatePayer('province', e.target.value)} disabled={busy} className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary-ink disabled:opacity-50" />
              </div>
              <div className="sm:col-span-6">
                <label className="block text-sm font-medium text-foreground" htmlFor="checkout-complement">Complemento <span className="font-normal text-muted-foreground">(opcional)</span></label>
                <input id="checkout-complement" type="text" value={payer.complement} onChange={(e) => updatePayer('complement', e.target.value)} placeholder="Apartamento, bloco, sala..." disabled={busy} className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary-ink disabled:opacity-50" />
              </div>
            </div>
          </section>

          {error && (
            <p className="flex items-center gap-1.5 rounded-xl bg-danger-soft p-3 text-sm text-danger-ink">
              <AlertTriangle className="size-4 shrink-0" /> {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-5 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Continuar para pagamento
          </button>
        </div>
      </motion.div>
    </div>
  )
}
