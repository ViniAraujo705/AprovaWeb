/**
 * Projetos "arquivados": só oculta da lista principal (/projetos), não apaga
 * nada no backend — usado para projetos com vídeos, onde excluir de verdade
 * arriscaria dado do cliente. Guardado no localStorage do navegador, então
 * não sincroniza entre membros da equipe em dispositivos diferentes.
 */
import { ARCHIVED_PROJECTS_KEY } from '@/lib/config'

export function getArchivedProjectIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(ARCHIVED_PROJECTS_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function isProjectArchived(id: string): boolean {
  return getArchivedProjectIds().includes(id)
}

export function archiveProject(id: string): void {
  const current = getArchivedProjectIds()
  if (current.includes(id)) return
  try {
    window.localStorage.setItem(ARCHIVED_PROJECTS_KEY, JSON.stringify([...current, id]))
  } catch {
    // localStorage indisponível (ex.: modo privado) — segue sem persistir.
  }
}

export function unarchiveProject(id: string): void {
  const next = getArchivedProjectIds().filter((p) => p !== id)
  try {
    window.localStorage.setItem(ARCHIVED_PROJECTS_KEY, JSON.stringify(next))
  } catch {
    // localStorage indisponível — segue sem persistir.
  }
}
