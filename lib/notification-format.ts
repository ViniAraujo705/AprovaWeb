import {
  MessageSquare,
  Check,
  RotateCcw,
  Star,
  CalendarClock,
  Hourglass,
  AlarmClock,
  ClipboardList,
  UserRoundSearch,
} from 'lucide-react'
import type { AppNotification, NotificationType } from '@/lib/types'

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  comentario_cliente: 'comentou no vídeo',
  aprovacao_cliente: 'aprovou o vídeo',
  ajuste_solicitado: 'pediu ajuste no vídeo',
  avaliacao_cliente: 'avaliou o vídeo',
  prazo_proximo: 'vence nas próximas 24h',
  prazo_vencido: 'está com o prazo vencido',
  nova_demanda: 'é uma nova demanda pra você',
  aguardando_cliente: 'está esperando o cliente há 3 dias',
  lembrete_gravacao: 'tem gravação agendada em breve',
}

/** Nome curto de cada tipo — usado nas preferências de e-mail (Configurações). */
export const NOTIFICATION_TYPE_NAME: Record<NotificationType, string> = {
  comentario_cliente: 'Comentários do cliente',
  aprovacao_cliente: 'Aprovações',
  ajuste_solicitado: 'Pedidos de ajuste',
  avaliacao_cliente: 'Avaliações do cliente',
  prazo_proximo: 'Prazo chegando (1 dia antes)',
  prazo_vencido: 'Prazo vencido',
  nova_demanda: 'Novas demandas pra você',
  aguardando_cliente: 'Vídeo parado esperando o cliente',
  lembrete_gravacao: 'Lembretes de gravação',
}

export const NOTIFICATION_TYPE_ICON: Record<NotificationType, typeof MessageSquare> = {
  comentario_cliente: MessageSquare,
  aprovacao_cliente: Check,
  ajuste_solicitado: RotateCcw,
  avaliacao_cliente: Star,
  prazo_proximo: AlarmClock,
  prazo_vencido: Hourglass,
  nova_demanda: ClipboardList,
  aguardando_cliente: UserRoundSearch,
  lembrete_gravacao: CalendarClock,
}

/** Tipos que o backend manda por e-mail na hora (o resto vai no resumo diário). */
export const IMMEDIATE_EMAIL_TYPES: NotificationType[] = ['aprovacao_cliente', 'prazo_vencido']

const CLIENT_ACTION_TYPES: NotificationType[] = [
  'comentario_cliente',
  'aprovacao_cliente',
  'ajuste_solicitado',
  'avaliacao_cliente',
]

/**
 * Como uma notificação aparece em qualquer lugar (sininho, /notificacoes,
 * pop-up): `subject` em negrito + `text`, uma linha de contexto e o link.
 * Ação do cliente abre o canal do cliente, que é só do owner — editor cai
 * na revisão interna do mesmo vídeo.
 */
export function describeNotification(
  n: AppNotification,
  isOwner: boolean,
): { subject: string; text: string; context: string; href: string } {
  const text = NOTIFICATION_TYPE_LABEL[n.type]
  if (n.video) {
    if (CLIENT_ACTION_TYPES.includes(n.type)) {
      return {
        subject: n.video.clientName || 'Cliente',
        text,
        context: n.video.projectName || n.video.title,
        href: isOwner ? `/videos/${n.video.id}/canal-cliente` : `/videos/${n.video.id}/revisao`,
      }
    }
    return {
      subject: n.video.title,
      text,
      context: [n.video.clientName, n.video.projectName].filter(Boolean).join(' · '),
      href: `/videos/${n.video.id}/revisao`,
    }
  }
  if (n.demand) {
    return {
      subject: n.demand.title,
      text,
      context: n.demand.clientName ?? 'Kanban',
      href: '/kanban',
    }
  }
  return {
    subject: n.event?.clientName || 'Cliente',
    text,
    context: n.event?.title || '',
    href: '/calendario',
  }
}

/** Tempo relativo curto (ex.: "agora", "5min", "3h", "2d"). */
export function notificationTimeAgo(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const diffMs = Date.now() - date.getTime()
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}
