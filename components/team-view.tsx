'use client'

import { useState } from 'react'
import { UserPlus, Mail, Loader2, Check, Copy, Link2, Send, Trash2 } from 'lucide-react'
import { teamService } from '@/lib/services'
import {
  memberStatusLabel,
  teamRoleLabel,
  type MemberStatus,
  type TeamMember,
} from '@/lib/types'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const statusStyles: Record<MemberStatus, string> = {
  active: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30',
  invited: 'bg-primary/15 text-primary ring-1 ring-primary/30',
  suspended: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30',
}

export function TeamView() {
  const { data, loading, error, refetch, setData } = useQuery<TeamMember[]>(
    (signal) => teamService.members(signal),
    [],
  )
  const members = data ?? []

  function upsert(member: TeamMember) {
    setData((prev) => {
      const list = prev ?? []
      const exists = list.some((m) => m.id === member.id)
      return exists ? list.map((m) => (m.id === member.id ? member : m)) : [...list, member]
    })
  }

  function remove(id: string) {
    setData((prev) => (prev ?? []).filter((m) => m.id !== id))
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <h1 className="font-display text-4xl tracking-wide sm:text-5xl">EQUIPE</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Gerencie quem tem acesso à conta da agência.
      </p>

      {/* Convidar editor */}
      <InviteForm onInvited={upsert} />

      {/* Lista de membros */}
      <h2 className="mt-10 font-display text-2xl tracking-wide">MEMBROS</h2>
      <div className="mt-4">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : members.length === 0 ? (
          <EmptyState
            title="Nenhum membro ainda"
            description="Convide um editor pelo e-mail para colaborar nos vídeos."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[620px] text-sm">
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
                {members.map((m) => (
                  <MemberRow key={m.id} member={m} onChanged={upsert} onRemoved={remove} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function InviteForm({ onInvited }: { onInvited: (m: TeamMember) => void }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [inviteId, setInviteId] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

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
      const created = await teamService.invite(value)
      onInvited(created)
      setEmail('')
      setInviteId(created.id)
      setInviteUrl(created.inviteUrl ?? null)
      setEmailSent(false)
      setEmailError(null)
      setSent(true)
      setTimeout(() => setSent(false), 2500)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('Esse e-mail já faz parte da equipe.')
      } else {
        setError(err instanceof ApiError ? err.message : 'Não foi possível enviar o convite.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function copyInviteUrl() {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  async function sendEmail() {
    if (!inviteId) return
    setSendingEmail(true)
    setEmailError(null)
    try {
      await teamService.sendInviteEmail(inviteId)
      setEmailSent(true)
    } catch (err) {
      setEmailError(err instanceof ApiError ? err.message : 'Não foi possível enviar o e-mail.')
    } finally {
      setSendingEmail(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="mt-6 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <UserPlus className="size-4 text-primary" />
        Convidar novo editor
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!error}
            placeholder="editor@agencia.com"
            className={cn(
              'min-h-11 w-full rounded-lg border bg-secondary pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary',
              error ? 'border-destructive' : 'border-border',
            )}
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 font-display text-lg tracking-wide text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          CONVIDAR
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      {sent && (
        <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-emerald-400">
          <Check className="size-4" /> Convite criado.
        </p>
      )}
      {inviteUrl && (
        <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Link2 className="size-3.5" />
            Convite criado — envie por e-mail ou copie o link para o editor:
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded-md bg-background px-2.5 py-2 text-xs text-primary">
              {inviteUrl}
            </code>
            <button
              type="button"
              onClick={sendEmail}
              disabled={sendingEmail || emailSent}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {sendingEmail ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : emailSent ? (
                <Check className="size-3.5" />
              ) : (
                <Send className="size-3.5" />
              )}
              {emailSent ? 'E-mail enviado' : 'Enviar e-mail'}
            </button>
            <button
              type="button"
              onClick={copyInviteUrl}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-medium text-background hover:opacity-90"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          {emailError && <p className="mt-2 text-xs text-destructive">{emailError}</p>}
        </div>
      )}
    </form>
  )
}

function MemberRow({
  member,
  onChanged,
  onRemoved,
}: {
  member: TeamMember
  onChanged: (m: TeamMember) => void
  onRemoved: (id: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmingPromote, setConfirmingPromote] = useState(false)

  async function setStatus(status: MemberStatus) {
    setBusy(true)
    setError(null)
    try {
      const updated = await teamService.updateStatus(member.id, status)
      onChanged(updated)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao atualizar.')
    } finally {
      setBusy(false)
    }
  }

  async function cancelInvite() {
    setBusy(true)
    setError(null)
    try {
      await teamService.cancelInvite(member.id)
      onRemoved(member.id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao cancelar convite.')
      setBusy(false)
    }
  }

  async function promote() {
    setBusy(true)
    setError(null)
    try {
      const updated = await teamService.promoteToOwner(member.id)
      onChanged(updated)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao promover a owner.')
    } finally {
      setBusy(false)
      setConfirmingPromote(false)
    }
  }

  const isOwner = member.teamRole === 'owner'
  const isPendingInvite = member.status === 'invited'
  const target: MemberStatus = member.status === 'suspended' ? 'active' : 'suspended'

  return (
    <tr className="text-foreground">
      <td className="px-4 py-3 font-medium">{member.name || '—'}</td>
      <td className="px-4 py-3 text-muted-foreground">{member.email}</td>
      <td className="px-4 py-3">
        <span
          className={cn(
            'rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            isOwner ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground',
          )}
        >
          {teamRoleLabel[member.teamRole]}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
            statusStyles[member.status],
          )}
        >
          {memberStatusLabel[member.status]}
        </span>
      </td>
      <td className="px-4 py-3">
        {isOwner ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : isPendingInvite ? (
          <>
            {confirming ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelInvite}
                  disabled={busy}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-destructive px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  className="inline-flex min-h-9 items-center rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70"
              >
                <Trash2 className="size-3.5" /> Cancelar convite
              </button>
            )}
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStatus(target)}
                disabled={busy}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
              >
                {busy && <Loader2 className="size-3.5 animate-spin" />}
                {target === 'suspended' ? 'Suspender' : 'Reativar'}
              </button>
              {confirmingPromote ? (
                <>
                  <button
                    type="button"
                    onClick={promote}
                    disabled={busy}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {busy && <Loader2 className="size-3.5 animate-spin" />}
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingPromote(false)}
                    disabled={busy}
                    className="inline-flex min-h-9 items-center rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingPromote(true)}
                  disabled={busy}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
                >
                  Promover a owner
                </button>
              )}
            </div>
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </>
        )}
      </td>
    </tr>
  )
}
