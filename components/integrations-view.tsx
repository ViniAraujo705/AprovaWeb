'use client'

/**
 * Integrações (/configuracoes/integracoes) — owner-only. Google Drive já tem
 * API real no backend (OAuth em modo de testes: só contas testadoras
 * conseguem conectar) — ver `googleDriveService`. WhatsApp e Canva ainda não
 * existem: aparecem como "em breve", sem ação.
 */
import { useState } from 'react'
import Image from 'next/image'
import { Check, Loader2, Plug, Clock, RefreshCw } from 'lucide-react'
import { SiWhatsapp } from 'react-icons/si'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { FadeIn } from '@/components/motion'
import { ApiError } from '@/lib/api'
import { googleCalendarService, googleDriveService } from '@/lib/services'
import { useQuery } from '@/lib/use-query'

export function IntegrationsView() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <p className="eyebrow">Conta da agência</p>
      <h1 className="mt-3 font-display text-4xl leading-[1.05] sm:text-5xl">Integrações</h1>
      <p className="mt-3 max-w-2xl text-base text-muted-foreground">
        O Check conversa com as ferramentas que já fazem parte da rotina da sua equipe, reduzindo
        a necessidade de alternar entre várias plataformas.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        <GoogleDriveCard />
        <GoogleCalendarCard />
        <WhatsAppCard />
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
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-ink">
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

function ComingSoonButton() {
  return (
    <button
      type="button"
      disabled
      title="Em breve"
      className="inline-flex min-h-9 shrink-0 cursor-not-allowed items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-muted-foreground opacity-60"
    >
      Em breve
    </button>
  )
}

function WhatsAppCard() {
  return (
    <IntegrationShell
      icon={<SiWhatsapp className="size-5 text-[#25D366]" />}
      name="WhatsApp"
      description="Avisos, notificações de aprovação, alterações, entregas e atividades direto no WhatsApp."
      badge={<ComingSoonBadge />}
      action={<ComingSoonButton />}
    />
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
      description="Vincule pastas do Drive aos projetos e importe vídeos de lá direto para aprovação."
      badge={<StatusBadge connected={connected} />}
      action={
        connected ? (
          // Refaz o OAuth por cima da conexão atual (o backend sobrescreve o
          // token). Necessário quando o acesso salvo expira ou é revogado no
          // Google — o status continua "conectado", mas o Drive para de abrir.
          <button
            type="button"
            onClick={connect}
            disabled={busy || loading}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Reconectar
          </button>
        ) : (
          <ConnectButton connected={false} busy={busy || loading} onClick={connect} />
        )
      }
    >
      {connected && (
        <p className="mt-4 flex items-center gap-1.5 border-t border-border pt-4 text-xs text-muted-foreground">
          <Check className="size-3.5 shrink-0 text-emerald-400" />
          {status?.email ? `Conectado como ${status.email}.` : 'Conectado.'}
        </p>
      )}
      {connected && (
        <ul className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <li className="rounded-lg bg-secondary/50 px-3 py-2">
            <span className="font-medium text-foreground">Vincular pastas</span>
            <span className="mt-0.5 block text-muted-foreground">
              Na tela do projeto, crie um atalho para a pasta do Drive (brutos, briefing). Nada é copiado.
            </span>
          </li>
          <li className="rounded-lg bg-secondary/50 px-3 py-2">
            <span className="font-medium text-foreground">Importar vídeos</span>
            <span className="mt-0.5 block text-muted-foreground">
              Em “Enviar vídeo” ou na pasta vinculada do projeto, traga vídeos do Drive para aprovação.
            </span>
          </li>
        </ul>
      )}
    </IntegrationShell>
  )
}

/**
 * Conexão pessoal (cada membro conecta a própria conta) — o mesmo controle
 * fica no Calendário, que é onde o editor chega (esta tela é owner-only) e
 * pra onde o OAuth volta.
 */
function GoogleCalendarCard() {
  const { data: status, loading, setData } = useQuery((signal) => googleCalendarService.getStatus(signal))
  const [busy, setBusy] = useState(false)
  const connected = status?.connected ?? false

  async function toggle() {
    setBusy(true)
    try {
      if (connected) {
        await googleCalendarService.disconnect()
        setData({ connected: false, email: null })
        toast.info('Google Agenda desconectado')
        setBusy(false)
        return
      }
      const url = await googleCalendarService.getConnectUrl()
      if (!url) throw new Error('Resposta de conexão do Google Agenda sem URL.')
      window.location.href = url
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível falar com o Google Agenda.')
      setBusy(false)
    }
  }

  return (
    <IntegrationShell
      icon={<Image src="/icons/google-calendar.svg" alt="" width={22} height={22} />}
      name="Google Agenda"
      description="As atividades do calendário em que você está escalado vão sozinhas para o seu Google Agenda."
      badge={<StatusBadge connected={connected} />}
      action={<ConnectButton connected={connected} busy={busy || loading} onClick={toggle} />}
    >
      {connected && status?.email && (
        <p className="mt-4 flex items-center gap-1.5 border-t border-border pt-4 text-xs text-muted-foreground">
          <Check className="size-3.5 shrink-0 text-emerald-400" />
          Conectado como {status.email}. Cada pessoa da equipe conecta a própria conta.
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
      action={<ComingSoonButton />}
    />
  )
}
