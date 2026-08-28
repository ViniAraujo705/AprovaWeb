'use client'

import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

/** Fundos de página de cada tema (`--background` em `app/globals.css`). */
const SURFACE_LIGHT = '#f5f5f7'
const SURFACE_DARK = '#0b0b0d'
/**
 * Contraste mínimo entre a cor de marca e o fundo da página. 4.5:1 é o piso da
 * WCAG para texto normal — e a cor de marca vira texto em vários lugares
 * (`text-primary`), não só preenchimento de botão.
 */
const MIN_CONTRAST = 4.5

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return null
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, '0')).join('')}`
}

/** Luminância relativa da WCAG (não é a mesma média ponderada de `readableForeground`). */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Mistura `color` com branco (t > 0) ou preto (t < 0), preservando o matiz. */
function shift(rgb: [number, number, number], t: number): [number, number, number] {
  const target = t > 0 ? 255 : 0
  const amount = Math.abs(t)
  return rgb.map((c) => c + (target - c) * amount) as [number, number, number]
}

/**
 * Clareia (no tema escuro) ou escurece (no claro) a cor de marca só o quanto
 * for preciso para ela ficar legível sobre o fundo da página.
 *
 * Sem isto, uma agência que escolhe `#000000` no tema escuro (ou branco no
 * claro) some da tela inteira: `--primary` vira texto, borda, tint e fundo de
 * botão em ~170 lugares, e todos ficam da cor do fundo. Marcas com cor normal
 * (azul, rosa, verde) já passam do mínimo e saem daqui intactas.
 */
function withReadableContrast(hex: string, surface: string): string {
  const rgb = hexToRgb(hex)
  const surfaceRgb = hexToRgb(surface)
  if (!rgb || !surfaceRgb) return hex
  if (contrastRatio(rgb, surfaceRgb) >= MIN_CONTRAST) return hex
  // Fundo escuro pede cor mais clara; fundo claro pede mais escura.
  const direction = relativeLuminance(surfaceRgb) < 0.5 ? 1 : -1
  for (let step = 1; step <= 20; step++) {
    const candidate = shift(rgb, direction * (step / 20))
    if (contrastRatio(candidate, surfaceRgb) >= MIN_CONTRAST) return rgbToHex(candidate)
  }
  // Nem branco/preto puro chegou no mínimo (impossível na prática): usa o extremo.
  return direction > 0 ? '#ffffff' : '#000000'
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
 *
 * `dark` diz sobre qual fundo a cor vai aparecer, para o ajuste de contraste
 * (ver `withReadableContrast`). Quem renderiza deve passar o tema ativo — o
 * jeito prático é `useBrandAccentStyle`, logo abaixo.
 */
export function brandAccentStyle(
  color: string | null | undefined,
  { dark = true }: { dark?: boolean } = {},
): CSSProperties | undefined {
  if (!color) return undefined
  const accent = withReadableContrast(color, dark ? SURFACE_DARK : SURFACE_LIGHT)
  const foreground = readableForeground(accent)
  return {
    ['--primary' as string]: accent,
    ['--primary-foreground' as string]: foreground,
    ['--ring' as string]: accent,
    ['--sidebar-primary' as string]: accent,
    ['--sidebar-primary-foreground' as string]: foreground,
    ['--sidebar-ring' as string]: accent,
  } as CSSProperties
}

/**
 * `brandAccentStyle` já ciente do tema ativo. Antes de montar assume escuro —
 * é o `defaultTheme` do `ThemeProvider`, mesma suposição que o `ThemeToggle`
 * faz para não piscar o ícone errado.
 */
export function useBrandAccentStyle(color: string | null | undefined): CSSProperties | undefined {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return brandAccentStyle(color, { dark: !mounted || resolvedTheme !== 'light' })
}
