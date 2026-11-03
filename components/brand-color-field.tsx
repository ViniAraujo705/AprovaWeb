'use client'

import { Check } from 'lucide-react'
import { useBrandAccentStyle } from '@/lib/theme'

/** Valores do `#color` quando a marca não define nada (o input nativo exige um hex). */
export const DEFAULT_PRIMARY_COLOR = '#0b0b0d'
export const DEFAULT_SECONDARY_COLOR = '#253326'

/** `null` quando a cor é o placeholder padrão — significa "herdar" no backend. */
export function colorOrNull(value: string, fallback: string): string | null {
  return value.toLowerCase() === fallback.toLowerCase() ? null : value
}

export function BrandColorField({
  label,
  hint,
  value,
  onChange,
  fallback,
  resetLabel = 'Usar padrão',
}: {
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
  fallback: string
  resetLabel?: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="size-11 cursor-pointer rounded-xl border border-border bg-card p-1"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={fallback}
          className="min-h-11 w-32 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary-ink"
        />
        {value.toLowerCase() !== fallback.toLowerCase() && (
          <button
            type="button"
            onClick={() => onChange(fallback)}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            {resetLabel}
          </button>
        )}
      </div>
    </label>
  )
}

/**
 * Prévia ao vivo de como as duas cores aparecem nas telas do cliente — usa o
 * mesmo `brandAccentStyle` das telas reais, então o ajuste de contraste
 * automático também aparece aqui.
 */
export function BrandColorPreview({
  primary,
  secondary,
}: {
  primary: string | null
  secondary: string | null
}) {
  const style = useBrandAccentStyle(primary, secondary)
  return (
    <div style={style} className="rounded-2xl border border-border bg-background p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Prévia</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-foreground">
          Projeto · Campanha
        </span>
        <span className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
          <Check className="size-4" /> Aprovar vídeo
        </span>
        <span className="text-sm font-medium text-primary-ink underline">Ver comentários</span>
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-xl bg-deep p-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Check className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-deep-foreground">Painel em destaque</p>
          <p className="text-xs text-deep-muted">Texto de apoio sobre a cor secundária</p>
        </div>
      </div>
    </div>
  )
}
