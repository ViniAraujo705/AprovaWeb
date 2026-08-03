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
import { Lock, X } from 'lucide-react'
import { planService } from '@/lib/services'
import type { PlanStatus, PlanUsage } from '@/lib/types'
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
        {modalReason && <PlanLimitModal reason={modalReason} onClose={() => setModalReason(null)} />}
      </AnimatePresence>
    </PlanLimitContext.Provider>
  )
}

export function usePlanLimit(): PlanLimitContextValue {
  const ctx = useContext(PlanLimitContext)
  if (!ctx) throw new Error('usePlanLimit deve ser usado dentro de <PlanLimitProvider>')
  return ctx
}

function PlanLimitModal({ reason, onClose }: { reason: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
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
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-center gap-2 pr-8 text-sm font-medium text-primary">
          <Lock className="size-4" />
          Recurso do plano pago
        </div>
        <p className="mt-3 text-sm text-foreground">{reason}</p>

        <Link
          href="/planos"
          onClick={onClose}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Ver planos
        </Link>
      </motion.div>
    </div>
  )
}
