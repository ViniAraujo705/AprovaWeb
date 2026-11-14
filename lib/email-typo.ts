// Sugestão de correção para erros de digitação no domínio do e-mail
// ("gmail.com.br", "gmial.com", "hotmal.com" etc.). Só sugere — a pessoa pode
// manter o que digitou, porque domínios próprios de agência são legítimos.

const KNOWN_DOMAINS = [
  'gmail.com',
  'hotmail.com',
  'hotmail.com.br',
  'outlook.com',
  'outlook.com.br',
  'live.com',
  'yahoo.com',
  'yahoo.com.br',
  'icloud.com',
  'me.com',
  'uol.com.br',
  'bol.com.br',
  'terra.com.br',
  'globo.com',
  'proton.me',
]

// Erros comuns que a distância de edição não pega (diferença grande demais).
const EXPLICIT_FIXES: Record<string, string> = {
  'gmail.com.br': 'gmail.com',
  'gmail.br': 'gmail.com',
  'gmail.com.com': 'gmail.com',
  'icloud.com.br': 'icloud.com',
  'googlemail.com.br': 'gmail.com',
}

// Distância de Damerau-Levenshtein (OSA): troca de duas letras vizinhas conta 1.
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[a.length][b.length]
}

/** Retorna o e-mail corrigido quando o domínio parece erro de digitação, senão null. */
export function suggestEmail(email: string): string | null {
  const value = email.trim()
  const at = value.lastIndexOf('@')
  if (at < 1 || at === value.length - 1) return null
  const local = value.slice(0, at)
  const domain = value.slice(at + 1).toLowerCase()

  if (KNOWN_DOMAINS.includes(domain)) return null
  if (EXPLICIT_FIXES[domain]) return `${local}@${EXPLICIT_FIXES[domain]}`

  let best: string | null = null
  let bestDist = Infinity
  for (const known of KNOWN_DOMAINS) {
    const dist = distance(domain, known)
    if (dist < bestDist) {
      best = known
      bestDist = dist
    }
  }
  // Domínios curtos toleram 1 erro; longos, até 2 — evita "corrigir" domínio próprio.
  const max = domain.length >= 9 ? 2 : 1
  return best && bestDist <= max ? `${local}@${best}` : null
}
