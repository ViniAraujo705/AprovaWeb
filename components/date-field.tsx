'use client'

/**
 * Substitui o <input type="date"> nativo (calendário do SO/navegador, foge do
 * dark theme do app) por um popover no mesmo estilo do DateTimeField de
 * calendar-view.tsx, só que sem seleção de hora — pra campos de "prazo".
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WEEKDAYS, dateKey, buildMonthGrid } from '@/lib/format'
import { motion, AnimatePresence } from '@/components/motion'

const PANEL_WIDTH = 264
const PANEL_GAP = 6

function parseDateInputValue(value: string): Date | null {
  if (!value) return null
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "agosto de 2026" -> "Agosto de 2026" (só a 1ª letra — text-transform: capitalize maiusculiza cada palavra, incluindo o "de"). */
function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function DateField({
  value,
  onChange,
  min,
  disabled,
  clearable,
  placeholder = 'dd/mm/aaaa',
  className,
}: {
  /** String "YYYY-MM-DD" (mesmo formato de <input type="date">), ou "" pra vazio. */
  value: string
  onChange: (value: string) => void
  /** String "YYYY-MM-DD" — dias anteriores ficam desabilitados na grade. */
  min?: string
  disabled?: boolean
  clearable?: boolean
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const parsed = parseDateInputValue(value)
  const minDate = min ? parseDateInputValue(min) : null
  const [viewMonth, setViewMonth] = useState(() => {
    const base = parsed ?? new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })

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
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8))
      setPanelStyle({ top: rect.bottom + PANEL_GAP, left })
    }
    const base = parsed ?? new Date()
    setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1))
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function selectDay(d: Date) {
    onChange(toDateInputValue(d))
    setOpen(false)
  }

  const grid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth])
  const displayLabel = parsed
    ? parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : placeholder

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex min-h-11 w-full items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 text-left text-sm outline-none focus:border-primary disabled:opacity-60',
          className,
        )}
      >
        <span className={cn('flex-1 truncate', parsed ? 'text-foreground' : 'text-muted-foreground')}>
          {displayLabel}
        </span>
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={panelRef}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                style={{ ...panelStyle, width: PANEL_WIDTH }}
                className="fixed z-50 rounded-xl border border-border bg-card p-3 shadow-2xl"
              >
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                    className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="text-sm font-medium text-foreground">
                    {capitalizeFirst(viewMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))}
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                    className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-7 text-center text-[10px] font-medium text-muted-foreground">
                  {WEEKDAYS.map((w) => (
                    <span key={w}>{w[0]}</span>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-y-0.5">
                  {grid.map((d) => {
                    const inMonth = d.getMonth() === viewMonth.getMonth()
                    const selected = parsed && dateKey(d) === dateKey(parsed)
                    const isDisabled = minDate ? dateKey(d) < dateKey(minDate) : false
                    return (
                      <button
                        key={d.toISOString()}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => selectDay(d)}
                        className={cn(
                          'mx-auto grid size-8 place-items-center rounded-lg text-xs transition-colors',
                          isDisabled
                            ? 'cursor-not-allowed text-muted-foreground/25'
                            : selected
                              ? 'bg-primary font-semibold text-primary-foreground'
                              : inMonth
                                ? 'text-foreground hover:bg-secondary'
                                : 'text-muted-foreground/40 hover:bg-secondary',
                        )}
                      >
                        {d.getDate()}
                      </button>
                    )
                  })}
                </div>

                {clearable && (
                  <div className="mt-3 border-t border-border pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        onChange('')
                        setOpen(false)
                      }}
                      className="w-full rounded-lg border border-border py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Limpar
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  )
}
