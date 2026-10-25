import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * Logo oficial Check (marca + "check"). Duas versões no `public/brand`: verde
 * profundo pro modo normal e lima/off-white pro noturno — a troca é por CSS,
 * sem depender do tema montado (não pisca na hidratação).
 */
export function CheckLogo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <span className={cn('relative inline-block h-7 w-[114px] shrink-0', className)}>
      <Image
        src="/brand/check-logo-light.png"
        alt="Check"
        fill
        sizes="160px"
        priority={priority}
        className="object-contain object-left dark:hidden"
      />
      <Image
        src="/brand/check-logo-dark.png"
        alt="Check"
        fill
        sizes="160px"
        priority={priority}
        className="hidden object-contain object-left dark:block"
      />
    </span>
  )
}

/**
 * Cabeçalho padrão das telas da agência: rótulo pequeno (eyebrow), título em
 * Manrope, descrição e ações à direita — o mesmo em todas as telas do layout.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className={cn('font-display text-4xl leading-[1.05] text-foreground sm:text-5xl', eyebrow && 'mt-3')}>
          {title}
        </h1>
        {description && <p className="mt-3 max-w-2xl text-base text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </header>
  )
}

/** Card de métrica do topo das telas (rótulo, número grande, legenda). */
export function StatCard({
  label,
  value,
  hint,
  dot,
  tone = 'default',
  className,
  children,
}: {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  /** Classe de cor do pontinho antes do rótulo (ex.: `bg-warning`). */
  dot?: string
  tone?: 'default' | 'success' | 'danger' | 'warning'
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-5',
        tone === 'danger'
          ? 'border-danger-border bg-danger-soft'
          : tone === 'warning'
            ? 'border-warning-border bg-warning-soft'
            : 'border-border bg-card',
        className,
      )}
    >
      <p
        className={cn(
          'flex items-center gap-2 text-sm',
          tone === 'danger' ? 'text-danger-ink' : 'text-muted-foreground',
        )}
      >
        {dot && <span className={cn('size-2 rounded-full', dot)} aria-hidden="true" />}
        {label}
      </p>
      <p
        className={cn(
          'mt-2 font-display text-4xl leading-none',
          tone === 'success' ? 'text-success-ink' : tone === 'danger' ? 'text-danger-ink' : 'text-foreground',
        )}
      >
        {value}
      </p>
      {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
      {children}
    </div>
  )
}

/** Faixa "selo + mensagem" com o gesto à esquerda (Vale um check, Prazos vencidos…). */
export function GestureCallout({
  gesture,
  eyebrow,
  title,
  description,
  action,
  tone = 'default',
  className,
}: {
  gesture: React.ReactNode
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  tone?: 'default' | 'warning' | 'danger'
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-2xl border p-6 sm:flex-row sm:items-center',
        tone === 'warning'
          ? 'border-warning-border bg-warning-soft'
          : tone === 'danger'
            ? 'border-danger-border bg-danger-soft'
            : 'border-border bg-card',
        className,
      )}
    >
      <div className="shrink-0">{gesture}</div>
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p
            className={cn(
              'text-xs font-semibold uppercase tracking-[0.16em]',
              tone === 'danger' ? 'text-danger-ink' : tone === 'warning' ? 'text-warning-ink' : 'text-muted-foreground',
            )}
          >
            {eyebrow}
          </p>
        )}
        <p className="mt-1.5 font-display text-xl leading-snug text-foreground">{title}</p>
        {description && (
          <p className={cn('mt-1.5 text-sm', tone === 'danger' ? 'text-danger-ink' : 'text-muted-foreground')}>
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
