'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import Image from 'next/image'
import { Bell, Loader2 } from 'lucide-react'
import { notificationService } from '@/lib/services'
import type { AppNotification } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { cn } from '@/lib/utils'
import { AnimatePresence, motion } from '@/components/motion'
import {
  NOTIFICATION_TYPE_LABEL as TYPE_LABEL,
  NOTIFICATION_TYPE_ICON as TYPE_ICON,
  notificationTimeAgo as timeAgo,
} from '@/lib/notification-format'

// Sem WebSocket/SSE no backend hoje — só polling simples.
const POLL_MS = 45_000

/** Espaço (px) entre o gatilho e o painel — equivalente ao antigo mt-2/mb-2. */
const PANEL_GAP = 8

/**
 * Sininho de notificações (ações do cliente: comentário, aprovação, ajuste,
 * avaliação). Usado tanto no header mobile quanto no rodapé do sidebar
 * desktop do `AgencyShell`.
 */
export function NotificationBell({
  className,
  /** 'down' (default, cabe no header) ou 'up' (pro rodapé do sidebar, onde abrir pra baixo cortaria na borda da tela). */
  direction = 'down',
}: {
  className?: string
  direction?: 'down' | 'up'
}) {
  const [open, setOpen] = useState(false)
  // Só true depois do mount no cliente — evita chamar `document.body` durante SSR.
  const [mounted, setMounted] = useState(false)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const unread = useQuery<number>((signal) => notificationService.unreadCount(signal), [])
  const list = useQuery<AppNotification[]>(
    (signal) => notificationService.list(undefined, signal),
    [],
    { enabled: open },
  )

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const id = setInterval(() => {
      unread.refetch()
      if (open) list.refetch()
    }, POLL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Clique fora fecha o painel — considera tanto o gatilho quanto o painel
  // (portado pro <body>, então não é mais descendente do gatilho no DOM).
  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  // Posiciona o painel (portado) com base na posição real do gatilho na tela,
  // já que ele não pode mais depender de `absolute` relativo ao pai.
  useEffect(() => {
    if (!open) return
    function updatePosition() {
      const el = triggerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setPanelStyle(
        direction === 'up'
          ? { left: rect.left, bottom: window.innerHeight - rect.top + PANEL_GAP }
          : { top: rect.bottom + PANEL_GAP, right: window.innerWidth - rect.right },
      )
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, direction])

  async function markRead(id: string) {
    list.setData((prev) => (prev ?? []).map((n) => (n.id === id ? { ...n, read: true } : n)))
    unread.setData((prev) => Math.max(0, (prev ?? 1) - 1))
    try {
      await notificationService.markRead(id)
    } catch {
      // Falha silenciosa: o próximo poll corrige o estado.
    }
  }

  async function markAllRead() {
    list.setData((prev) => (prev ?? []).map((n) => ({ ...n, read: true })))
    unread.setData(0)
    try {
      await notificationService.markAllRead()
    } catch {
      // idem
    }
  }

  const count = unread.data ?? 0
  const items = list.data ?? []

  return (
    <div ref={triggerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notificações"
        className={cn(
          'relative grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
          className,
        )}
      >
        <Bell className="size-4" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-[1.1rem] place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {/*
        Portal pro <body>: o sidebar é `position: sticky`, o que cria um
        stacking context próprio. Sem o portal, o `z-50` do painel só
        competia dentro desse contexto — e a parte que vaza pra fora do
        sidebar (largura fixa de 320px, bem mais que o sidebar) ficava por
        baixo do conteúdo do dashboard (que vem depois no DOM), em vez de
        cobrir tudo como deveria. Mesmo problema já resolvido uma vez em
        `video-stage.tsx` pro modo tela cheia.
      */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={panelRef}
                initial={{ opacity: 0, y: direction === 'up' ? 4 : -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: direction === 'up' ? 4 : -4 }}
                transition={{ duration: 0.15 }}
                style={panelStyle}
                className="fixed z-50 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
              >
                <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                  <span className="text-sm font-medium text-foreground">Notificações</span>
                  {items.some((n) => !n.read) && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Marcar tudo como lido
                    </button>
                  )}
                </div>

                <div className="max-h-[min(45vh,14rem)] overflow-y-auto">
                  {list.loading ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                    </div>
                  ) : items.length === 0 ? (
                    <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                      Nenhuma notificação por aqui.
                    </p>
                  ) : (
                    <ul>
                      {items.map((n) => {
                        const Icon = TYPE_ICON[n.type]
                        return (
                          <li key={n.id}>
                            <Link
                              href={`/videos/${n.video.id}/canal-cliente`}
                              onClick={() => {
                                setOpen(false)
                                if (!n.read) markRead(n.id)
                              }}
                              className={cn(
                                'flex items-start gap-3 border-b border-border/60 px-3 py-3 text-sm transition-colors last:border-b-0 hover:bg-secondary/60',
                                !n.read && 'bg-primary/5',
                              )}
                            >
                              <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-secondary">
                                {n.video.posterUrl ? (
                                  <Image
                                    src={n.video.posterUrl}
                                    alt=""
                                    fill
                                    className="object-cover"
                                    sizes="40px"
                                    unoptimized
                                  />
                                ) : (
                                  <span className="grid h-full w-full place-items-center text-muted-foreground">
                                    <Icon className="size-4" />
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-foreground">
                                  <span className="font-medium">{n.video.clientName || 'Cliente'}</span>{' '}
                                  {TYPE_LABEL[n.type]}
                                </p>
                                <p
                                  className="truncate text-xs text-muted-foreground"
                                  title={n.video.projectName || n.video.title}
                                >
                                  {n.video.projectName || n.video.title}
                                </p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  {timeAgo(n.createdAt)}
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

                <Link
                  href="/notificacoes"
                  onClick={() => setOpen(false)}
                  className="block border-t border-border px-3 py-2.5 text-center text-xs font-medium text-primary hover:underline"
                >
                  Ver todas as notificações
                </Link>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  )
}
