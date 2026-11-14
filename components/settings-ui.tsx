'use client'

/**
 * Peças visuais das telas de Configurações (padrão Linear/Vercel): cabeçalho
 * da página, cartão com rodapé de ação e linha "rótulo à esquerda, controle à
 * direita". Cada tela (/configuracoes, /seguranca, /notificacoes, /marca)
 * monta seus blocos com isto, para todas terem o mesmo ritmo.
 */

import { useEffect, useRef, useState } from 'react'
import { Loader2, MoreHorizontal, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FadeIn, motion } from '@/components/motion'

export function SettingsPage({
  title,
  description,
  children,
  wide,
}: {
  title: string
  description?: string
  children: React.ReactNode
  /** Página com prévia ao lado (marca) usa a largura maior. */
  wide?: boolean
}) {
  return (
    <div className={cn('mx-auto w-full px-4 py-6 sm:px-6 lg:px-10 lg:py-10', wide ? 'max-w-5xl' : 'max-w-3xl')}>
      <header className="border-b border-border pb-6">
        <p className="eyebrow">Configurações</p>
        <h1 className="mt-2 font-display text-3xl leading-tight text-foreground sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </header>
      <div className="mt-8 flex flex-col gap-6">{children}</div>
    </div>
  )
}

/**
 * Cartão de uma seção. `footer` vira a faixa de baixo (dica à esquerda, ação à
 * direita), como nas configurações do Vercel.
 */
export function SettingsCard({
  title,
  description,
  badge,
  aside,
  children,
  footer,
  danger,
  id,
}: {
  title: string
  description?: React.ReactNode
  badge?: React.ReactNode
  /** Ação no canto do cabeçalho (ex.: "Encerrar outras sessões"). */
  aside?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  danger?: boolean
  id?: string
}) {
  return (
    <FadeIn y={6}>
      <section
        id={id}
        className={cn(
          'scroll-mt-6 overflow-hidden rounded-[14px] border bg-card',
          danger ? 'border-danger-border' : 'border-border',
        )}
      >
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                {title}
                {badge}
              </h2>
              {description && <p className="mt-1 max-w-xl text-sm text-muted-foreground">{description}</p>}
            </div>
            {aside}
          </div>
          {children && <div className="mt-5">{children}</div>}
        </div>
        {footer && (
          <div
            className={cn(
              'flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 sm:px-6',
              danger ? 'border-danger-border bg-danger-soft/40' : 'border-border bg-secondary/40',
            )}
          >
            {footer}
          </div>
        )}
      </section>
    </FadeIn>
  )
}

/** Faixa de rodapé padrão: dica + botão Salvar (aceso só com alteração). */
export function SaveFooter({
  hint,
  dirty,
  busy,
  onSave,
  label = 'Salvar',
  form,
}: {
  hint?: React.ReactNode
  dirty: boolean
  busy: boolean
  onSave?: () => void
  label?: string
  /** id de um <form> para o botão submeter. */
  form?: string
}) {
  return (
    <>
      <p className="min-w-0 text-xs text-muted-foreground">{hint}</p>
      <button
        type={form ? 'submit' : 'button'}
        form={form}
        onClick={form ? undefined : onSave}
        disabled={!dirty || busy}
        className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy && <Loader2 className="size-3.5 animate-spin" />}
        {label}
      </button>
    </>
  )
}

/** Linha: rótulo e descrição à esquerda, controle à direita (empilha no celular). */
export function SettingsRow({
  label,
  description,
  children,
  htmlFor,
}: {
  label: string
  description?: React.ReactNode
  children: React.ReactNode
  htmlFor?: string
}) {
  return (
    <div className="grid gap-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export const settingsInputClass =
  'h-10 w-full rounded-[10px] border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary-ink aria-[invalid=true]:border-destructive'

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        checked ? 'bg-primary-ink' : 'bg-secondary ring-1 ring-inset ring-border',
      )}
    >
      <span
        className={cn(
          'absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform',
          checked && 'translate-x-5',
        )}
      />
    </button>
  )
}

export type ActionMenuItem = {
  label: string
  icon: LucideIcon
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  hidden?: boolean
}

/** Menu "⋯" de ações de uma linha: abre abaixo do botão, fecha com clique fora ou Esc. */
export function ActionMenu({ label, items }: { label: string; items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const visible = items.filter((i) => !i.hidden)
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  if (visible.length === 0) return null
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'grid size-9 place-items-center rounded-[10px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
          open && 'bg-secondary text-foreground',
        )}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-[12px] border border-border bg-card p-1 shadow-xl">
          {visible.map((it, i) => (
            <div key={it.label}>
              {it.danger && i > 0 && !visible[i - 1].danger && <div className="my-1 h-px bg-border" />}
              <button
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false)
                  it.onSelect()
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-40',
                  it.danger ? 'text-danger-ink hover:bg-danger-soft' : 'text-foreground hover:bg-secondary',
                )}
              >
                <it.icon className="size-4 shrink-0" />
                {it.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Confirmação de ação sensível (suspender, promover, cancelar convite...). */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string
  description: React.ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => !busy && onClose()}
    >
      <motion.div
        initial={{ scale: 0.97, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.97, y: 8 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Fechar"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-secondary/70"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-10 rounded-[10px] border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Voltar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm()
              } finally {
                setBusy(false)
              }
            }}
            className={cn(
              'inline-flex h-10 items-center gap-2 rounded-[10px] px-4 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50',
              danger ? 'bg-danger text-white' : 'bg-foreground text-background',
            )}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
