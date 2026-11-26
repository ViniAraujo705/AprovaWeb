import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Check — Aprovações',
    short_name: 'Check',
    description:
      'Envie conteúdos, compartilhe links e receba aprovações e comentários do cliente.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#253326',
    theme_color: '#253326',
    lang: 'pt-BR',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/logo-check.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}
