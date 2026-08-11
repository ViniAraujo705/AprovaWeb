/**
 * Upload direto para o R2 via presigned URL, com progresso real.
 *
 * Usamos XMLHttpRequest (e não fetch) porque só o XHR expõe o evento
 * `upload.onprogress` necessário para a barra de progresso.
 */
import { UPLOAD_ACCEPTED_TYPES, UPLOAD_MAX_BYTES } from '@/lib/config'

export class UploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UploadError'
  }
}

/** Valida o arquivo antes de qualquer chamada de rede. */
export function validateVideoFile(file: File): string | null {
  const typeOk =
    UPLOAD_ACCEPTED_TYPES.includes(file.type) || /\.(mp4|mov|webm)$/i.test(file.name)
  if (!typeOk) return 'Formato inválido. Envie um arquivo MP4, MOV ou WEBM.'
  if (file.size > UPLOAD_MAX_BYTES) return 'Arquivo muito grande. O limite é 500MB.'
  if (file.size === 0) return 'O arquivo está vazio.'
  return null
}

// Logo da agência (branding): imagens leves.
export const LOGO_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
export const LOGO_MAX_BYTES = 2 * 1024 * 1024 // 2MB

/** Valida o logo da agência antes de qualquer chamada de rede. */
export function validateImageFile(file: File): string | null {
  const typeOk =
    LOGO_ACCEPTED_TYPES.includes(file.type) || /\.(png|jpe?g|svg|webp)$/i.test(file.name)
  if (!typeOk) return 'Formato inválido. Envie um PNG, JPG, SVG ou WEBP.'
  if (file.size > LOGO_MAX_BYTES) return 'Imagem muito grande. O limite é 2MB.'
  if (file.size === 0) return 'O arquivo está vazio.'
  return null
}

// Fotos de portfólio (capa de álbum, item de álbum): fotografia de verdade
// (câmera/celular), precisa de bem mais margem que o logo da agência.
export const PHOTO_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const PHOTO_MAX_BYTES = 15 * 1024 * 1024 // 15MB

/** Valida uma foto de portfólio (capa ou item) antes de qualquer chamada de rede. */
export function validatePhotoFile(file: File): string | null {
  const typeOk =
    PHOTO_ACCEPTED_TYPES.includes(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name)
  if (!typeOk) return 'Formato inválido. Envie um PNG, JPG ou WEBP.'
  if (file.size > PHOTO_MAX_BYTES) return 'Imagem muito grande. O limite é 15MB.'
  if (file.size === 0) return 'O arquivo está vazio.'
  return null
}

/** Bytes por segundo (média desde o início) e ETA em segundos, junto do percentual. */
export interface UploadProgressInfo {
  loaded: number
  total: number
  bytesPerSecond: number
  etaSeconds: number | null
}

interface UploadOptions {
  url: string
  file: File
  method?: 'PUT' | 'POST'
  headers?: Record<string, string>
  onProgress?: (percent: number, info: UploadProgressInfo) => void
  signal?: AbortSignal
}

export function uploadToPresignedUrl({
  url,
  file,
  method = 'PUT',
  headers,
  onProgress,
  signal,
}: UploadOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url, true)

    // Content-Type: usa o do arquivo, salvo se o backend exigir outro.
    const finalHeaders = headers ?? { 'Content-Type': file.type || 'application/octet-stream' }
    for (const [k, v] of Object.entries(finalHeaders)) xhr.setRequestHeader(k, v)

    const startedAt = performance.now()
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const elapsedSeconds = (performance.now() - startedAt) / 1000
        // Velocidade média desde o início — mais estável que instantânea entre
        // dois eventos `progress` (que podem vir bem espaçados ou em rajada).
        const bytesPerSecond = elapsedSeconds > 0.2 ? e.loaded / elapsedSeconds : 0
        const remaining = e.total - e.loaded
        const etaSeconds = bytesPerSecond > 0 ? remaining / bytesPerSecond : null
        onProgress(Math.round((e.loaded / e.total) * 100), {
          loaded: e.loaded,
          total: e.total,
          bytesPerSecond,
          etaSeconds,
        })
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new UploadError(`Falha no upload (HTTP ${xhr.status}).`))
    }
    xhr.onerror = () =>
      reject(new UploadError('Falha de rede durante o upload. Tente novamente.'))
    xhr.onabort = () => reject(new DOMException('Upload cancelado', 'AbortError'))

    if (signal) {
      if (signal.aborted) {
        xhr.abort()
        return
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }

    xhr.send(file)
  })
}
