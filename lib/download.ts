function clickDownloadLink(href: string, filename?: string, openInNewTab = false) {
  const a = document.createElement('a')
  a.href = href
  if (filename) a.download = filename
  if (openInNewTab) {
    a.target = '_blank'
    a.rel = 'noopener'
  }
  document.body.appendChild(a)
  a.click()
  a.remove()
}

const KNOWN_EXTENSION = /\.(mp4|mov|m4v|webm|mkv|avi|jpe?g|png|webp|gif|svg|pdf|zip|csv|txt)$/i

const MIME_EXTENSION: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-m4v': 'm4v',
  'video/x-matroska': 'mkv',
}

/**
 * Garante que o nome salvo tenha extensão. Sem ela o arquivo baixa como
 * "dr.italo - olhar cansado" e nem o celular nem o WhatsApp conseguem abrir
 * (o sistema lê ".italo - olhar cansado" como extensão). A extensão vem do
 * tipo do arquivo baixado, depois do caminho da URL e, por fim, mp4.
 */
function withExtension(filename: string, url: string, mime?: string) {
  const name = filename.trim()
  if (KNOWN_EXTENSION.test(name)) return name
  const fromMime = mime ? MIME_EXTENSION[mime.split(';')[0].trim().toLowerCase()] : undefined
  let fromUrl: string | undefined
  try {
    const match = new URL(url, window.location.href).pathname.match(/\.([a-z0-9]{2,4})$/i)
    if (match && KNOWN_EXTENSION.test(`.${match[1]}`)) fromUrl = match[1].toLowerCase()
  } catch {}
  return `${name || 'video'}.${fromMime ?? fromUrl ?? 'mp4'}`
}

/**
 * Dispara o download de um arquivo a partir de uma URL.
 *
 * - blob:/data: → já é local, força o download direto com o nome informado.
 * - URL remota (ex.: R2) → o atributo `download` do <a> é ignorado pelo
 *   navegador em origens diferentes, então baixamos o arquivo via `fetch` e
 *   forçamos o download a partir do blob resultante (mesma origem, o
 *   navegador respeita o nome do arquivo em vez de só abrir/tocar o vídeo).
 *   Se o fetch falhar (ex.: CORS não liberado no bucket), cai de volta para
 *   abrir o arquivo em nova aba — melhor que travar o clique.
 */
export async function triggerDownload(url: string, filename?: string) {
  if (typeof document === 'undefined') return
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    clickDownloadLink(url, filename)
    if (url.startsWith('blob:')) {
      // Dá tempo do download iniciar antes de liberar a memória.
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    }
    return
  }
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(String(res.status))
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    clickDownloadLink(blobUrl, filename ? withExtension(filename, url, blob.type) : undefined)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000)
  } catch {
    clickDownloadLink(url, filename ? withExtension(filename, url) : undefined, true)
  }
}
