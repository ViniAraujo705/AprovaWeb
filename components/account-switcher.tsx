'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Building2, Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { useAuth } from '@/components/auth-provider'
import { authService } from '@/lib/services'
import { teamRoleLabel, type AccountOption } from '@/lib/types'
import { useQuery } from '@/lib/use-query'
import { cn } from '@/lib/utils'
import { AnimatePresence, motion } from '@/components/motion'

const PANEL_GAP = 8

/**
 * Dropdown "trocar de agência" — só aparece pra quem é membro de 2+ contas
 * (ver `GET /auth/my-accounts`). Some sozinho (retorna `null`) pro caso
 * comum de 1 conta só. Troca recarrega a página: estado/caches locais
 * (ex.: `allVideosCache` em `lib/services.ts`) não são isolados por conta.
 */
export function AccountSwitcher({
  direction = 'down',
  className,
}: {
  direction?: 'down' | 'up'
  className?: string
}) {
  const { switchAccount } = useAuth()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const accounts = useQuery<AccountOption[]>((signal) => authService.myAccounts(signal), [])

  useEffect(() => setMounted(true), [])

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

  useEffect(() => {
    if (!open) return
    function updatePosition() {
      const el = triggerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setPanelStyle(
        direction === 'up'
          ? { left: rect.left, bottom: window.innerHeight - rect.top + PANEL_GAP }
          : { top: rect.bottom + PANEL_GAP, left: rect.left },
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

  const list = accounts.data ?? []
  if (list.length < 2) return null

  const current = list.find((a) => a.isCurrent)

  async function handleSwitch(accountId: string) {
    if (switching || accountId === current?.accountId) return
    setSwitching(accountId)
    try {
      await switchAccount(accountId)
      // Recarrega pra descartar qualquer cache/estado local da conta anterior.
      window.location.href = '/dashboard'
    } catch {
      setSwitching(null)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Trocar de agência"
        aria-label="Trocar de agência"
        className={cn(
          'flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
          className,
        )}
      >
        <Building2 className="size-4 shrink-0" />
        <ChevronsUpDown className="size-3 shrink-0" />
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={panelRef}
                initial={{ y: direction === 'up' ? 4 : -4 }}
                animate={{ y: 0 }}
                exit={{ y: direction === 'up' ? 4 : -4 }}
                transition={{ duration: 0.15 }}
                style={panelStyle}
                className="fixed z-50 w-64 max-w-[90vw] overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
              >
                <div className="border-b border-border px-3 py-2.5">
                  <span className="text-sm font-medium text-foreground">Trocar de agência</span>
                </div>
                <ul className="max-h-[min(50vh,18rem)] overflow-y-auto py-1">
                  {list.map((acc) => (
                    <li key={acc.accountId}>
                      <button
                        type="button"
                        disabled={switching !== null}
                        onClick={() => handleSwitch(acc.accountId)}
                        className="flex w-full min-h-11 items-center gap-2.5 px-3 text-left text-sm transition-colors hover:bg-secondary/60 disabled:cursor-not-allowed"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-foreground">
                            {acc.nomeAgencia}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {teamRoleLabel[acc.role]}
                          </span>
                        </span>
                        {switching === acc.accountId ? (
                          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                        ) : acc.isCurrent ? (
                          <Check className="size-4 shrink-0 text-primary" />
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  )
}
