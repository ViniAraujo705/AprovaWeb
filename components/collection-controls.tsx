'use client'

/**
 * Controles compartilhados das telas de coleção (Projetos, Clientes, Vídeos):
 * abas por situação com contador, alternador grade/lista, filtro em menu e
 * busca. Mesmo visual nas três telas, para a navegação ficar previsível
 * quando a conta cresce (padrão Linear/Frame.io/Drive).
 *
 * Cantos de 10px explícitos de propósito: o `--radius` do tema é grande, e
 * `rounded-xl` num controle de 40px de altura vira pílula.
 */
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, LayoutGrid, List, Search } from 'lucide-react'
import { AnimatePresence, motion } from '@/components/motion'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ abas */

export type TabItem<K extends string> = {
  key: K
  label: string
  count: number
  /** Destaca o contador (ex.: "Atrasados" em vermelho quando > 0). */
  tone?: 'danger'
}

export function StatusTabs<K extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: TabItem<K>[]
  value: K
  onChange: (key: K) => void
  className?: string
}) {
  return (
    <div
      role="tablist"
      className={cn(
        '-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 scrollbar-none sm:mx-0 sm:px-0',
        className,
      )}
    >
      {tabs.map((t) => {
        const active = t.key === value
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={cn(
              'relative inline-flex h-11 shrink-0 items-center gap-2 px-3 text-sm transition-colors',
              active ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            <span
              className={cn(
                'inline-flex min-w-5 items-center justify-center rounded-[6px] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                t.tone === 'danger' && t.count > 0
                  ? 'bg-danger-soft text-danger-ink'
                  : active
                    ? 'bg-foreground text-background'
                    : 'bg-secondary text-muted-foreground',
              )}
            >
              {t.count}
            </span>
            {active && (
              <motion.span
                layoutId={`tabs-underline-${tabs.map((x) => x.key).join('-')}`}
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary-ink"
                transition={{ duration: 0.2 }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

/* --------------------------------------------------------- grade / lista */

export type ViewMode = 'grid' | 'list'

/** Modo de visualização lembrado por tela, só neste navegador. */
export function useViewMode(storageKey: string, initial: ViewMode = 'grid') {
  const [mode, setMode] = useState<ViewMode>(initial)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved === 'grid' || saved === 'list') setMode(saved)
    } catch {
      // sem storage: fica no padrão
    }
  }, [storageKey])
  function change(next: ViewMode) {
    setMode(next)
    try {
      localStorage.setItem(storageKey, next)
    } catch {
      // sem storage: vale só nesta visita
    }
  }
  return [mode, change] as const
}

export function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const opts = [
    { key: 'grid' as const, label: 'Grade', icon: LayoutGrid },
    { key: 'list' as const, label: 'Lista', icon: List },
  ]
  return (
    <div role="radiogroup" aria-label="Visualização" className="inline-flex h-10 shrink-0 rounded-[10px] border border-border bg-card p-0.5">
      {opts.map(({ key, label, icon: Icon }) => {
        const active = value === key
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => onChange(key)}
            className={cn(
              'grid w-9 place-items-center rounded-[8px] transition-colors',
              active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-4" />
          </button>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------- busca */

export function SearchField({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-[10px] border border-border bg-card py-2 pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary-ink"
      />
    </div>
  )
}

/* --------------------------------------------------------------- filtro */

/**
 * Botão de filtro compacto com menu próprio — substitui o <select> nativo.
 * Mostra "Rótulo: valor" e destaca quando o filtro está aplicado.
 */
export function FilterMenu({
  icon,
  label,
  value,
  options,
  onChange,
  active = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  active?: boolean
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value)?.label ?? value

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1 sm:flex-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current}`}
        className={cn(
          'inline-flex h-10 w-full items-center gap-2 rounded-[10px] border px-3 text-sm transition-colors sm:w-auto',
          active
            ? 'border-primary-ink/40 bg-primary/15 text-foreground'
            : 'border-border bg-card text-foreground hover:bg-secondary',
          open && !active && 'bg-secondary',
        )}
      >
        <span className={active ? 'text-primary-ink' : 'text-muted-foreground'}>{icon}</span>
        <span className="hidden text-muted-foreground sm:inline">{label}:</span>
        <span className="min-w-0 flex-1 truncate text-left font-medium sm:max-w-40 sm:flex-none">{current}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-label={label}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 top-full z-30 mt-1.5 max-h-72 w-max min-w-full max-w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-[12px] border border-border bg-card p-1 shadow-xl"
          >
            {options.map((o) => {
              const selected = o.value === value
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(o.value)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary',
                      selected && 'font-semibold',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    <Check className={cn('size-4 shrink-0 text-primary-ink', !selected && 'invisible')} />
                  </button>
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ---------------------------------------------------- cabeçalho da tabela */

/** Linha de cabeçalho da visão em lista (só em telas >= md). */
export function ListHeader({ cols, children }: { cols: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'hidden items-center gap-4 border-b border-border px-4 pb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground md:grid',
        cols,
      )}
    >
      {children}
    </div>
  )
}
