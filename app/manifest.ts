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
    background_color: '#0b0b0d',
    theme_color: '#0b0b0d',
    lang: 'pt-BR',
    icons: [
      {
        src: '/logo-check.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  }
}
