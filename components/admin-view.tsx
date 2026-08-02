'use client'

import { useState } from 'react'
import { Users, Film, Clock, CheckCircle2, Loader2 } from 'lucide-react'
import { adminService } from '@/lib/services'
import { planLabel, type AdminMetrics, type AdminUser, type PlanId, type UserStatus } from '@/lib/types'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'

const statusLabel: Record<UserStatus, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  suspended: 'Suspenso',
}

const statusStyles: Record<UserStatus, string> = {
  active: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30',
  inactive: 'bg-secondary text-muted-foreground ring-1 ring-border',
  suspended: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30',
}

export function AdminView() {
  const metrics = useQuery<AdminMetrics>((signal) => adminService.metrics(signal), [])
  const users = useQuery<AdminUser[]>((signal) => adminService.users(signal), [])

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <h1 className="font-display text-4xl tracking-wide sm:text-5xl">ADMIN</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Métricas do sistema e gestão de usuários.
      </p>

      {/* Metrics */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {metrics.error ? (
          <div className="col-span-full">
            <ErrorState message={metrics.error} onRetry={metrics.refetch} />
          </div>
        ) : (
          <>
            <MetricCard
              icon={<Users className="size-5" />}
              label="Usuários"
              value={metrics.data?.totalUsers}
              loading={metrics.loading}
            />
            <MetricCard
              icon={<Film className="size-5" />}
              label="Vídeos"
              value={metrics.data?.totalVideos}
              loading={metrics.loading}
            />
            <MetricCard
              icon={<Clock className="size-5" />}
              label="Pendentes"
              value={metrics.data?.pendingVideos}
              loading={metrics.loading}
              accent
            />
            <MetricCard
              icon={<CheckCircle2 className="size-5" />}
              label="Aprovados"
              value={metrics.data?.approvedVideos}
              loading={metrics.loading}
            />
          </>
        )}
      </div>

      {/* Users */}
      <h2 className="mt-10 font-display text-2xl tracking-wide">USUÁRIOS</h2>
      <div className="mt-4">
        {users.loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : users.error ? (
          <ErrorState message={users.error} onRetry={users.refetch} />
        ) : (users.data ?? []).length === 0 ? (
          <EmptyState
            icon={<Users className="size-7" />}
            title="Nenhum usuário cadastrado"
            description="Novas contas criadas na plataforma vão aparecer aqui."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-secondary/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nome</th>
                  <th className="px-4 py-3 font-semibold">E-mail</th>
                  <th className="px-4 py-3 font-semibold">Papel</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(users.data ?? []).map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    onChanged={(updated) =>
                      users.setData((prev) =>
                        (prev ?? []).map((x) => (x.id === updated.id ? updated : x)),
                      )
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function UserRow({
  user,
  onChanged,
}: {
  user: AdminUser
  onChanged: (u: AdminUser) => void
}) {
  const [busy, setBusy] = useState<UserStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Plano só existe por conta (dono) — editores não têm plano próprio.
  const currentPlan = user.plan ?? 'free'
  const [plan, setPlan] = useState<PlanId>(currentPlan)
  const [savingPlan, setSavingPlan] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)

  async function setStatus(status: UserStatus) {
    if (status === user.status) return
    setBusy(status)
    setError(null)
    try {
      const updated = await adminService.updateUserStatus(user.id, status)
      onChanged(updated)
      toast.success(status === 'suspended' ? 'Usuário suspenso' : 'Usuário reativado')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao atualizar.')
    } finally {
      setBusy(null)
    }
  }

  // Único jeito hoje de ativar um plano pago — não há checkout ainda.
  async function savePlan() {
    if (plan === currentPlan) return
    setSavingPlan(true)
    setPlanError(null)
    try {
      await adminService.updatePlan(user.id, plan)
      onChanged({ ...user, plan })
      toast.success('Plano atualizado')
    } catch (err) {
      setPlanError(err instanceof ApiError ? err.message : 'Falha ao atualizar o plano.')
    } finally {
      setSavingPlan(false)
    }
  }

  // Alterna entre ativo e suspenso (ação principal do admin).
  const target: UserStatus = user.status === 'suspended' ? 'active' : 'suspended'

  return (
    <tr className="text-foreground">
      <td className="px-4 py-3 font-medium">{user.name || '—'}</td>
      <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
      <td className="px-4 py-3">
        <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {user.role}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
            statusStyles[user.status],
          )}
        >
          {statusLabel[user.status]}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col items-start gap-2">
          <button
            type="button"
            onClick={() => setStatus(target)}
            disabled={busy !== null}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
          >
            {busy !== null && <Loader2 className="size-3.5 animate-spin" />}
            {target === 'suspended' ? 'Suspender' : 'Reativar'}
          </button>

          {user.teamRole === 'owner' && (
            <div className="flex items-center gap-1.5">
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as PlanId)}
                disabled={savingPlan}
                className="min-h-8 rounded-lg border border-border bg-secondary px-2 text-xs text-foreground outline-none disabled:opacity-50"
              >
                {(['free', 'pro', 'agencia'] satisfies PlanId[]).map((p) => (
                  <option key={p} value={p}>
                    {planLabel[p]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={savePlan}
                disabled={savingPlan || plan === currentPlan}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {savingPlan && <Loader2 className="size-3 animate-spin" />}
                Salvar plano
              </button>
            </div>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        {planError && <p className="mt-1 text-xs text-destructive">{planError}</p>}
      </td>
    </tr>
  )
}

function MetricCard({
  icon,
  label,
  value,
  loading,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value?: number
  loading?: boolean
  accent?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        accent ? 'border-primary/40 bg-primary/10' : 'border-border bg-card',
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs sm:text-sm">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-9 w-12" />
      ) : (
        <p
          className={cn(
            'mt-2 font-display text-3xl leading-none tracking-wide sm:text-4xl',
            accent ? 'text-primary' : 'text-foreground',
          )}
        >
          {value ?? 0}
        </p>
      )}
    </div>
  )
}
