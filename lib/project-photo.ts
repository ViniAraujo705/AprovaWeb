import { isDemo } from '@/lib/demo'
import { projectService } from '@/lib/services'
import type { Project } from '@/lib/types'
import { UploadError, resolveContentType, uploadToPresignedUrl } from '@/lib/upload'

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'))
    reader.readAsDataURL(file)
  })
}

/**
 * Sobe a foto do projeto pro R2 (presigned URL, mesmo fluxo da capa de
 * portfólio) e grava a URL pública no projeto. Compartilhado entre a criação
 * de projeto (`/projetos`) e a troca de foto no detalhe — o upload só é
 * possível depois que o projeto existe, porque o endpoint é escopado no id.
 */
export async function uploadProjectPhoto(projectId: string, file: File): Promise<Project> {
  if (isDemo()) {
    return projectService.update(projectId, { photoUrl: await readAsDataUrl(file) })
  }
  const presigned = await projectService.getPhotoUploadUrl(projectId, {
    fileName: file.name,
    contentType: resolveContentType(file),
  })
  if (!presigned.uploadUrl) throw new UploadError('Servidor não retornou URL de upload.')
  await uploadToPresignedUrl({ url: presigned.uploadUrl, file, headers: presigned.headers })
  return projectService.update(projectId, { photoUrl: presigned.publicUrl })
}
