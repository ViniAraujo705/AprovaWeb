'use client'

/**
 * Integrações (/configuracoes/integracoes) — owner-only. Google Drive já tem
 * API real no backend (OAuth em modo de testes: só contas testadoras
 * conseguem conectar) — ver `googleDriveService`. WhatsApp e Canva ainda não
 * têm endpoint, então continuam com estado local/"em breve".
 */
import { useState } from 'react'
import Image from 'next/image'
import { Check, Loader2, Plug, Clock } from 'lucide-react'
import { SiWhatsapp } from 'react-icons/si'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { FadeIn } from '@/components/motion'
import { ApiError } from '@/lib/api'
import { googleDriveService } from '@/lib/services'
import { useQuery } from '@/lib/use-query'

export function IntegrationsView() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
      <h1 className="font-display text-4xl tracking-wide sm:text-5xl">INTEGRAÇÕES</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        O Check conversa com as ferramentas que já fazem parte da rotina da sua equipe, reduzindo
        a necessidade de alternar entre várias plataformas.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        <WhatsAppCard />
        <GoogleDriveCard />
        <CanvaCard />
      </div>
    </div>
  )
}

function IntegrationShell({
  icon,
  iconClassName,
  name,
  description,
  badge,
  action,
  children,
}: {
  icon: React.ReactNode
  iconClassName?: string
  name: string
  description: string
  badge: React.ReactNode
  action: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <FadeIn y={6}>
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                'grid size-10 shrink-0 place-items-center rounded-xl bg-secondary',
                iconClassName,
              )}
            >
              {icon}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{name}</span>
                {badge}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
          {action}
        </div>
        {children}
      </div>
    </FadeIn>
  )
}

function StatusBadge({ connected }: { connected: boolean }) {
  if (!connected) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
      <Check className="size-3" /> Conectado
    </span>
  )
}

function ComingSoonBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
      <Clock className="size-3" /> Em breve
    </span>
  )
}

function ConnectButton({
  connected,
  busy,
  onClick,
}: {
  connected: boolean
  busy: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium disabled:opacity-50',
        connected
          ? 'bg-secondary text-foreground hover:bg-destructive/10 hover:text-destructive'
          : 'bg-primary text-primary-foreground hover:opacity-90',
      )}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : connected ? null : (
        <Plug className="size-3.5" />
      )}
      {connected ? 'Desconectar' : 'Conectar'}
    </button>
  )
}

const WHATSAPP_NOTIFICATIONS = [
  { key: 'avisos', label: 'Avisos gerais' },
  { key: 'aprovacoes', label: 'Aprovações' },
  { key: 'alteracoes', label: 'Pedidos de alteração' },
  { key: 'entregas', label: 'Entregas' },
  { key: 'atividades', label: 'Atividades da equipe' },
] as const

function WhatsAppCard() {
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notify, setNotify] = useState<Record<string, boolean>>({
    avisos: true,
    aprovacoes: true,
    alteracoes: true,
    entregas: true,
    atividades: false,
  })

  async function toggle() {
    setBusy(true)
    await new Promise((r) => setTimeout(r, 500))
    const next = !connected
    setConnected(next)
    toast[next ? 'success' : 'info'](next ? 'WhatsApp conectado' : 'WhatsApp desconectado')
    setBusy(false)
  }

  return (
    <IntegrationShell
      icon={<SiWhatsapp className="size-5 text-[#25D366]" />}
      name="WhatsApp"
      description="Avisos, notificações de aprovação, alterações, entregas e atividades direto no WhatsApp."
      badge={<StatusBadge connected={connected} />}
      action={<ConnectButton connected={connected} busy={busy} onClick={toggle} />}
    >
      {connected && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs font-medium text-foreground">Notificar por WhatsApp quando:</p>
          <div className="mt-2 flex flex-col gap-2">
            {WHATSAPP_NOTIFICATIONS.map((item) => (
              <label
                key={item.key}
                className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={notify[item.key]}
                  onChange={(e) => setNotify((prev) => ({ ...prev, [item.key]: e.target.checked }))}
                />
                {item.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </IntegrationShell>
  )
}

function GoogleDriveCard() {
  const { data: status, loading } = useQuery((signal) => googleDriveService.getStatus(signal))
  const [busy, setBusy] = useState(false)
  const connected = status?.connected ?? false

  async function connect() {
    setBusy(true)
    try {
      const url = await googleDriveService.getConnectUrl()
      if (!url) throw new Error('Resposta de conexão do Google Drive sem URL.')
      window.location.href = url
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível iniciar a conexão com o Google Drive.',
      )
      setBusy(false)
    }
  }

  return (
    <IntegrationShell
      icon={<Image src="/icons/google-drive.svg" alt="" width={22} height={22} />}
      name="Google Drive"
      description="Conecte pastas e arquivos do Drive aos seus projetos e entregas no Check."
      badge={<StatusBadge connected={connected} />}
      action={
        connected ? null : (
          <ConnectButton connected={false} busy={busy || loading} onClick={connect} />
        )
      }
    >
      {connected && (
        <p className="mt-4 flex items-center gap-1.5 border-t border-border pt-4 text-xs text-muted-foreground">
          <Check className="size-3.5 shrink-0 text-emerald-400" />
          {status?.email
            ? `Conectado como ${status.email}. Suas pastas do Drive já podem ser vinculadas ao criar um projeto.`
            : 'Suas pastas do Drive já podem ser vinculadas ao criar um projeto.'}
        </p>
      )}
    </IntegrationShell>
  )
}

function CanvaCard() {
  return (
    <IntegrationShell
      icon={<Image src="/icons/canva.svg" alt="" width={24} height={24} className="rounded-full" />}
      name="Canva"
      description="Integração com o fluxo de criação e aprovação de peças, conforme viabilidade técnica."
      badge={<ComingSoonBadge />}
      action={
        <button
          type="button"
          disabled
          title="Em breve, conforme viabilidade técnica"
          className="inline-flex min-h-9 shrink-0 cursor-not-allowed items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-muted-foreground opacity-60"
        >
          Em breve
        </button>
      }
    />
  )
}
