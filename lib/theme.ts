import type { CSSProperties } from 'react'

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return null
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

/** Preto ou branco, o que tiver mais contraste sobre `hex` (luminância perceptiva). */
function readableForeground(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#ffffff'
  const [r, g, b] = rgb
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#0b0b0d' : '#ffffff'
}

/**
 * Sobrescreve as CSS custom properties de destaque (`--primary` e afins,
 * definidas em `app/globals.css`) com a cor de marca da agência — aplicado
 * como `style` no elemento raiz de uma tela (shell autenticado ou telas
 * públicas), nunca via wrapper extra, pra não alterar a árvore do layout.
 * `null`/undefined mantém a cor padrão do tema (retorna `undefined`).
 */
export function brandAccentStyle(color: string | null | undefined): CSSProperties | undefined {
  if (!color) return undefined
  const foreground = readableForeground(color)
  return {
    ['--primary' as string]: color,
    ['--primary-foreground' as string]: foreground,
    ['--ring' as string]: color,
    ['--sidebar-primary' as string]: color,
    ['--sidebar-primary-foreground' as string]: foreground,
    ['--sidebar-ring' as string]: color,
  } as CSSProperties
}
