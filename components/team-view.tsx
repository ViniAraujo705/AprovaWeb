'use client'

/**
 * Configurações › Agência › Equipe (owner). Convidar editores, acompanhar os
 * convites e gerenciar quem já está na conta (suspender, reativar, promover a
 * dono, ver/encerrar sessões). Layout comum em `settings-ui.tsx`.
 */

import { useState } from 'react'
import {
  UserPlus,
  Mail,
  Loader2,
  Check,
  Copy,
  Send,
  Trash2,
  Monitor,
  PauseCircle,
  PlayCircle,
  Crown,
  Search,
} from 'lucide-react'
import { teamService } from '@/lib/services'
import { teamRoleLabel, type MemberStatus, type Session, type TeamMember } from '@/lib/types'
import { ErrorState, Skeleton } from '@/components/states'
import { SessionRow, RevokeAllSessionsButton } from '@/components/session-row'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { usePlanLimit } from '@/components/plan-limit-provider'
import { ClientAvatar } from '@/components/client-avatar'
import { useAuth } from '@/components/auth-provider'
import { AnimatePresence } from '@/components/motion'
import { ActionMenu, ConfirmDialog, SettingsCard, SettingsPage, settingsInputClass } from '@/components/settings-ui'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Convite pendente cujo prazo (`expiresAt`) já passou — precisa ser reenviado. */
function isInviteExpired(member: TeamMember): boolean {
  return member.status === 'invited' && !!member.expiresAt && new Date(member.expiresAt).getTime() < Date.now()
}

function formatDate(iso: string | null, opts: Intl.DateTimeFormatOptions): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('pt-BR', opts).replace('.', '')
}

type Confirm =
  | { kind: 'suspend' | 'reactivate' | 'promote' | 'cancel'; member: TeamMember }
  | null

export function TeamView() {
  const { data, loading, error, refetch, setData } = useQuery<TeamMember[]>((signal) => teamService.members(signal), [])
  const members = data ?? []
  const [query, setQuery] = useState('')
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [sessionsOf, setSessionsOf] = useState<string | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const { refetch: refetchPlan } = usePlanLimit()

  function upsert(member: TeamMember) {
    setData((prev) => {
      const list = prev ?? []
      return list.some((m) => m.id === member.id) ? list.map((m) => (m.id === member.id ? member : m)) : [...list, member]
    })
  }

  const q = query.trim().toLowerCase()
  const match = (m: TeamMember) => !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
  // Dono primeiro, depois ativos, depois suspensos; nome em ordem alfabética.
  const rank = (m: TeamMember) => (m.teamRole === 'owner' ? 0 : m.status === 'active' ? 1 : 2)
  const people = members
    .filter((m) => m.status !== 'invited' && match(m))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
  const invites = members.filter((m) => m.status === 'invited' && match(m))
  const totalPeople = members.filter((m) => m.status !== 'invited').length

  async function resend(member: TeamMember) {
    setResendingId(member.id)
    try {
      // Mesmo id do convite — o backend renova expiresAt e reenvia o e-mail.
      upsert(await teamService.sendInviteEmail(member.id))
      toast.success('Convite reenviado', 'Um novo prazo de aceite começou a contar.')
    } catch (err) {
      toast.error('Não foi possível reenviar', err instanceof ApiError ? err.message : undefined)
    } finally {
      setResendingId(null)
    }
  }

  async function runConfirm(c: NonNullable<Confirm>) {
    try {
      if (c.kind === 'cancel') {
        await teamService.cancelInvite(c.member.id)
        setData((prev) => (prev ?? []).filter((m) => m.id !== c.member.id))
        refetchPlan()
        toast.success('Convite cancelado')
      } else if (c.kind === 'promote') {
        upsert(await teamService.promoteToOwner(c.member.id))
        toast.success(`${c.member.name || c.member.email} agora é dono da conta`)
      } else {
        const status: MemberStatus = c.kind === 'suspend' ? 'suspended' : 'active'
        upsert(await teamService.updateStatus(c.member.id, status))
        if (status === 'suspended' && sessionsOf === c.member.id) setSessionsOf(null)
        toast.success(status === 'suspended' ? 'Acesso suspenso' : 'Acesso reativado')
      }
      setConfirm(null)
    } catch (err) {
      toast.error('Não foi possível concluir', err instanceof ApiError ? err.message : undefined)
    }
  }

  return (
    <SettingsPage title="Equipe" description="Quem tem acesso à conta da agência e o que cada pessoa pode fazer.">
      <InviteCard onInvited={upsert} />

      <SettingsCard
        title={`Membros${loading ? '' : ` (${totalPeople})`}`}
        description="O dono gerencia equipe, marca e plano. Editores trabalham em vídeos, projetos e no Kanban."
        aside={
          members.length > 6 ? (
            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar pessoa"
                aria-label="Buscar pessoa"
                className={cn(settingsInputClass, 'h-9 pl-9')}
              />
            </div>
          ) : null
        }
      >
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} className="py-8" />
        ) : people.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{q ? 'Ninguém com esse nome ou e-mail.' : 'Só você por enquanto.'}</p>
        ) : (
          <ul className="-my-1 divide-y divide-border">
            {people.map((m) => (
              <MemberItem
                key={m.id}
                member={m}
                sessionsOpen={sessionsOf === m.id}
                onToggleSessions={() => setSessionsOf((cur) => (cur === m.id ? null : m.id))}
                onAction={(kind) => setConfirm({ kind, member: m })}
              />
            ))}
          </ul>
        )}
      </SettingsCard>

      {!loading && !error && invites.length > 0 && (
        <SettingsCard title={`Convites pendentes (${invites.length})`} description="A pessoa entra na equipe quando aceita o convite pelo link.">
          <ul className="-my-1 divide-y divide-border">
            {invites.map((m) => (
              <InviteItem
                key={m.id}
                member={m}
                resending={resendingId === m.id}
                onResend={() => void resend(m)}
                onCancel={() => setConfirm({ kind: 'cancel', member: m })}
              />
            ))}
          </ul>
        </SettingsCard>
      )}

      <AnimatePresence>
        {confirm && <ConfirmFor confirm={confirm} onConfirm={() => runConfirm(confirm)} onClose={() => setConfirm(null)} />}
      </AnimatePresence>
    </SettingsPage>
  )
}

function ConfirmFor({ confirm, onConfirm, onClose }: { confirm: NonNullable<Confirm>; onConfirm: () => Promise<void>; onClose: () => void }) {
  const who = <strong className="font-semibold text-foreground">{confirm.member.name || confirm.member.email}</strong>
  const copy = {
    suspend: {
      title: 'Suspender acesso',
      description: <>{who} não consegue mais entrar na conta até ser reativado(a). Nada do que a pessoa fez é apagado.</>,
      label: 'Suspender',
      danger: true,
    },
    reactivate: {
      title: 'Reativar acesso',
      description: <>{who} volta a entrar na conta com o mesmo papel de antes.</>,
      label: 'Reativar',
      danger: false,
    },
    promote: {
      title: 'Tornar dono da conta',
      description: (
        <>
          {who} passa a gerenciar equipe, marca, integrações e plano, com os mesmos poderes que você. Só faça isso com
          quem responde pela agência.
        </>
      ),
      label: 'Tornar dono',
      danger: false,
    },
    cancel: {
      title: 'Cancelar convite',
      description: <>O link enviado para {who} deixa de funcionar. Dá para convidar de novo depois.</>,
      label: 'Cancelar convite',
      danger: true,
    },
  }[confirm.kind]
  return <ConfirmDialog title={copy.title} description={copy.description} confirmLabel={copy.label} danger={copy.danger} onConfirm={onConfirm} onClose={onClose} />
}

function RoleBadge({ owner }: { owner: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-[6px] px-2 text-xs font-medium',
        owner ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground',
      )}
    >
      {owner && <Crown className="size-3" />}
      {teamRoleLabel[owner ? 'owner' : 'editor']}
    </span>
  )
}

function StatusLabel({ tone, children }: { tone: 'ok' | 'warn' | 'danger' | 'muted'; children: React.ReactNode }) {
  const dot = { ok: 'bg-success', warn: 'bg-warning', danger: 'bg-danger', muted: 'bg-muted-foreground' }[tone]
  const text = { ok: 'text-muted-foreground', warn: 'text-warning-ink', danger: 'text-danger-ink', muted: 'text-muted-foreground' }[tone]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', text)}>
      <span className={cn('size-1.5 rounded-full', dot)} aria-hidden="true" />
      {children}
    </span>
  )
}

function MemberItem({
  member,
  sessionsOpen,
  onToggleSessions,
  onAction,
}: {
  member: TeamMember
  sessionsOpen: boolean
  onToggleSessions: () => void
  onAction: (kind: 'suspend' | 'reactivate' | 'promote') => void
}) {
  const { user } = useAuth()
  // A listagem ainda não traz foto pra todo mundo; a própria linha usa a da sessão.
  const isSelf = !!user && user.email.toLowerCase() === member.email.toLowerCase()
  const photoUrl = member.photoUrl ?? (isSelf ? user.photoUrl : null)
  const isOwner = member.teamRole === 'owner'
  const suspended = member.status === 'suspended'
  const since = formatDate(member.createdAt, { month: 'short', year: 'numeric' })

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <ClientAvatar name={member.name || member.email} photoUrl={photoUrl} seed={member.id} size="md" className={cn(suspended && 'opacity-50')} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={cn('truncate text-sm font-medium', suspended ? 'text-muted-foreground' : 'text-foreground')}>
              {member.name || member.email}
            </span>
            {isSelf && <span className="rounded-[4px] bg-secondary px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Você</span>}
          </p>
          <p className="truncate text-xs text-muted-foreground">{member.email}</p>
        </div>
        <div className="hidden w-36 shrink-0 whitespace-nowrap sm:block">
          {suspended ? <StatusLabel tone="warn">Suspenso</StatusLabel> : <StatusLabel tone="ok">{since ? `Desde ${since}` : 'Ativo'}</StatusLabel>}
        </div>
        <div className="w-[4.5rem] shrink-0 text-right">
          <RoleBadge owner={isOwner} />
        </div>
        <div className="w-9 shrink-0">
          {!isOwner && (
            <ActionMenu
              label={`Ações para ${member.name || member.email}`}
              items={[
                { label: sessionsOpen ? 'Ocultar sessões' : 'Ver sessões', icon: Monitor, onSelect: onToggleSessions },
                { label: 'Tornar dono da conta', icon: Crown, onSelect: () => onAction('promote'), hidden: suspended },
                suspended
                  ? { label: 'Reativar acesso', icon: PlayCircle, onSelect: () => onAction('reactivate') }
                  : { label: 'Suspender acesso', icon: PauseCircle, onSelect: () => onAction('suspend'), danger: true },
              ]}
            />
          )}
        </div>
      </div>
      {suspended && (
        <p className="mt-1 pl-[2.75rem] sm:hidden">
          <StatusLabel tone="warn">Suspenso</StatusLabel>
        </p>
      )}
      {sessionsOpen && !isOwner && (
        <div className="mt-3 rounded-[12px] border border-border bg-secondary/30 p-3 sm:ml-11">
          <MemberSessionsPanel memberId={member.id} memberName={member.name || member.email} onClose={onToggleSessions} />
        </div>
      )}
    </li>
  )
}

function InviteItem({
  member,
  resending,
  onResend,
  onCancel,
}: {
  member: TeamMember
  resending: boolean
  onResend: () => void
  onCancel: () => void
}) {
  const expired = isInviteExpired(member)
  const sent = formatDate(member.createdAt, { day: 'numeric', month: 'short' })
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-border text-muted-foreground">
        <Mail className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{member.email}</p>
        <p className="mt-0.5">
          {expired ? (
            <StatusLabel tone="danger">Convite expirado</StatusLabel>
          ) : (
            <StatusLabel tone="muted">{sent ? `Enviado em ${sent}` : 'Aguardando aceite'}</StatusLabel>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onResend}
        disabled={resending}
        className={cn(
          'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-3 text-sm font-medium transition-colors disabled:opacity-50',
          expired ? 'bg-foreground text-background hover:opacity-90' : 'border border-border text-foreground hover:bg-secondary',
        )}
      >
        {resending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        <span className="hidden sm:inline">Reenviar</span>
      </button>
      <ActionMenu
        label={`Ações do convite para ${member.email}`}
        items={[{ label: 'Cancelar convite', icon: Trash2, onSelect: onCancel, danger: true }]}
      />
    </li>
  )
}

function InviteCard({ onInvited }: { onInvited: (m: TeamMember) => void }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<{ id: string; email: string; url: string | null } | null>(null)
  const [copied, setCopied] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const { handlePlanLimitError, refetch: refetchPlan, planStatus } = usePlanLimit()

  const maxExtra = planStatus?.limits.maxExtraEditors ?? null
  const usedExtra = planStatus?.usage.extraEditors ?? 0
  const hint =
    maxExtra === null
      ? planStatus
        ? 'Seu plano não limita o número de editores.'
        : 'Editores trabalham nos vídeos, projetos e no Kanban.'
      : `Editores extras no plano: ${usedExtra} de ${maxExtra}.`

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const value = email.trim()
    if (!EMAIL_RE.test(value)) {
      setError('Informe um e-mail válido.')
      return
    }
    setSubmitting(true)
    try {
      const member = await teamService.invite(value)
      onInvited(member)
      // O back decide se este convite conta como "editor extra" — recarrega o
      // plano em vez de tentar adivinhar o delta no front.
      refetchPlan()
      setEmail('')
      setCreated({ id: member.id, email: value, url: member.inviteUrl ?? null })
      setEmailSent(false)
      setCopied(false)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError('Esse e-mail já faz parte da equipe.')
      else if (!handlePlanLimitError(err)) setError(err instanceof ApiError ? err.message : 'Não foi possível criar o convite.')
    } finally {
      setSubmitting(false)
    }
  }

  async function copyLink() {
    if (!created?.url) return
    try {
      await navigator.clipboard.writeText(created.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  async function sendEmail() {
    if (!created) return
    setSendingEmail(true)
    try {
      await teamService.sendInviteEmail(created.id)
      setEmailSent(true)
      toast.success('Convite enviado', 'O e-mail chega em instantes.')
    } catch (err) {
      toast.error('Não foi possível enviar o e-mail', err instanceof ApiError ? err.message : undefined)
    } finally {
      setSendingEmail(false)
    }
  }

  return (
    <SettingsCard title="Convidar editor" description="Crie o convite e mande por e-mail ou copie o link para enviar no WhatsApp." footer={<p className="text-xs text-muted-foreground">{hint}</p>}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!error}
            aria-label="E-mail do editor"
            placeholder="editor@agencia.com"
            className={cn(settingsInputClass, 'pl-9')}
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !email.trim()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          Criar convite
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      {created && (
        <div className="mt-4 rounded-[12px] border border-border bg-secondary/40 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Check className="size-4 text-success-ink" /> Convite criado para {created.email}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Ainda não enviamos nada. Escolha como a pessoa vai receber:</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            {created.url && (
              <code className="min-w-0 flex-1 truncate rounded-[8px] border border-border bg-background px-2.5 py-2 font-mono text-xs text-muted-foreground">
                {created.url}
              </code>
            )}
            <div className="flex gap-2">
              {created.url && (
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary sm:flex-none"
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? 'Copiado' : 'Copiar link'}
                </button>
              )}
              <button
                type="button"
                onClick={sendEmail}
                disabled={sendingEmail || emailSent}
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] bg-foreground px-3 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60 sm:flex-none"
              >
                {sendingEmail ? <Loader2 className="size-4 animate-spin" /> : emailSent ? <Check className="size-4" /> : <Send className="size-4" />}
                {emailSent ? 'Enviado' : 'Enviar e-mail'}
              </button>
            </div>
          </div>
        </div>
      )}
    </SettingsCard>
  )
}

function MemberSessionsPanel({ memberId, memberName, onClose }: { memberId: string; memberName: string; onClose: () => void }) {
  const { data, loading, error, refetch, setData } = useQuery<Session[]>((signal) => teamService.memberSessions(memberId, signal), [memberId])
  const sessions = data ?? []

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Aparelhos em que {memberName} está com a conta aberta</p>
        <div className="flex items-center gap-2">
          {!loading && !error && sessions.length > 0 && (
            <RevokeAllSessionsButton
              label="Encerrar todas"
              successMessage="Sessões encerradas"
              onRevokeAll={async () => {
                await teamService.revokeAllMemberSessions(memberId)
                setData([])
              }}
            />
          )}
          <button type="button" onClick={onClose} className="rounded-[8px] px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground">
            Fechar
          </button>
        </div>
      </div>
      <div className="mt-2">
        {loading ? (
          <Skeleton className="h-14 w-full" />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} className="py-6" />
        ) : sessions.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">Nenhuma sessão ativa.</p>
        ) : (
          <div className="divide-y divide-border">
            {sessions.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                onRevoke={async (id) => {
                  await teamService.revokeMemberSession(memberId, id)
                  setData((prev) => (prev ?? []).filter((item) => item.id !== id))
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
