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
    clickDownloadLink(blobUrl, filename)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000)
  } catch {
    clickDownloadLink(url, filename, true)
  }
}
