'use client'

import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

/** Fundos de página de cada tema (`--background` em `app/globals.css`). */
const SURFACE_LIGHT = '#ebece7'
const SURFACE_DARK = '#17201a'
/**
 * Contraste mínimo entre a cor de marca e o fundo da página. 4.5:1 é o piso da
 * WCAG para texto normal — e a cor de marca vira texto em vários lugares
 * (`text-primary-ink`), não só preenchimento de botão.
 */
const MIN_CONTRAST = 4.5

function hexToRgb(hex: string): [number, number, number] | null {
  // `#RGB` (o backend aceita) vira `#RRGGBB`.
  const short = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex.trim())
  if (short) hex = `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
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
  return luminance > 0.6 ? '#253326' : '#ffffff'
}

/* ------------------------- neutros no tom da marca ------------------------ */

/**
 * Tons neutros da identidade Check (cópia de `app/globals.css`, `:root` e
 * `.dark`) — todos levemente esverdeados. Com cor de marca, cada um mantém a
 * luminosidade e troca o matiz verde pelo da cor primária (ver
 * `brandNeutralVars`), então fundo/card/borda continuam na mesma hierarquia.
 * Status (success/warning/danger) ficam de fora de propósito.
 * Ao mudar um destes valores em `globals.css`, mude aqui também.
 */
const NEUTRALS_LIGHT: Record<string, string> = {
  '--background': '#ebece7',
  '--foreground': '#253326',
  '--card': '#f5f6f2',
  '--card-foreground': '#253326',
  '--popover': '#f8f9f5',
  '--popover-foreground': '#253326',
  '--secondary': '#e2e5dc',
  '--secondary-foreground': '#253326',
  '--muted': '#e2e5dc',
  '--muted-foreground': '#55654f',
  '--accent': '#253326',
  '--accent-foreground': '#f5f6f2',
  '--border': '#d5d8cf',
  '--input': '#d5d8cf',
  '--chart-1': '#253326',
  '--chart-4': '#a9b3a5',
  '--chart-5': '#d5d8cf',
  '--plan-featured': '#253326',
  '--plan-featured-foreground': '#ebece7',
  '--plan-featured-muted': '#a9b3a5',
  '--sidebar': '#f5f6f2',
  '--sidebar-foreground': '#253326',
  '--sidebar-accent': '#e2e5dc',
  '--sidebar-accent-foreground': '#253326',
  '--sidebar-border': '#d5d8cf',
  '--deep': '#253326',
  '--deep-foreground': '#ebece7',
  '--deep-muted': '#a9b3a5',
  '--avatar': '#c8d8be',
  '--avatar-foreground': '#253326',
  '--gesture-stroke': '#253325',
  '--gesture-spark': '#3c533c',
  '--gesture-muted': '#54654e',
}

const NEUTRALS_DARK: Record<string, string> = {
  '--background': '#17201a',
  '--foreground': '#ebece7',
  '--card': '#202a20',
  '--card-foreground': '#ebece7',
  '--popover': '#232e23',
  '--popover-foreground': '#ebece7',
  '--secondary': '#2b372b',
  '--secondary-foreground': '#ebece7',
  '--muted': '#2b372b',
  '--muted-foreground': '#a9b3a5',
  '--accent': '#ebece7',
  '--accent-foreground': '#17201a',
  '--border': '#2e3b2e',
  '--input': '#34433a',
  '--chart-1': '#ebece7',
  '--chart-4': '#54654e',
  '--chart-5': '#2e3b2e',
  '--plan-featured': '#0f1711',
  '--plan-featured-foreground': '#ebece7',
  '--plan-featured-muted': '#a9b3a5',
  '--sidebar': '#131b15',
  '--sidebar-foreground': '#ebece7',
  '--sidebar-accent': '#2b372b',
  '--sidebar-accent-foreground': '#ebece7',
  '--sidebar-border': '#2e3b2e',
  '--deep': '#0f1711',
  '--deep-foreground': '#ebece7',
  '--deep-muted': '#a9b3a5',
  '--avatar': '#3c533c',
  '--avatar-foreground': '#ebece7',
  '--gesture-stroke': '#ebece7',
  '--gesture-spark': '#a9b3a5',
  '--gesture-muted': '#a8b3a5',
}

type Hsl = [number, number, number]

function rgbToHsl([r, g, b]: [number, number, number]): Hsl {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4
  h /= 6
  return [h, s, l]
}

function hslToRgb([h, s, l]: Hsl): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255]
}

/**
 * Neutros do tema no matiz da cor primária. Marca sem saturação (preto,
 * cinza, branco) gera neutros cinza puro; marca pouco saturada gera neutros
 * proporcionalmente mais discretos.
 */
function brandNeutralVars(color: string, dark: boolean): Record<string, string> {
  const rgb = hexToRgb(color)
  if (!rgb) return {}
  const [hue, brandSat] = rgbToHsl(rgb)
  // Abaixo de ~25% de saturação a marca é "quase cinza": atenua o tingimento.
  const satScale = Math.min(1, brandSat / 0.25)
  const out: Record<string, string> = {}
  for (const [name, hex] of Object.entries(dark ? NEUTRALS_DARK : NEUTRALS_LIGHT)) {
    const [, s, l] = rgbToHsl(hexToRgb(hex)!)
    out[name] = rgbToHex(hslToRgb([hue, s * satScale, l]))
  }
  return out
}

/**
 * Sobrescreve as CSS custom properties do tema (`app/globals.css`) com a
 * marca da agência: a cor primária vira `--primary` e afins e também dá o
 * matiz de todos os neutros (fundo, cards, sidebar, bordas — ver
 * `brandNeutralVars`); a secundária assume `--deep`/`--accent`/`--chart-2`.
 * `null`/undefined nas duas mantém o tema padrão (retorna `undefined`).
 *
 * `dark` diz sobre qual fundo a cor vai aparecer (ajuste de contraste e qual
 * conjunto de neutros usar). Quem renderiza deve passar o tema ativo — o
 * jeito prático é `useBrandAccentStyle`, logo abaixo.
 */
export function brandAccentStyle(
  color: string | null | undefined,
  { dark = true, secondary }: { dark?: boolean; secondary?: string | null } = {},
): CSSProperties | undefined {
  const secondaryVars = brandSecondaryVars(secondary)
  if (!color || !hexToRgb(color)) return secondaryVars as CSSProperties | undefined
  const neutrals = brandNeutralVars(color, dark)
  // `--primary` é preenchimento (botão, selo) e usa a cor como veio; textos e
  // bordas de destaque usam `--primary-ink`, que é a versão ajustada pro
  // contraste com o fundo da página (já no tom da marca).
  const ink = withReadableContrast(color, neutrals['--background'] ?? (dark ? SURFACE_DARK : SURFACE_LIGHT))
  // Texto escuro sobre a primária também no tom da marca (não no verde Check).
  const foreground =
    readableForeground(color) === '#ffffff' ? '#ffffff' : brandNeutralVars(color, false)['--foreground']
  return {
    ...neutrals,
    ['--primary' as string]: color,
    ['--primary-foreground' as string]: foreground,
    ['--primary-ink' as string]: ink,
    ['--ring' as string]: ink,
    ['--sidebar-primary' as string]: color,
    ['--sidebar-primary-foreground' as string]: foreground,
    ['--sidebar-ring' as string]: ink,
    ...secondaryVars,
  } as CSSProperties
}

/**
 * Cor secundária da marca: assume o papel do verde profundo da identidade
 * Check — `--deep` (painéis e ladrilhos de ícone), `--accent` (selos, chips e
 * botões escuros das telas do cliente) e `--chart-2` (segunda cor dos
 * gráficos). Texto sobre ela sai em preto/branco conforme o contraste.
 */
function brandSecondaryVars(color: string | null | undefined): Record<string, string> | undefined {
  const rgb = color ? hexToRgb(color) : null
  if (!color || !rgb) return undefined
  const foreground = readableForeground(color)
  // Texto de apoio sobre `--deep`: a própria cor puxada 60% pro lado do texto.
  const muted = rgbToHex(shift(rgb, foreground === '#ffffff' ? 0.6 : -0.6))
  return {
    '--deep': color,
    '--deep-foreground': foreground,
    '--deep-muted': muted,
    '--accent': color,
    '--accent-foreground': foreground,
    '--chart-2': color,
  }
}

/**
 * `brandAccentStyle` já ciente do tema ativo. Antes de montar assume escuro —
 * é o `defaultTheme` do `ThemeProvider`, mesma suposição que o `ThemeToggle`
 * faz para não piscar o ícone errado.
 *
 * `applyToRoot`: também grava as variáveis no `<html>` enquanto a tela está
 * montada. Necessário nas telas inteiras (shell e páginas públicas) porque
 * modais, popovers e toasts renderizam em portal, fora do elemento que
 * recebe o `style` — sem isso eles ficariam no verde Check. A prévia do
 * formulário de marca NÃO usa, para não repintar a página toda enquanto edita.
 */
export function useBrandAccentStyle(
  color: string | null | undefined,
  secondary?: string | null,
  { applyToRoot = false }: { applyToRoot?: boolean } = {},
): CSSProperties | undefined {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const style = brandAccentStyle(color, { dark: !mounted || resolvedTheme !== 'light', secondary })

  const key = style ? JSON.stringify(style) : ''
  useEffect(() => {
    if (!applyToRoot || !key) return
    const vars = JSON.parse(key) as Record<string, string>
    const root = document.documentElement.style
    for (const [name, value] of Object.entries(vars)) root.setProperty(name, value)
    return () => {
      for (const name of Object.keys(vars)) root.removeProperty(name)
    }
  }, [applyToRoot, key])

  return style
}
