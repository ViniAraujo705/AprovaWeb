/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  /**
   * Domínio antigo (`vistoow.com.br`) redireciona pro canônico
   * (`checkprod.com.br`) preservando o path e a query.
   *
   * Enquanto os dois domínios serviam o app, quem navegasse pelo endereço
   * antigo continuava vendo a marca velha e — antes de `lib/site.ts` — gerava
   * link público com ela. O 308 encerra isso: link antigo já distribuído
   * continua funcionando (o path vem junto) e não existe mais sessão viva no
   * domínio velho.
   *
   * Pré-requisito atendido antes de ligar: a política de CORS do bucket R2 já
   * aceita `checkprod.com.br` e `www.checkprod.com.br`, senão empurrar todo
   * mundo pro domínio novo quebraria todo upload presigned (vídeo, foto, logo).
   */
  async redirects() {
    return ['vistoow.com.br', 'www.vistoow.com.br'].map((host) => ({
      source: '/:path*',
      has: [{ type: 'host', value: host }],
      destination: 'https://checkprod.com.br/:path*',
      permanent: true,
    }))
  },
}

export default nextConfig
