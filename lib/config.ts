/**
 * Configuração central do frontend.
 */

// URL base da API. Configurada via NEXT_PUBLIC_API_URL (.env.local).
// Sem barra no final para facilitar a concatenação de paths.
export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
).replace(/\/+$/, '')

// Chaves usadas para persistir a sessão no navegador (MVP: localStorage).
export const TOKEN_STORAGE_KEY = 'aprova_token'
export const USER_STORAGE_KEY = 'aprova_user'
// Flag do modo demo (navegação sem backend).
export const DEMO_FLAG_KEY = 'aprova_demo'
// Ids de projetos arquivados (ver lib/archived-projects.ts).
export const ARCHIVED_PROJECTS_KEY = 'aprova_archived_projects'

// Limites de upload (espelham as regras do backend/R2).
export const UPLOAD_MAX_BYTES = 500 * 1024 * 1024 // 500MB
export const UPLOAD_ACCEPTED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']
export const UPLOAD_ACCEPTED_LABEL = 'MP4, MOV até 500MB'

// Contato comercial para upgrade de plano (sem checkout ainda).
export const WHATSAPP_SUPPORT_NUMBER =
  process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT ?? '5585987984966'

export function buildWhatsAppUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_SUPPORT_NUMBER}?text=${encodeURIComponent(message)}`
}
