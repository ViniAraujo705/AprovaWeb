import os from 'node:os'

/**
 * IPs da máquina na rede local, para abrir o app no celular durante o
 * desenvolvimento (`next dev -H 0.0.0.0` + `http://<ip>:3000`).
 *
 * O Next 16 bloqueia por padrão os recursos de `/_next` quando a origem não é
 * `localhost`: o HTML chega, mas nenhum chunk de JS carrega — a página fica
 * branca com só os pedaços estáticos na tela, sem erro nenhum no aparelho (o
 * aviso sai no terminal do dev server). Calcular a lista aqui, em vez de fixar
 * um IP, evita ter que mexer neste arquivo toda vez que a máquina troca de
 * rede (Wi-Fi ↔ hotspot dão faixas diferentes).
 *
 * Só vale em desenvolvimento — `allowedDevOrigins` é ignorado no build de
 * produção.
 */
function lanOrigins() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface.address)
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  allowedDevOrigins: lanOrigins(),
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    /*
     * Cache de disco do Turbopack no `next build` (padrão `true` no 16.3) fica
     * desligado: a Vercel restaura esse cache entre deploys e ele serviu uma
     * versão antiga do app/globals.css — o deploy saiu com os componentes
     * novos e os tokens de cor velhos. Build um pouco mais lento, mas sempre
     * fiel ao código.
     */
    turbopackFileSystemCacheForBuild: false,
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
