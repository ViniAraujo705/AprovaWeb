'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Copy, HardDrive, Loader2, RefreshCw, Search } from 'lucide-react'
import { adminService } from '@/lib/services'
import { planLabel, type AdminErrorVideo, type AdminPerson, type AdminStorageReport } from '@/lib/types'
import { EmptyState, ErrorState, Skeleton } from '@/components/states'
import { StatCard } from '@/components/page-header'
import { useQuery, type QueryState } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'

/* --------------------------------- format --------------------------------- */

export function formatBytes(n: number | null | undefined): string {
  const b = n ?? 0
  if (b < 1024) return `${b} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = b / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`
}

const num = (n: number | null | undefined) => (n ?? 0).toLocaleString('pt-BR')
/** Valor grande do StatCard: menor no celular para caber em 2 colunas (mesmo padrão do admin-view). */
const big = (v: string) => <span className="text-[22px] sm:text-3xl lg:text-2xl xl:text-3xl 2xl:text-4xl">{v}</span>
const usd = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' })

function relative(iso: string | null | undefined) {
  if (!iso) return 'nunca'
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'ontem' : `há ${d} dias`
}

function date(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}

function Section({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-2xl border border-border bg-card p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** Barra horizontal proporcional — sem lib de gráfico, só largura relativa. */
function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(1.5, (value / max) * 100) : 0
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div className="h-full rounded-full bg-foreground/70" style={{ width: `${pct}%` }} />
    </div>
  )
}

/* ------------------------------ armazenamento ----------------------------- */

export function StorageTab({ q }: { q: QueryState<AdminStorageReport> }) {
  const [refreshing, setRefreshing] = useState(false)
  const [busca, setBusca] = useState('')
  const r = q.data

  async function recalcular() {
    setRefreshing(true)
    try {
      q.setData(await adminService.storage(true))
      toast.success('Armazenamento recalculado')
    } catch (err) {
      toast.error('Não foi possível recalcular', err instanceof ApiError ? err.message : undefined)
    } finally {
      setRefreshing(false)
    }
  }

  if (q.error && !r) return <ErrorState message={q.error} onRetry={q.refetch} />
  if (!r) return <Skeleton className="h-64 w-full rounded-2xl" />
  if (!r.disponivel)
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-warning-soft p-4 text-sm text-warning-ink">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        {r.erro ?? 'Armazenamento indisponível.'}
      </div>
    )

  const vinculado = r.totalBytes - r.naoVinculados.bytes
  const contas = r.porConta.filter((c) => c.nomeAgencia.toLowerCase().includes(busca.trim().toLowerCase()))
  const maxConta = r.porConta[0]?.bytes ?? 0
  const maxCat = r.porCategoria[0]?.bytes ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Medido direto no R2 · atualizado {relative(r.atualizadoEm)} (o resultado fica em cache por 10 min)
        </span>
        <button
          type="button"
          onClick={recalcular}
          disabled={refreshing}
          className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-60"
        >
          <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
          Recalcular agora
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Armazenamento total" value={big(formatBytes(r.totalBytes))} hint={`${num(r.totalArquivos)} arquivos`} />
        <StatCard
          label="Custo estimado (R2)"
          value={big(usd.format(r.custoEstimadoUsdMes))}
          hint="por mês · US$ 0,015/GB após 10 GB grátis"
        />
        <StatCard
          label="Das agências"
          value={big(formatBytes(vinculado))}
          hint={`${num(r.porConta.length)} agências com arquivos`}
        />
        <StatCard
          label="Não vinculados"
          value={big(formatBytes(r.naoVinculados.bytes))}
          hint={`${num(r.naoVinculados.arquivos)} arquivos sem dono`}
          tone={r.naoVinculados.bytes > 0 ? 'warning' : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Por tipo de arquivo" subtitle="O que mais ocupa espaço" className="lg:col-span-1">
          <ul className="space-y-3">
            {r.porCategoria.map((c) => (
              <li key={c.categoria}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate text-foreground">{c.label}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{formatBytes(c.bytes)}</span>
                </div>
                <div className="mt-1.5">
                  <Bar value={c.bytes} max={maxCat} />
                </div>
              </li>
            ))}
            {r.naoVinculados.bytes > 0 && (
              <li>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate text-warning-ink">Não vinculados</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatBytes(r.naoVinculados.bytes)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  Arquivos no R2 que nenhum registro usa mais (uploads cancelados, versões apagadas). Pastas:{' '}
                  {r.naoVinculados.porPasta
                    .slice(0, 4)
                    .map((p) => `${p.pasta} ${formatBytes(p.bytes)}`)
                    .join(' · ')}
                </p>
              </li>
            )}
          </ul>
        </Section>

        <Section
          title="Por agência"
          subtitle="Quanto cada empresa está usando"
          className="lg:col-span-2"
          action={
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar agência"
                className="h-8 w-36 rounded-lg border border-border bg-background pl-7 pr-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary-ink sm:w-44"
              />
            </label>
          }
        >
          {contas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma agência encontrada.</p>
          ) : (
            <ul className="divide-y divide-border">
              {contas.map((c) => (
                <li key={c.accountId} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{c.nomeAgencia}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {planLabel[c.plano] ?? c.plano} · {num(c.arquivos)} arquivos
                        {r.totalBytes > 0 && ` · ${((c.bytes / r.totalBytes) * 100).toFixed(1).replace('.', ',')}% do total`}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {formatBytes(c.bytes)}
                    </span>
                  </div>
                  <div className="mt-2">
                    <Bar value={c.bytes} max={maxConta} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  )
}

/* --------------------------------- pessoas -------------------------------- */

type PapelFiltro = 'todos' | 'owner' | 'editor' | 'admin'
const papelLabel: Record<'owner' | 'editor' | 'admin', string> = { owner: 'Dono', editor: 'Editor', admin: 'Admin' }
const loginLabel: Record<AdminPerson['login'], string> = { email: 'E-mail', google: 'Google', apple: 'Apple' }

export function PeopleTab() {
  const q = useQuery<AdminPerson[]>((signal) => adminService.people(signal), [])
  const [busca, setBusca] = useState('')
  const [papel, setPapel] = useState<PapelFiltro>('todos')

  const list = useMemo(() => {
    const term = busca.trim().toLowerCase()
    return (q.data ?? []).filter((p) => {
      if (papel !== 'todos' && !p.contas.some((c) => c.papel === papel)) return false
      if (!term) return true
      return (
        p.nome.toLowerCase().includes(term) ||
        p.email.toLowerCase().includes(term) ||
        p.contas.some((c) => c.nomeAgencia.toLowerCase().includes(term))
      )
    })
  }, [q.data, busca, papel])

  if (q.error && !q.data) return <ErrorState message={q.error} onRetry={q.refetch} />
  if (!q.data) return <Skeleton className="h-64 w-full rounded-2xl" />

  const all = q.data
  const day = 86_400_000
  const ativos7 = all.filter((p) => p.ultimoAcesso && Date.now() - new Date(p.ultimoAcesso).getTime() <= 7 * day).length
  const count = (r: 'owner' | 'editor' | 'admin') => all.filter((p) => p.contas.some((c) => c.papel === r)).length

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Pessoas com login" value={num(all.length)} hint={`${num(ativos7)} ativas nos últimos 7 dias`} />
        <StatCard label="Donos de agência" value={num(count('owner'))} />
        <StatCard label="Editores (equipes)" value={num(count('editor'))} />
        <StatCard
          label="Suspensos"
          value={num(all.filter((p) => p.status === 'suspenso').length)}
          hint={`${num(all.filter((p) => !p.emailConfirmado).length)} sem e-mail confirmado`}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, e-mail ou agência"
            className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary-ink"
          />
        </label>
        <div className="flex gap-1 overflow-x-auto">
          {(['todos', 'owner', 'editor', 'admin'] as PapelFiltro[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPapel(p)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center rounded-lg px-3 text-xs font-medium transition-colors',
                papel === p ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground',
              )}
            >
              {p === 'todos' ? 'Todos' : papelLabel[p]}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState title="Ninguém encontrado" description="Ajuste a busca ou o filtro." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {list.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{p.nome}</p>
                    {p.status === 'suspenso' && (
                      <span className="shrink-0 rounded-full bg-danger-soft px-1.5 text-[10px] font-medium text-danger-ink">
                        Suspenso
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.email}
                    {!p.emailConfirmado && ' · e-mail não confirmado'}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {p.contas.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground">Sem agência</span>
                    ) : (
                      p.contas.map((c) => (
                        <span
                          key={c.accountId}
                          className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          <span className="truncate text-foreground">{c.nomeAgencia}</span>· {papelLabel[c.papel]} ·{' '}
                          {planLabel[c.plano] ?? c.plano}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground sm:w-56 sm:justify-end">
                  <div className="sm:text-right">
                    <p>Último acesso {relative(p.ultimoAcesso)}</p>
                    <p>
                      {loginLabel[p.login]} · desde {date(p.criadoEm)}
                    </p>
                  </div>
                  <button
                    type="button"
                    title="Copiar e-mail"
                    aria-label={`Copiar e-mail de ${p.nome}`}
                    onClick={() => {
                      void navigator.clipboard?.writeText(p.email)
                      toast.success('E-mail copiado')
                    }}
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <Copy className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Clientes finais das agências não têm login — eles revisam pelo link público, por isso não aparecem aqui.
      </p>
    </div>
  )
}

/* --------------------------------- sistema -------------------------------- */

export function SystemTab() {
  const q = useQuery<AdminErrorVideo[]>((signal) => adminService.errorVideos(signal), [])
  const [busyId, setBusyId] = useState<string | null>(null)

  async function reprocess(v: AdminErrorVideo) {
    setBusyId(v.id)
    try {
      await adminService.reprocessVideo(v.id)
      q.setData((prev) => (prev ?? []).filter((x) => x.id !== v.id))
      toast.success('Reprocessamento iniciado', v.nomeArquivo)
    } catch (err) {
      toast.error('Não foi possível reprocessar', err instanceof ApiError ? err.message : undefined)
    } finally {
      setBusyId(null)
    }
  }

  if (q.error && !q.data) return <ErrorState message={q.error} onRetry={q.refetch} />
  if (!q.data) return <Skeleton className="h-40 w-full rounded-2xl" />

  return (
    <div className="space-y-4">
      <Section
        title="Vídeos com falha no processamento"
        subtitle="Upload chegou, mas a versão otimizada/miniatura não foi gerada. O cliente pode não conseguir assistir."
      >
        {q.data.length === 0 ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <HardDrive className="size-4" /> Nenhum vídeo com erro. Tudo processando normalmente.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {q.data.map((v) => (
              <li key={v.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {v.nomeArquivo} <span className="font-normal text-muted-foreground">· v{v.versao}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {v.project.account.nomeAgencia} · {v.project.nome} · enviado {relative(v.criadoEm)}
                    {v.project.account.users[0] && ` · ${v.project.account.users[0].email}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => reprocess(v)}
                  disabled={busyId === v.id}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-60 sm:self-auto"
                >
                  {busyId === v.id ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  Reprocessar
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
