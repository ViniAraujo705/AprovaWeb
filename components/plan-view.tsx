'use client'

/** Tela "Meu Plano" (/configuracoes/plano) — plano atual, uso vs. limite por eixo, upgrade e cancelamento. */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  Check,
  Gauge,
  Infinity as InfinityIcon,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { usePlanLimit } from '@/components/plan-limit-provider'
import { useAuth } from '@/components/auth-provider'
import { ErrorState, LoadingState } from '@/components/states'
import { FadeIn } from '@/components/motion'
import { billingService } from '@/lib/services'
import { ApiError } from '@/lib/api'
import { toast } from '@/lib/toast'
import { planPricing, formatBRL } from '@/lib/plan-pricing'
import { planLabel, type PlanId, type PlanLimits, type PlanStatus, type PlanUsage } from '@/lib/types'
import { PENDING_CHECKOUT_PLAN_KEY } from '@/lib/config'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'

function readPendingCheckoutPlan(): PlanId | null {
  const raw = sessionStorage.getItem(PENDING_CHECKOUT_PLAN_KEY)
  return raw === 'portfolio' || raw === 'free' || raw === 'pro' || raw === 'agencia' ? raw : null
}

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

const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 30000

type ConfirmState = 'idle' | 'polling' | 'success' | 'timeout'

/**
 * A Asaas volta para `?status=sucesso | cancelado | expirado` (minúsculas,
 * sem acento — valores confirmados com o backend). Só `sucesso` inicia uma
 * confirmação, e mesmo ela não é a palavra final: quem efetiva a troca de
 * plano é um webhook assíncrono, não o retorno do usuário — em pix/boleto dá
 * pra voltar aqui antes da compensação. O plano só muda de fato quando o
 * backend processa o webhook, o que pode levar alguns segundos. Por
 * isso não dá pra confiar cegamente no parâmetro da URL nem comparar contra
 * um "estado anterior": se o webhook for rápido (ou, no modo demo, instantâneo),
 * o plano já pode chegar atualizado na primeiríssima consulta. Em vez disso,
 * guarda-se o plano-alvo em `sessionStorage` antes do redirect
 * (`components/plans-view.tsx`) e fica reconsultando `/plans/me` até bater
 * com ele (ou desistindo depois de 30s).
 */
function useCheckoutConfirmation(
  planStatus: PlanStatus | null,
  refetch: () => void,
): ConfirmState {
  const searchParams = useSearchParams()
  const router = useRouter()
  const status = searchParams.get('status')
  const isReturning = status === 'sucesso'
  const [state, setState] = useState<ConfirmState>('idle')
  const target = useRef<PlanId | null>(null)

  // Lê o alvo uma vez ao montar. Sem alvo conhecido (ex: URL reaberta
  // manualmente ou storage limpo) não há o que confirmar — só limpa a URL.
  useEffect(() => {
    if (!isReturning) return
    const pending = readPendingCheckoutPlan()
    if (!pending) {
      // A página pode ter sido atualizada depois do tempo de espera inicial.
      // Ainda assim, uma visita explícita à URL de sucesso deve recuperar um
      // pagamento já confirmado, sem exigir uma nova cobrança.
      void billingService.sync().then(refetch).catch(() => undefined)
      router.replace('/configuracoes/plano')
      return
    }
    target.current = pending
    setState('polling')
    // Uma reconciliação pontual cobre webhook atrasado/perdido sem transformar
    // a tela em polling da API da Asaas. Se não houver confirmação ainda, o
    // fluxo abaixo continua aguardando o webhook normalmente.
    void billingService.sync().then(refetch).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Os outros dois retornos da Asaas não geram cobrança confirmada:
  // `cancelado` (o usuário desistiu na tela de pagamento) e `expirado` (o
  // prazo do boleto/pix venceu). Nos dois casos não há o que confirmar — o
  // alvo guardado antes do redirect vira lixo e precisa sair do storage,
  // senão uma volta posterior por `?status=sucesso` tentaria confirmar um
  // plano que ninguém chegou a pagar. Limpa a URL junto para o aviso não se
  // repetir a cada F5.
  useEffect(() => {
    if (status !== 'cancelado' && status !== 'expirado') return
    sessionStorage.removeItem(PENDING_CHECKOUT_PLAN_KEY)
    if (status === 'cancelado') {
      toast.info('Pagamento cancelado', 'Nenhuma cobrança foi feita — seu plano continua o mesmo.')
    } else {
      toast.info(
        'Cobrança expirada',
        'O prazo para pagamento venceu. Gere uma nova cobrança para concluir o upgrade.',
      )
    }
    router.replace('/configuracoes/plano')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (state !== 'polling' || !planStatus || !target.current) return
    if (planStatus.plan === target.current) {
      sessionStorage.removeItem(PENDING_CHECKOUT_PLAN_KEY)
      setState('success')
      toast.success('Pagamento confirmado', `Seu plano agora é ${planLabel[planStatus.plan]}.`)
      router.replace('/configuracoes/plano')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, planStatus])

  useEffect(() => {
    if (state !== 'polling') return
    const id = setInterval(refetch, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [state, refetch])

  useEffect(() => {
    if (state !== 'polling') return
    const id = setTimeout(() => {
      setState((s) => {
        if (s !== 'polling') return s
        sessionStorage.removeItem(PENDING_CHECKOUT_PLAN_KEY)
        return 'timeout'
      })
    }, POLL_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [state])

  return state
}

export function PlanView() {
  const { planStatus, loading, refetch } = usePlanLimit()
  const { user } = useAuth()
  const isOwner = user?.teamRole === 'owner'
  const confirmState = useCheckoutConfirmation(planStatus, refetch)

  // Uma visita explícita a “Meu plano” também pode recuperar uma confirmação
  // recente que tenha ficado sem webhook. É uma única consulta por montagem,
  // não polling da Asaas.
  useEffect(() => {
    if (!isOwner || planStatus?.plan !== 'free') return
    void billingService.sync().then(refetch).catch(() => undefined)
  }, [isOwner, planStatus?.plan, refetch])

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <PageHeader
        eyebrow="Conta da agência"
        title="Meu plano"
        description="Seu plano atual e o quanto você já usou de cada limite."
      />

      {(confirmState === 'polling' || confirmState === 'timeout') && (
        <FadeIn className="mt-6" y={6}>
          <div
            className={cn(
              'flex items-center gap-3 rounded-2xl border p-4 text-sm',
              confirmState === 'timeout'
                ? 'border-warning-border bg-warning-soft text-warning-ink'
                : 'border-primary-ink/30 bg-primary/5 text-foreground',
            )}
          >
            {confirmState === 'polling' ? (
              <>
                <Loader2 className="size-4 shrink-0 animate-spin text-primary-ink" />
                Confirmando seu pagamento… isso pode levar alguns segundos.
              </>
            ) : (
              <>
                <AlertTriangle className="size-4 shrink-0" />
                Ainda estamos processando o pagamento — atualize a página em instantes.
              </>
            )}
          </div>
        </FadeIn>
      )}

      {loading ? (
        <LoadingState className="mt-8" />
      ) : !planStatus ? (
        <ErrorState className="mt-8" message="Não foi possível carregar seu plano." onRetry={refetch} />
      ) : (
        <>
          <div className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <PlanCard plan={planStatus.plan} isOwner={isOwner} />

          <FadeIn y={6}>
            <div className="h-full rounded-3xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-deep text-primary">
                  <Gauge className="size-5" />
                </span>
                <h2 className="font-display text-xl text-foreground">Uso do plano</h2>
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
          </div>
        </>
      )}
    </div>
  )
}

function PlanCard({ plan, isOwner }: { plan: PlanId; isOwner: boolean }) {
  const { refetch } = usePlanLimit()
  const pricing = planPricing(plan)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  async function cancelSubscription() {
    setCancelling(true)
    setCancelError(null)
    try {
      await billingService.cancel()
      toast.success('Assinatura cancelada', 'Você voltou para o plano Free.')
      setConfirmingCancel(false)
      refetch()
    } catch (err) {
      setCancelError(
        err instanceof ApiError ? err.message : 'Não foi possível cancelar. Tente novamente.',
      )
    } finally {
      setCancelling(false)
    }
  }

  return (
    <FadeIn y={6}>
      <div className="h-full rounded-3xl bg-deep p-6 text-deep-foreground sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-display text-2xl">{pricing.name}</p>
          <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
            Plano atual
          </span>
        </div>

        <p className="mt-6 flex items-baseline gap-1">
          <span className="font-display text-5xl leading-none">
            {formatBRL(pricing.monthly)}
          </span>
          {pricing.monthly !== 0 && <span className="text-deep-muted">/mês</span>}
        </p>
        <p className="mt-3 text-sm text-deep-muted">{pricing.description}</p>

        <ul className="mt-6 space-y-3 border-t border-white/10 pt-5">
          {pricing.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-sm text-deep-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={3} />
              {feature}
            </li>
          ))}
        </ul>

        {!isOwner ? (
          <p className="mt-6 text-xs text-deep-muted">
            Apenas o dono da conta pode gerenciar o plano e a cobrança.
          </p>
        ) : plan === 'free' ? (
          <Link
            href="/planos"
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 font-display text-base text-primary-foreground hover:opacity-90"
          >
            Fazer upgrade
          </Link>
        ) : confirmingCancel ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-deep-foreground">
              Tem certeza? Você perde acesso aos recursos pagos imediatamente, sem reembolso
              proporcional.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={cancelSubscription}
                disabled={cancelling}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-danger px-4 text-sm font-medium text-danger-foreground hover:opacity-90 disabled:opacity-50"
              >
                {cancelling && <Loader2 className="size-3.5 animate-spin" />}
                Confirmar cancelamento
              </button>
              <button
                type="button"
                onClick={() => setConfirmingCancel(false)}
                disabled={cancelling}
                className="inline-flex min-h-10 items-center rounded-xl border border-deep-foreground/40 px-4 text-sm font-medium text-deep-foreground disabled:opacity-50"
              >
                Voltar
              </button>
            </div>
            {cancelError && <p className="mt-2 text-xs text-[#f19a88]">{cancelError}</p>}
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/planos"
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Ver planos
            </Link>
            <button
              type="button"
              onClick={() => setConfirmingCancel(true)}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-deep-foreground/40 px-5 text-sm font-medium text-deep-foreground hover:bg-white/5"
            >
              Cancelar assinatura
            </button>
          </div>
        )}
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
            reached ? 'text-danger-ink' : near ? 'text-warning-ink' : 'text-muted-foreground',
          )}
        >
          {used}/{limit}
        </span>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            reached ? 'bg-danger' : near ? 'bg-warning' : 'bg-foreground',
          )}
          style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
        />
      </div>
    </div>
  )
}
