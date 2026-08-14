import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Nome curto pra exibição compacta (chips, escala). Usa só o primeiro nome,
 * exceto quando colide com o primeiro nome de outra pessoa em `allNames`
 * (ex: duas "Thais") — nesse caso anexa a inicial do último sobrenome.
 */
function stripParenthetical(name: string): string {
  return name.replace(/\([^)]*\)/g, ' ').trim()
}

export function shortName(name: string, allNames: string[]): string {
  const clean = stripParenthetical(name)
  if (!clean) return name.trim()
  const parts = clean.split(/\s+/)
  const first = parts[0]
  if (parts.length === 1) return first
  const collisions = allNames.filter(
    (n) => stripParenthetical(n).split(/\s+/)[0]?.toLowerCase() === first.toLowerCase(),
  ).length
  if (collisions <= 1) return first
  const lastInitial = parts[parts.length - 1][0]
  return lastInitial ? `${first} ${lastInitial.toUpperCase()}` : first
}
