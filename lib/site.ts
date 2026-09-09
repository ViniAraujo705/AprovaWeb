/**
 * Origem canônica dos links públicos gerados no front (galeria `/g`, vídeo
 * `/v`, portfólio `/p` e hub `/portfolio`).
 *
 * Esses links são copiados e mandados pro cliente final, então não podem sair
 * de `window.location.origin`: isso devolve o domínio em que a agência está
 * navegando naquele momento. Com dois domínios apontando pro mesmo deploy
 * (`vistoow.com.br`, o antigo, e `checkprod.com.br`), quem entrava pelo
 * endereço velho gerava e distribuía link com a marca velha.
 *
 * `NEXT_PUBLIC_SITE_URL` manda quando definida (produção). Sem ela — dev local
 * e previews da Vercel — caímos na origem atual, pro link continuar
 * funcionando no host em que o app está rodando.
 */
const CONFIGURED_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '')

export function siteOrigin(): string {
  if (CONFIGURED_ORIGIN) return CONFIGURED_ORIGIN
  return typeof window !== 'undefined' ? window.location.origin : ''
}

/** Monta uma URL pública absoluta a partir de um caminho (`/g/abc`). */
export function publicUrl(path: string): string {
  return `${siteOrigin()}${path.startsWith('/') ? path : `/${path}`}`
}
