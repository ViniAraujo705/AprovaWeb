'use client'

/**
 * Contexto central de plano/uso da conta (`GET /plans/me`), montado uma única
 * vez no shell autenticado (`app/(app)/layout.tsx`) para evitar que cada tela
 * (clientes, upload, perguntas, equipe, configurações, projeto) refaça o
 * mesmo fetch. Também concentra a modal de paywall: qualquer ação que bata
 * num 403 de limite de plano deve passar por `handlePlanLimitError` em vez de
 * mostrar o erro genérico da API.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Lock, X } from 'lucide-react'
import { planService } from '@/lib/services'
import { planLabel, type PlanId, type PlanStatus, type PlanUsage } from '@/lib/types'
import { ApiError } from '@/lib/api'
import { useQuery } from '@/lib/use-query'
import { AnimatePresence, motion } from '@/components/motion'

interface PlanLimitContextValue {
  planStatus: PlanStatus | null
  loading: boolean
  refetch: () => void
  /** Soma um delta (não um valor absoluto) a cada eixo informado, otimista, sem refetch. */
  bumpUsage: (patch: Partial<PlanUsage>) => void
  /** Se `err` for um 403 de limite de plano, abre a modal e retorna `true` (o call-site deve parar ali). */
  handlePlanLimitError: (err: unknown) => boolean
  openUpgradeModal: (reason?: string) => void
}

const PlanLimitContext = createContext<PlanLimitContextValue | null>(null)

export function PlanLimitProvider({ children }: { children: React.ReactNode }) {
  const {
    data: planStatus,
    loading,
    refetch,
    setData,
  } = useQuery<PlanStatus>((signal) => planService.me(signal), [])
  const [modalReason, setModalReason] = useState<string | null>(null)

  const bumpUsage = useCallback(
    (patch: Partial<PlanUsage>) => {
      setData((prev) => {
        if (!prev) return prev as unknown as PlanStatus
        const usage = { ...prev.usage }
        for (const key of Object.keys(patch) as (keyof PlanUsage)[]) {
          usage[key] = usage[key] + (patch[key] ?? 0)
        }
        return { ...prev, usage }
      })
    },
    [setData],
  )

  const openUpgradeModal = useCallback((reason?: string) => {
    setModalReason(reason ?? 'Você atingiu o limite do seu plano.')
  }, [])

  const handlePlanLimitError = useCallback((err: unknown): boolean => {
    if (err instanceof ApiError && err.status === 403) {
      setModalReason(err.message)
      return true
    }
    return false
  }, [])

  const value = useMemo<PlanLimitContextValue>(
    () => ({ planStatus, loading, refetch, bumpUsage, handlePlanLimitError, openUpgradeModal }),
    [planStatus, loading, refetch, bumpUsage, handlePlanLimitError, openUpgradeModal],
  )

  return (
    <PlanLimitContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {modalReason && <PlanLimitModal reason={modalReason} currentPlan={planStatus?.plan ?? null} onClose={() => setModalReason(null)} />}
      </AnimatePresence>
    </PlanLimitContext.Provider>
  )
}

export function usePlanLimit(): PlanLimitContextValue {
  const ctx = useContext(PlanLimitContext)
  if (!ctx) throw new Error('usePlanLimit deve ser usado dentro de <PlanLimitProvider>')
  return ctx
}

function PlanLimitModal({
  reason,
  currentPlan,
  onClose,
}: {
  reason: string
  currentPlan: PlanId | null
  onClose: () => void
}) {
  // A mensagem diz qual plano libera o recurso; sem isso, "planos pagos".
  const target = /ag[êe]ncia/i.test(reason) ? 'no plano Agência' : 'nos planos pagos'
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-limit-title"
        className="relative w-full max-w-[26rem] overflow-hidden rounded-[16px] border border-border bg-card shadow-2xl"
        initial={{ y: 8, scale: 0.98, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 8, scale: 0.98, opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-border bg-secondary text-foreground">
              <Lock className="size-[18px]" />
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="grid size-8 place-items-center rounded-[8px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <h2 id="plan-limit-title" className="mt-4 text-base font-semibold text-foreground">
            Disponível {target}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{reason}</p>
          {currentPlan && (
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-[6px] bg-secondary px-2 py-1 text-xs text-muted-foreground">
              Seu plano atual: <span className="font-medium text-foreground">{planLabel[currentPlan]}</span>
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border bg-secondary/40 px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-[10px] px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Agora não
          </button>
          <Link
            href="/planos"
            onClick={onClose}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Ver planos <ArrowRight className="size-4" />
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
