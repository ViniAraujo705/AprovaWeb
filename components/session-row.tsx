'use client'

/**
 * Linha de sessão ativa (dispositivo logado) + botão para encerrar todas de
 * uma vez. Compartilhado entre `/configuracoes` (sessões do próprio usuário)
 * e `/equipe` (owner encerrando a sessão de um colaborador).
 */
import { useState } from 'react'
import { Loader2, LogOut, MapPin, Monitor, Smartphone, Tablet } from 'lucide-react'
import type { Session } from '@/lib/types'
import { ApiError } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import { toast } from '@/lib/toast'

const sessionDeviceIcon: Record<Session['deviceType'], typeof Monitor> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  unknown: Monitor,
}

export function SessionRow({
  session,
  onRevoke,
  successMessage = 'Sessão encerrada',
}: {
  session: Session
  onRevoke: (id: string) => Promise<void>
  successMessage?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const Icon = sessionDeviceIcon[session.deviceType]

  async function revoke() {
    setBusy(true)
    setError(null)
    try {
      await onRevoke(session.id)
      toast.success(successMessage)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao encerrar a sessão.')
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{session.device}</span>
            {session.current && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400 ring-1 ring-emerald-500/30">
                Sessão atual
              </span>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {session.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" /> {session.location}
              </span>
            )}
            {session.ip && <span>· {session.ip}</span>}
            <span>
              · {session.current ? 'ativa agora' : `última atividade ${timeAgo(session.lastActiveAt)}`}
            </span>
          </p>
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      </div>

      {!session.current && (
        <div className="flex items-center gap-2">
          {confirming ? (
            <>
              <button
                type="button"
                onClick={revoke}
                disabled={busy}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-destructive px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
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
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70"
            >
              <LogOut className="size-3.5" /> Encerrar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function RevokeAllSessionsButton({
  onRevokeAll,
  label = 'Encerrar outras sessões',
  successMessage = 'Outras sessões encerradas',
}: {
  onRevokeAll: () => Promise<void>
  label?: string
  successMessage?: string
}) {
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function revokeAll() {
    setBusy(true)
    setError(null)
    try {
      await onRevokeAll()
      toast.success(successMessage)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao encerrar as sessões.')
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={revokeAll}
            disabled={busy}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-destructive px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
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
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70"
    >
      <LogOut className="size-3.5" /> {label}
    </button>
  )
}
