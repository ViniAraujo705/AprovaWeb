'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react'
import { adminService } from '@/lib/services'
import {
  planLabel,
  type AdminAccountRow,
  type AdminDashboard,
  type AdminSituacao,
  type PlanId,
} from '@/lib/types'
import { EmptyState, ErrorState, Skeleton } from '@/components/states'
import { PageHeader, StatCard } from '@/components/page-header'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'

/* --------------------------------- format --------------------------------- */

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const money = (n: number | null | undefined) => brl.format(n ?? 0)
/** Valor em R$ no StatCard: menor no celular para caber em 2 colunas. */
const bigMoney = (n: number | null | undefined) => (
  <span className="text-[22px] sm:text-3xl xl:text-4xl">{money(n)}</span>
)
const num = (n: number | null | undefined) => (n ?? 0).toLocaleString('pt-BR')

function date(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function relative(iso: string | null | undefined) {
  if (!iso) return 'nunca'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'hoje'
  if (days === 1) return 'ontem'
  if (days < 30) return `há ${days} dias`
  const months = Math.floor(days / 30)
  return months === 1 ? 'há 1 mês' : `há ${months} meses`
}

const monthShort = (ym: string) =>
  new Date(`${ym}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')

function pct(part: number, total: number) {
  if (!total) return '0%'
  return `${Math.round((part / total) * 100)}%`
}

function delta(current: number, previous: number) {
  if (!previous) return current ? 'novo' : null
  const d = Math.round(((current - previous) / previous) * 100)
  return `${d > 0 ? '+' : ''}${d}% vs mês anterior`
}

/* --------------------------------- labels --------------------------------- */

const situacaoLabel: Record<AdminSituacao, string> = {
  pagante: 'Em dia',
  inadimplente: 'Devendo',
  checkout_pendente: 'Checkout pendente',
  cortesia: 'Cortesia',
  gratis: 'Grátis',
}

const situacaoHint: Record<AdminSituacao, string> = {
  pagante: 'Assinatura paga e ativa',
  inadimplente: 'Cobrança vencida na Asaas',
  checkout_pendente: 'Abriu o checkout e não pagou',
  cortesia: 'Plano pago sem assinatura (manual ou promoção)',
  gratis: 'Sem assinatura',
}

const situacaoStyle: Record<AdminSituacao, string> = {
  pagante: 'bg-success-soft text-success-ink',
  inadimplente: 'bg-danger-soft text-danger-ink',
  checkout_pendente: 'bg-warning-soft text-warning-ink',
  cortesia: 'bg-secondary text-foreground ring-1 ring-border',
  gratis: 'bg-secondary text-muted-foreground',
}

const situacaoDot: Record<AdminSituacao, string> = {
  pagante: 'bg-success',
  inadimplente: 'bg-danger',
  checkout_pendente: 'bg-warning',
  cortesia: 'bg-foreground/60',
  gratis: 'bg-muted-foreground/40',
}

const SITUACOES: AdminSituacao[] = ['pagante', 'inadimplente', 'checkout_pendente', 'cortesia', 'gratis']
const PLANS: PlanId[] = ['free', 'portfolio', 'pro', 'agencia']

/** Só conta com cobrança ativa (em dia ou devendo) tem plano/valor de assinatura. */
const billed = (c: AdminAccountRow) => c.situacao === 'pagante' || c.situacao === 'inadimplente'

function SituacaoBadge({ value }: { value: AdminSituacao }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', situacaoStyle[value])}>
      {situacaoLabel[value]}
    </span>
  )
}

/* ---------------------------------- view ---------------------------------- */

type Tab = 'geral' | 'contas' | 'financeiro' | 'devedores'

export function AdminView() {
  const q = useQuery<AdminDashboard>((signal) => adminService.dashboard(signal), [], { refetchOnFocus: true })
  const [tab, setTab] = useState<Tab>('geral')
  const [contasFilter, setContasFilter] = useState<AdminSituacao | 'todas'>('todas')
  const data = q.data

  const tabs: { id: Tab; label: string; count?: number; danger?: boolean }[] = [
    { id: 'geral', label: 'Visão geral' },
    { id: 'contas', label: 'Inscritos', count: data?.contas.length },
    { id: 'financeiro', label: 'Financeiro' },
    { id: 'devedores', label: 'Inadimplentes', count: data?.inadimplentes.length, danger: true },
  ]

  function openContas(filter: AdminSituacao | 'todas') {
    setContasFilter(filter)
    setTab('contas')
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <PageHeader
        eyebrow="Super admin"
        title="Painel da plataforma"
        description="Inscrições, assinaturas, receita e inadimplência de todas as agências."
        actions={
          <button
            type="button"
            onClick={q.refetch}
            disabled={q.loading}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-60"
          >
            <RefreshCw className={cn('size-4', q.loading && 'animate-spin')} />
            Atualizar
          </button>
        }
      />

      {data && (
        <p className="mt-3 text-xs text-muted-foreground">
          Atualizado às {new Date(data.geradoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      <div role="tablist" aria-label="Seções do painel" className="mt-6 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              tab === t.id
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[11px] tabular-nums',
                  t.danger && t.count > 0 ? 'bg-danger-soft text-danger-ink' : 'bg-secondary text-muted-foreground',
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {q.error && !data ? (
          <ErrorState message={q.error} onRetry={q.refetch} />
        ) : !data ? (
          <LoadingGrid />
        ) : tab === 'geral' ? (
          <Overview data={data} onOpenContas={openContas} onOpenDevedores={() => setTab('devedores')} />
        ) : tab === 'contas' ? (
          <Accounts data={data} filter={contasFilter} onFilter={setContasFilter} onChanged={q.refetch} />
        ) : tab === 'financeiro' ? (
          <Finance data={data} />
        ) : (
          <Debtors data={data} />
        )}
      </div>
    </div>
  )
}

function LoadingGrid() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

function AsaasWarning({ data }: { data: AdminDashboard }) {
  if (data.financeiro.asaas.disponivel) return null
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-warning-border bg-warning-soft px-4 py-3 text-sm text-warning-ink">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <p>
        Não consegui falar com a Asaas agora ({data.financeiro.asaas.erro ?? 'sem resposta'}). Valores recebidos e
        cobranças vencidas podem estar incompletos; o resto vem do banco.
      </p>
    </div>
  )
}

/* ------------------------------- visão geral ------------------------------ */

function Overview({
  data,
  onOpenContas,
  onOpenDevedores,
}: {
  data: AdminDashboard
  onOpenContas: (f: AdminSituacao | 'todas') => void
  onOpenDevedores: () => void
}) {
  const { inscricoes: i, financeiro: f } = data
  const devendo = data.inadimplentes.reduce((s, d) => s + d.valor, 0)
  const pagantes = data.situacoes.pagante ?? 0
  const recentes = data.contas.slice(0, 6)

  return (
    <div className="space-y-6">
      <AsaasWarning data={data} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Inscritos" value={num(i.total)} hint={`+${i.ultimos7} nos últimos 7 dias · ${i.hoje} hoje`} />
        <StatCard
          label="Assinantes pagando"
          value={num(pagantes)}
          tone="success"
          hint={`${pct(pagantes, i.total)} de conversão`}
        />
        <StatCard label="MRR" value={bigMoney(f.mrr)} hint={`ARR ${money(f.arr)} · ticket ${money(f.ticketMedio)}`} />
        <StatCard
          label="Devendo"
          value={bigMoney(devendo)}
          tone={data.inadimplentes.length ? 'danger' : 'default'}
          hint={
            data.inadimplentes.length ? (
              <button type="button" onClick={onOpenDevedores} className="font-medium underline underline-offset-2">
                {data.inadimplentes.length} {data.inadimplentes.length === 1 ? 'agência' : 'agências'} em atraso
              </button>
            ) : (
              'Ninguém em atraso'
            )
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Inscrições por dia" subtitle="Últimos 90 dias" className="lg:col-span-2">
          <BarChart
            data={i.porDia.map((d) => ({ key: d.dia, label: date(d.dia), value: d.total }))}
            format={num}
            tickEvery={15}
            tick={(d) => date(d.key).slice(0, 5)}
          />
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
            <MiniStat label="Este mês" value={num(i.mesAtual)} hint={delta(i.mesAtual, i.mesAnterior)} />
            <MiniStat label="Últimos 30 dias" value={num(i.ultimos30)} />
            <MiniStat label="E-mail confirmado" value={pct(i.emailConfirmado, i.total)} hint={`${i.emailConfirmado} de ${i.total}`} />
          </div>
        </Panel>

        <Panel title="Situação das contas" subtitle="Clique para ver a lista">
          <ul className="space-y-1">
            {SITUACOES.map((s) => {
              const n = data.situacoes[s] ?? 0
              return (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => onOpenContas(s)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-secondary"
                  >
                    <span className={cn('size-2 shrink-0 rounded-full', situacaoDot[s])} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">{situacaoLabel[s]}</span>
                      <span className="block truncate text-xs text-muted-foreground">{situacaoHint[s]}</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-foreground">{n}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <StackBar
            className="mt-4"
            parts={SITUACOES.map((s) => ({ value: data.situacoes[s] ?? 0, className: situacaoDot[s], label: situacaoLabel[s] }))}
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Planos em vigor" subtitle="O que cada conta está usando hoje">
          <ul className="space-y-3">
            {PLANS.map((p) => {
              const n = data.planos[p] ?? 0
              return (
                <li key={p}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{planLabel[p]}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {n} · {pct(n, i.total)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-foreground/70" style={{ width: pct(n, i.total) }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </Panel>

        <Panel title="Engajamento" subtitle="Último acesso do dono da agência">
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Ativos 7 dias" value={num(data.usuarios.ativos7d)} hint={pct(data.usuarios.ativos7d, i.total)} />
            <MiniStat label="Ativos 30 dias" value={num(data.usuarios.ativos30d)} hint={pct(data.usuarios.ativos30d, i.total)} />
            <MiniStat label="Usuários (com equipe)" value={num(data.usuarios.total)} />
            <MiniStat label="Suspensos" value={num(data.usuarios.suspensos)} />
            <MiniStat label="Vídeos enviados" value={num(data.contas.reduce((s, c) => s + c.videos, 0))} />
            <MiniStat label="Clientes cadastrados" value={num(data.contas.reduce((s, c) => s + c.clientes, 0))} />
          </div>
        </Panel>

        <Panel
          title="Últimos inscritos"
          action={
            <button type="button" onClick={() => onOpenContas('todas')} className="text-xs font-medium text-muted-foreground hover:text-foreground">
              Ver todos
            </button>
          }
        >
          {recentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguém se inscreveu ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recentes.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{c.agencia}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.owner?.email ?? 'sem dono'} · {relative(c.criadoEm)}
                    </p>
                  </div>
                  <SituacaoBadge value={c.situacao} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

/* --------------------------------- contas --------------------------------- */

type SortKey = 'criadoEm' | 'valorMensal' | 'ultimoAcesso' | 'agencia'

function Accounts({
  data,
  filter,
  onFilter,
  onChanged,
}: {
  data: AdminDashboard
  filter: AdminSituacao | 'todas'
  onFilter: (f: AdminSituacao | 'todas') => void
  onChanged: () => void
}) {
  const [search, setSearch] = useState('')
  const [plan, setPlan] = useState<PlanId | 'todos'>('todos')
  const [sort, setSort] = useState<SortKey>('criadoEm')
  const [open, setOpen] = useState<string | null>(null)

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = data.contas.filter(
      (c) =>
        (filter === 'todas' || c.situacao === filter) &&
        (plan === 'todos' || c.plano === plan) &&
        (!term ||
          c.agencia.toLowerCase().includes(term) ||
          c.owner?.nome.toLowerCase().includes(term) ||
          c.owner?.email.toLowerCase().includes(term)),
    )
    return [...list].sort((a, b) => {
      if (sort === 'agencia') return a.agencia.localeCompare(b.agencia, 'pt-BR')
      if (sort === 'valorMensal') return (billed(b) ? b.valorMensal : 0) - (billed(a) ? a.valorMensal : 0)
      const av = a[sort] ? new Date(a[sort]!).getTime() : 0
      const bv = b[sort] ? new Date(b[sort]!).getTime() : 0
      return bv - av
    })
  }, [data.contas, filter, plan, search, sort])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {(['todas', ...SITUACOES] as const).map((s) => {
          const n = s === 'todas' ? data.contas.length : (data.situacoes[s] ?? 0)
          return (
            <button
              key={s}
              type="button"
              onClick={() => onFilter(s)}
              aria-pressed={filter === s}
              className={cn(
                'inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                filter === s
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {s === 'todas' ? 'Todas' : situacaoLabel[s]}
              <span className="tabular-nums opacity-70">{n}</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar agência, nome ou e-mail"
            className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/40"
          />
        </label>
        <div className="flex gap-2">
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value as PlanId | 'todos')}
            aria-label="Filtrar por plano"
            className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none sm:flex-none"
          >
            <option value="todos">Todos os planos</option>
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {planLabel[p]}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Ordenar"
            className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none sm:flex-none"
          >
            <option value="criadoEm">Mais recentes</option>
            <option value="valorMensal">Maior valor</option>
            <option value="ultimoAcesso">Último acesso</option>
            <option value="agencia">Nome (A-Z)</option>
          </select>
          <button
            type="button"
            onClick={() => exportCsv(rows)}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-secondary"
          >
            <Download className="size-4" />
            <span className="hidden sm:inline">CSV</span>
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nenhuma conta encontrada" description="Ajuste a busca ou os filtros." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="hidden grid-cols-[minmax(0,2fr)_110px_130px_100px_110px_28px] gap-3 border-b border-border bg-secondary/50 px-4 py-2.5 text-xs font-medium text-muted-foreground lg:grid">
            <span>Agência</span>
            <span>Plano</span>
            <span>Situação</span>
            <span className="text-right">Valor/mês</span>
            <span>Inscrito em</span>
            <span />
          </div>
          <ul className="divide-y divide-border">
            {rows.map((c) => (
              <AccountRow
                key={c.id}
                row={c}
                open={open === c.id}
                onToggle={() => setOpen(open === c.id ? null : c.id)}
                onChanged={onChanged}
              />
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {rows.length} de {data.contas.length} contas · MRR filtrado {money(rows.filter((r) => r.situacao === 'pagante').reduce((s, r) => s + r.valorMensal, 0))}
      </p>
    </div>
  )
}

function AccountRow({
  row: c,
  open,
  onToggle,
  onChanged,
}: {
  row: AdminAccountRow
  open: boolean
  onToggle: () => void
  onChanged: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left hover:bg-secondary/40 lg:grid-cols-[minmax(0,2fr)_110px_130px_100px_110px_28px]"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">{c.agencia}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {c.owner ? `${c.owner.nome} · ${c.owner.email}` : 'sem dono'}
          </span>
        </span>
        <span className="hidden text-sm text-foreground lg:block">
          {planLabel[billed(c) && c.planoContratado ? c.planoContratado : c.plano]}
          {billed(c) && c.ciclo && (
            <span className="ml-1 text-xs text-muted-foreground">{c.ciclo === 'YEARLY' ? 'anual' : 'mensal'}</span>
          )}
        </span>
        <span className="justify-self-end lg:justify-self-start">
          <SituacaoBadge value={c.situacao} />
        </span>
        <span className="hidden text-right text-sm tabular-nums text-foreground lg:block">
          {billed(c) && c.valorMensal ? money(c.valorMensal) : '—'}
        </span>
        <span className="hidden text-sm text-muted-foreground lg:block">{date(c.criadoEm)}</span>
        <span className="col-span-2 flex items-center justify-between text-xs text-muted-foreground lg:col-span-1 lg:justify-end">
          <span className="lg:hidden">
            {planLabel[billed(c) && c.planoContratado ? c.planoContratado : c.plano]} ·{' '}
            {billed(c) && c.valorMensal ? `${money(c.valorMensal)}/mês` : 'sem cobrança'} · {date(c.criadoEm)}
          </span>
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      {open && <AccountDetail row={c} onChanged={onChanged} />}
    </li>
  )
}

function AccountDetail({ row: c, onChanged }: { row: AdminAccountRow; onChanged: () => void }) {
  const [plan, setPlan] = useState<PlanId>(c.plano)
  const [saving, setSaving] = useState(false)
  const [confirmSuspend, setConfirmSuspend] = useState(false)
  const [suspending, setSuspending] = useState(false)
  const suspended = c.owner?.status === 'suspenso'

  async function savePlan() {
    setSaving(true)
    try {
      await adminService.updatePlan(c.id, plan)
      toast.success(`Plano de ${c.agencia} alterado para ${planLabel[plan]}`)
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao trocar o plano.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleSuspend() {
    if (!c.owner) return
    if (!suspended && !confirmSuspend) {
      setConfirmSuspend(true)
      return
    }
    setSuspending(true)
    try {
      await adminService.updateUserStatus(c.owner.id, suspended ? 'active' : 'suspended')
      toast.success(suspended ? 'Acesso reativado' : 'Acesso suspenso')
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao atualizar o acesso.')
    } finally {
      setSuspending(false)
      setConfirmSuspend(false)
    }
  }

  return (
    <div className="space-y-4 border-t border-border bg-secondary/30 px-4 py-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
        <Field label="Responsável" value={c.owner?.nome ?? '—'} />
        <Field
          label="E-mail"
          value={
            c.owner ? (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(c.owner!.email)
                  toast.success('E-mail copiado')
                }}
                className="inline-flex max-w-full items-center gap-1 text-left hover:underline"
              >
                <span className="truncate">{c.owner.email}</span>
                <Copy className="size-3 shrink-0 text-muted-foreground" />
              </button>
            ) : (
              '—'
            )
          }
        />
        <Field label="Login" value={c.owner ? `${c.owner.login === 'email' ? 'E-mail e senha' : c.owner.login === 'google' ? 'Google' : 'Apple'}${c.owner.emailConfirmado ? '' : ' · e-mail não confirmado'}` : '—'} />
        <Field label="Último acesso" value={relative(c.ultimoAcesso)} />
        <Field label="Plano em vigor" value={planLabel[c.plano]} />
        <Field
          label={c.situacao === 'checkout_pendente' ? 'Tentou contratar' : 'Plano contratado'}
          value={c.planoContratado ? `${planLabel[c.planoContratado]} · ${money(c.valorCiclo)}/${c.ciclo === 'YEARLY' ? 'ano' : 'mês'}` : '—'}
        />
        <Field label="Em aberto" value={c.emAberto ? <span className="text-danger-ink">{money(c.emAberto)}</span> : '—'} />
        <Field label="Inscrito em" value={date(c.criadoEm)} />
        <Field label="Clientes" value={num(c.clientes)} />
        <Field label="Projetos" value={num(c.projetos)} />
        <Field label="Vídeos" value={num(c.videos)} />
        <Field label="Membros da equipe" value={num(c.membros)} />
      </dl>

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value as PlanId)}
            disabled={saving}
            aria-label="Novo plano"
            className="h-9 rounded-xl border border-border bg-card px-2.5 text-sm text-foreground outline-none disabled:opacity-50"
          >
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {planLabel[p]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={savePlan}
            disabled={saving || plan === c.plano}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            Trocar plano
          </button>
        </div>
        {c.owner && (
          <div className="flex items-center gap-2">
            {confirmSuspend && (
              <button
                type="button"
                onClick={() => setConfirmSuspend(false)}
                className="h-9 rounded-xl px-3 text-sm text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
            )}
            <button
              type="button"
              onClick={toggleSuspend}
              disabled={suspending}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium disabled:opacity-50',
                confirmSuspend
                  ? 'border-danger-border bg-danger-soft text-danger-ink'
                  : 'border-border bg-card text-foreground hover:bg-secondary',
              )}
            >
              {suspending && <Loader2 className="size-3.5 animate-spin" />}
              {suspended ? 'Reativar acesso' : confirmSuspend ? 'Confirmar suspensão' : 'Suspender acesso'}
            </button>
          </div>
        )}
      </div>
      {billed(c) && (
        <p className="text-xs text-muted-foreground">
          Esta conta tem assinatura na Asaas. Trocar o plano aqui não altera a cobrança, e um pagamento novo pode
          sobrescrever a troca manual.
        </p>
      )}
    </div>
  )
}

function exportCsv(rows: AdminAccountRow[]) {
  const header = ['Agência', 'Responsável', 'E-mail', 'Plano', 'Plano contratado', 'Ciclo', 'Situação', 'Valor/mês', 'Em aberto', 'Inscrito em', 'Último acesso', 'Clientes', 'Projetos', 'Vídeos']
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = rows.map((c) =>
    [
      c.agencia,
      c.owner?.nome,
      c.owner?.email,
      planLabel[c.plano],
      c.planoContratado ? planLabel[c.planoContratado] : '',
      c.ciclo === 'YEARLY' ? 'Anual' : c.ciclo === 'MONTHLY' ? 'Mensal' : '',
      situacaoLabel[c.situacao],
      c.valorMensal.toFixed(2).replace('.', ','),
      c.emAberto.toFixed(2).replace('.', ','),
      date(c.criadoEm),
      c.ultimoAcesso ? date(c.ultimoAcesso) : '',
      c.clientes,
      c.projetos,
      c.videos,
    ]
      .map(esc)
      .join(';'),
  )
  const blob = new Blob(['﻿' + [header.map(esc).join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `inscritos-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/* ------------------------------- financeiro ------------------------------- */

function Finance({ data }: { data: AdminDashboard }) {
  const f = data.financeiro
  const a = f.asaas
  return (
    <div className="space-y-6">
      <AsaasWarning data={data} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="MRR (receita recorrente)" value={bigMoney(f.mrr)} hint={`ARR ${money(f.arr)}`} />
        <StatCard
          label="Recebido este mês"
          value={bigMoney(a.recebidoMes)}
          tone="success"
          hint={delta(a.recebidoMes, a.recebidoMesAnterior) ?? `Mês passado ${money(a.recebidoMesAnterior)}`}
        />
        <StatCard label="A receber" value={bigMoney(a.aReceber)} hint="Cobranças geradas, ainda não vencidas" />
        <StatCard
          label="Vencido"
          value={bigMoney(a.vencido)}
          tone={a.vencido > 0 ? 'danger' : 'default'}
          hint={`MRR em risco ${money(f.mrrEmRisco)}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Receita recebida por mês" subtitle="Pagamentos confirmados na Asaas" className="lg:col-span-2">
          <BarChart
            data={a.receitaPorMes.map((m) => ({ key: m.mes, label: monthShort(m.mes), value: m.total }))}
            format={money}
            tickEvery={1}
            tick={(d) => d.label}
            highlightLast
          />
        </Panel>
        <Panel title="Resumo">
          <dl className="space-y-3 text-sm">
            <Row label="Assinantes pagando" value={num(f.assinantes)} />
            <Row label="Ticket médio" value={money(f.ticketMedio)} />
            <Row label="Saldo na Asaas" value={a.saldo === null ? '—' : money(a.saldo)} />
            <Row label="Checkouts não pagos" value={num(data.situacoes.checkout_pendente ?? 0)} />
            <Row label="Contas em cortesia" value={num(data.situacoes.cortesia ?? 0)} />
          </dl>
        </Panel>
      </div>

      <Panel title="Assinaturas por plano">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 font-medium">Plano</th>
                <th className="py-2 text-right font-medium">Assinantes</th>
                <th className="py-2 text-right font-medium">Mensais</th>
                <th className="py-2 text-right font-medium">Anuais</th>
                <th className="py-2 text-right font-medium">MRR</th>
                <th className="py-2 text-right font-medium">% do MRR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {f.porPlano.map((p) => (
                <tr key={p.plano}>
                  <td className="py-2.5 text-foreground">{planLabel[p.plano]}</td>
                  <td className="py-2.5 text-right tabular-nums">{p.assinantes}</td>
                  <td className="py-2.5 text-right tabular-nums text-muted-foreground">{p.mensais}</td>
                  <td className="py-2.5 text-right tabular-nums text-muted-foreground">{p.anuais}</td>
                  <td className="py-2.5 text-right tabular-nums text-foreground">{money(p.mrr)}</td>
                  <td className="py-2.5 text-right tabular-nums text-muted-foreground">{pct(p.mrr, f.mrr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Últimos pagamentos recebidos">
        {f.ultimosPagamentos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pagamento confirmado nos últimos 13 meses.</p>
        ) : (
          <ul className="divide-y divide-border">
            {f.ultimosPagamentos.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{p.agencia ?? 'Cliente fora do sistema'}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {date(p.data)} · {paymentMethod(p.forma)}
                    {p.descricao ? ` · ${p.descricao}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums text-success-ink">{money(p.valor)}</p>
                  {p.liquido !== null && <p className="text-[11px] tabular-nums text-muted-foreground">líq. {money(p.liquido)}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function paymentMethod(raw: string | null) {
  if (raw === 'CREDIT_CARD') return 'Cartão'
  if (raw === 'PIX') return 'Pix'
  if (raw === 'BOLETO') return 'Boleto'
  return raw ?? '—'
}

/* ------------------------------ inadimplentes ----------------------------- */

function Debtors({ data }: { data: AdminDashboard }) {
  const list = data.inadimplentes
  const total = list.reduce((s, d) => s + d.valor, 0)

  if (list.length === 0) {
    return (
      <div className="space-y-4">
        <AsaasWarning data={data} />
        <EmptyState title="Ninguém devendo" description="Nenhuma agência com cobrança vencida no momento." />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <AsaasWarning data={data} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label="Total em aberto" value={bigMoney(total)} tone="danger" />
        <StatCard label="Agências devendo" value={num(list.length)} />
        <StatCard
          label="Maior atraso"
          value={list[0]?.diasAtraso !== null && list[0]?.diasAtraso !== undefined ? `${list[0].diasAtraso} dias` : '—'}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <ul className="divide-y divide-border">
          {list.map((d) => (
            <li key={d.contaId} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{d.agencia}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {d.nome ?? '—'} · {d.email ?? '—'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {d.plano ? planLabel[d.plano] : '—'} {d.ciclo === 'YEARLY' ? 'anual' : 'mensal'} · último acesso {relative(d.ultimoAcesso)}
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 sm:justify-end">
                <div className="sm:text-right">
                  <p className="text-sm font-semibold tabular-nums text-danger-ink">{money(d.valor)}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.diasAtraso !== null
                      ? `${d.diasAtraso} ${d.diasAtraso === 1 ? 'dia' : 'dias'} · venceu ${date(d.vencimento)}`
                      : 'vencimento não informado'}
                    {d.cobrancas > 1 ? ` · ${d.cobrancas} cobranças` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {d.email && (
                    <button
                      type="button"
                      title="Copiar e-mail"
                      aria-label={`Copiar e-mail de ${d.agencia}`}
                      onClick={() => {
                        void navigator.clipboard?.writeText(d.email!)
                        toast.success('E-mail copiado')
                      }}
                      className="inline-flex size-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <Copy className="size-4" />
                    </button>
                  )}
                  {d.linkFatura && (
                    <a
                      href={d.linkFatura}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-secondary"
                    >
                      Fatura
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">
        Quem está devendo perde o plano pago automaticamente e volta ao Free até a cobrança ser paga. A Asaas segue
        tentando o cartão.
      </p>
    </div>
  )
}

/* -------------------------------- primitives ------------------------------ */

function Panel({
  title,
  subtitle,
  action,
  className,
  children,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn('rounded-2xl border border-border bg-card p-5', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function MiniStat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
      {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-foreground">{value}</dd>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  )
}

function StackBar({
  parts,
  className,
}: {
  parts: { value: number; className: string; label: string }[]
  className?: string
}) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  if (!total) return null
  return (
    <div className={cn('flex h-2 gap-0.5 overflow-hidden rounded-full', className)}>
      {parts
        .filter((p) => p.value > 0)
        .map((p) => (
          <span key={p.label} title={`${p.label}: ${p.value}`} className={p.className} style={{ width: `${(p.value / total) * 100}%` }} />
        ))}
    </div>
  )
}

interface BarDatum {
  key: string
  label: string
  value: number
}

function BarChart({
  data,
  format,
  tickEvery,
  tick,
  highlightLast,
}: {
  data: BarDatum[]
  format: (n: number) => string
  tickEvery: number
  tick: (d: BarDatum) => string
  highlightLast?: boolean
}) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.value))
  const shown = hover !== null ? data[hover] : null
  return (
    <div>
      <div className="mb-2 h-5 text-xs text-muted-foreground">
        {shown ? (
          <>
            <span className="font-medium text-foreground">{format(shown.value)}</span> · {shown.label}
          </>
        ) : (
          <>Máximo {format(max === 1 && !data.some((d) => d.value) ? 0 : max)}</>
        )}
      </div>
      <div className="flex h-40 items-end gap-px" onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <div
            key={d.key}
            onMouseEnter={() => setHover(i)}
            className="flex h-full min-w-0 flex-1 items-end"
            aria-label={`${d.label}: ${format(d.value)}`}
          >
            <span
              className={cn(
                'w-full rounded-t-sm transition-colors',
                hover === i
                  ? 'bg-foreground'
                  : highlightLast && i === data.length - 1
                    ? 'bg-foreground/70'
                    : d.value > 0
                      ? 'bg-muted-foreground/45'
                      : 'bg-muted-foreground/15',
              )}
              style={{ height: `${d.value > 0 ? Math.max(4, (d.value / max) * 100) : 2}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-px border-t border-border pt-2">
        {data.map((d, i) => (
          <span key={d.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-[10px] text-muted-foreground">
            {i % tickEvery === 0 ? tick(d) : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
