'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { notificationService } from '@/lib/services'
import type { AppNotification } from '@/lib/types'
import { AnimatePresence, motion } from '@/components/motion'
import { useAuth } from '@/components/auth-provider'
import { NOTIFICATION_TYPE_ICON, describeNotification } from '@/lib/notification-format'

const POLL_MS = 30_000
const AUTO_DISMISS_MS = 10_000
const MAX_VISIBLE = 3

/** Disparado quando chega notificação nova — o sininho escuta pra atualizar o contador na hora. */
export const NOTIFICATIONS_CHANGED_EVENT = 'check:notifications-changed'

/**
 * Pop-up no canto da tela quando chega uma notificação nova com o app aberto.
 * Montado uma vez só no `AgencyShell` (o sininho aparece duas vezes — header
 * mobile e sidebar — e cada um mostraria o mesmo pop-up).
 *
 * Sem WebSocket no backend: consulta as não lidas a cada 30s. A primeira
 * consulta só registra o que já existia, pra não estourar pop-up de coisa
 * antiga a cada vez que a página abre.
 */
export function NotificationPopups() {
  const router = useRouter()
  const isOwner = useAuth().user?.teamRole === 'owner'
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState<AppNotification[]>([])
  const seenRef = useRef<Set<string> | null>(null)
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    setVisible((prev) => prev.filter((n) => n.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) clearTimeout(timer)
    timersRef.current.delete(id)
  }, [])

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function poll() {
      try {
        const unread = await notificationService.list(true, controller.signal)
        if (cancelled) return
        if (!seenRef.current) {
          seenRef.current = new Set(unread.map((n) => n.id))
          return
        }
        const fresh = unread.filter((n) => !seenRef.current!.has(n.id))
        if (fresh.length === 0) return
        fresh.forEach((n) => seenRef.current!.add(n.id))
        window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
        setVisible((prev) => [...fresh, ...prev].slice(0, MAX_VISIBLE))
        for (const n of fresh) {
          timersRef.current.set(
            n.id,
            setTimeout(() => dismiss(n.id), AUTO_DISMISS_MS),
          )
        }
      } catch {
        // Falha silenciosa: tenta de novo no próximo ciclo.
      }
    }

    poll()
    const id = setInterval(poll, POLL_MS)
    const timers = timersRef.current
    return () => {
      cancelled = true
      controller.abort()
      clearInterval(id)
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
    }
  }, [dismiss])

  function open(n: AppNotification, href: string) {
    dismiss(n.id)
    notificationService
      .markRead(n.id)
      .then(() => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT)))
      .catch(() => {})
    router.push(href)
  }

  if (!mounted) return null

  return createPortal(
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 print:hidden"
    >
      <AnimatePresence initial={false}>
        {visible.map((n) => {
          const Icon = NOTIFICATION_TYPE_ICON[n.type]
          const { subject, text, context, href } = describeNotification(n, isOwner)
          return (
            <motion.div
              key={n.id}
              layout
              initial={{ y: 16, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ x: 24, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto relative w-full overflow-hidden rounded-xl border border-border bg-card shadow-2xl sm:w-[22rem]"
            >
              <button
                type="button"
                onClick={() => open(n, href)}
                className="flex w-full items-start gap-3 p-3 pr-10 text-left text-sm transition-colors hover:bg-secondary/60"
              >
                <div className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-secondary">
                  {n.video?.posterUrl ? (
                    <Image src={n.video.posterUrl} alt="" fill className="object-cover" sizes="44px" unoptimized />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-primary-ink">
                      <Icon className="size-5" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground">
                    <span className="font-medium">{subject}</span> {text}
                  </p>
                  {context && <p className="mt-0.5 truncate text-xs text-muted-foreground">{context}</p>}
                </div>
              </button>
              <button
                type="button"
                onClick={() => dismiss(n.id)}
                aria-label="Fechar aviso"
                className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>,
    document.body,
  )
}
