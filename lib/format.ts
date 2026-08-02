/** Formata segundos como m:ss (ex.: 28 -> "0:28"). */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

/** Data relativa amigável em pt-BR a partir de um ISO string. */
export function formatSentAt(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const day = 24 * 60 * 60 * 1000
  const sameDay = date.toDateString() === now.toDateString()
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  if (sameDay) return `Enviado hoje, ${time}`
  const yesterday = new Date(now.getTime() - day)
  if (date.toDateString() === yesterday.toDateString()) return `Enviado ontem, ${time}`
  const days = Math.floor(diffMs / day)
  if (days < 7) return `Enviado ${days} dias atrás`
  return `Enviado em ${date.toLocaleDateString('pt-BR')}`
}

/** Data relativa curta em pt-BR pra coluna "Enviado" de listas compactas (ex.: "hoje, 13:39", "2 dias, 09:10"). */
export function formatSentAtCompact(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const day = 24 * 60 * 60 * 1000
  const sameDay = date.toDateString() === now.toDateString()
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  if (sameDay) return `hoje, ${time}`
  const yesterday = new Date(now.getTime() - day)
  if (date.toDateString() === yesterday.toDateString()) return `ontem, ${time}`
  const days = Math.floor((now.getTime() - date.getTime()) / day)
  if (days < 7) return `${days} dias, ${time}`
  return date.toLocaleDateString('pt-BR')
}

/** Data curta em pt-BR a partir de um ISO string (ex.: "10/07/2026"). */
export function formatDeadline(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('pt-BR')
}

/** Tempo relativo curto em pt-BR ("agora", "há 5min", "há 2h", "há 3d") a partir de um ISO string. */
export function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const diffMs = Date.now() - date.getTime()
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

export type DeadlineUrgency = 'overdue' | 'soon' | 'ok'

/** Urgência do prazo: vencido, próximo (<= 2 dias) ou tranquilo. */
export function getDeadlineUrgency(iso: string | null): DeadlineUrgency | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const diffMs = date.getTime() - Date.now()
  const day = 24 * 60 * 60 * 1000
  if (diffMs < 0) return 'overdue'
  if (diffMs <= 2 * day) return 'soon'
  return 'ok'
}
