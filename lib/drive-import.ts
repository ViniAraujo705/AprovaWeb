/**
 * Importa UM vídeo do Google Drive para um projeto e espera o backend
 * terminar (Drive → armazenamento em segundo plano + registro do vídeo).
 * Usado na tela de envio e na seção do Drive do projeto.
 */
import { ApiError } from '@/lib/api'
import { googleDriveService } from '@/lib/services'

const POLL_MS = 2000
const TIMEOUT_MS = 2 * 60 * 60 * 1000 // 2h: arquivo de 2GB numa conexão lenta do Drive

export class DriveImportError extends Error {}

export async function importDriveVideo(
  input: { projectId: string; googleFileId: string; name?: string },
  onProgress?: (percent: number) => void,
): Promise<string> {
  let current = await googleDriveService.startImport(input)
  const startedAt = Date.now()
  while (current.status !== 'concluido') {
    if (current.status === 'erro') throw new DriveImportError(current.error || 'Falha ao importar do Google Drive.')
    if (Date.now() - startedAt > TIMEOUT_MS)
      throw new DriveImportError('A importação está demorando demais. Confira o projeto daqui a pouco.')
    onProgress?.(current.progress)
    await new Promise((r) => setTimeout(r, POLL_MS))
    try {
      current = await googleDriveService.getImport(current.importId)
    } catch (err) {
      // Oscilação de rede no polling não derruba o import (ele segue no
      // servidor); só desiste se o backend disser que não existe.
      if (err instanceof ApiError && err.status === 404) throw err
    }
  }
  onProgress?.(100)
  if (!current.videoId) throw new DriveImportError('Importação concluída sem o vídeo criado. Confira o projeto.')
  return current.videoId
}
