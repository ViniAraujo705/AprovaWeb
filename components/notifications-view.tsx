'use client'

/**
 * Página de notificações (/notificacoes) — histórico completo de ações do
 * cliente (comentário, aprovação, ajuste solicitado, avaliação), com o
 * mesmo conteúdo do sino (`NotificationBell`) mas sem o limite de altura
 * do dropdown e com filtro de não lidas.
 */
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Bell, Loader2 } from 'lucide-react'
import { notificationService } from '@/lib/services'
import type { AppNotification } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { cn } from '@/lib/utils'
import {
  NOTIFICATION_TYPE_LABEL,
  NOTIFICATION_TYPE_ICON,
  notificationTimeAgo,
} from '@/lib/notification-format'

export function NotificationsView() {
  const [unreadOnly, setUnreadOnly] = useState(false)
  const { data, loading, error, refetch, setData } = useQuery<AppNotification[]>(
    (signal) => notificationService.list(unreadOnly || undefined, signal),
    [unreadOnly],
  )

  const items = data ?? []

  async function markRead(id: string) {
    setData((prev) => (prev ?? []).map((n) => (n.id === id ? { ...n, read: true } : n)))
    try {
      await notificationService.markRead(id)
    } catch {
      // Falha silenciosa: um refetch corrige o estado.
    }
  }

  async function markAllRead() {
    setData((prev) => (prev ?? []).map((n) => ({ ...n, read: true })))
    try {
      await notificationService.markAllRead()
    } catch {
      // idem
    }
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-wide sm:text-5xl">NOTIFICAÇÕES</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Comentários, aprovações, ajustes e avaliações dos seus clientes.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setUnreadOnly((v) => !v)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
              unreadOnly
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            Só não lidas
          </button>
          {!loading && !error && items.some((n) => !n.read) && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs font-medium text-primary hover:underline"
            >
              Marcar tudo como lido
            </button>
          )}
        </div>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Bell className="size-7" />}
            title={unreadOnly ? 'Nenhuma notificação não lida' : 'Nenhuma notificação ainda'}
            description="Quando um cliente comentar, aprovar ou avaliar um vídeo, você vê aqui."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((n) => {
              const Icon = NOTIFICATION_TYPE_ICON[n.type]
              return (
                <li key={n.id}>
                  <Link
                    href={`/videos/${n.video.id}/canal-cliente`}
                    onClick={() => {
                      if (!n.read) markRead(n.id)
                    }}
                    className={cn(
                      'flex items-start gap-4 rounded-xl border border-border bg-card px-4 py-3.5 text-sm transition-colors hover:bg-secondary/60',
                      !n.read && 'border-primary/30 bg-primary/5',
                    )}
                  >
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-secondary">
                      {n.video.posterUrl ? (
                        <Image
                          src={n.video.posterUrl}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="48px"
                          unoptimized
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-muted-foreground">
                          <Icon className="size-5" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground">
                        <span className="font-medium">{n.video.clientName || 'Cliente'}</span>{' '}
                        {NOTIFICATION_TYPE_LABEL[n.type]}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {n.video.projectName || n.video.title}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {notificationTimeAgo(n.createdAt)}
                      </p>
                    </div>
                    {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
