import { MessageSquare, Check, RotateCcw, Star, CalendarClock } from 'lucide-react'
import type { NotificationType } from '@/lib/types'

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  comentario_cliente: 'comentou no vídeo',
  aprovacao_cliente: 'aprovou o vídeo',
  ajuste_solicitado: 'pediu ajuste no vídeo',
  avaliacao_cliente: 'avaliou o vídeo',
  lembrete_gravacao: 'tem gravação agendada em breve',
}

export const NOTIFICATION_TYPE_ICON: Record<NotificationType, typeof MessageSquare> = {
  comentario_cliente: MessageSquare,
  aprovacao_cliente: Check,
  ajuste_solicitado: RotateCcw,
  avaliacao_cliente: Star,
  lembrete_gravacao: CalendarClock,
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
