'use client'

/**
 * Editores com acesso ao projeto — só o owner atribui/remove. Editor sem
 * atribuição em nenhum projeto simplesmente não vê o projeto na listagem
 * (filtrado pelo backend), então esse componente não precisa de variante
 * somente-leitura pro editor.
 */
import { useState } from 'react'
import { Loader2, UserPlus, X } from 'lucide-react'
import { projectService } from '@/lib/services'
import { ApiError } from '@/lib/api'
import type { ProjectMember, TeamMember } from '@/lib/types'

export function ProjectMembersField({
  projectId,
  members,
  candidates,
  onUpdated,
}: {
  projectId: string
  members: ProjectMember[]
  /** Membros ativos da conta elegíveis para atribuir (exclui quem já está no projeto). */
  candidates: TeamMember[]
  onUpdated: (members: ProjectMember[]) => void
}) {
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const assignableCandidates = candidates.filter(
    (c) => !members.some((m) => m.userId === c.id),
  )

  async function assign(memberId: string) {
    if (!memberId) return
    setSaving(memberId)
    setError(null)
    try {
      const updated = await projectService.assignMember(projectId, memberId)
      onUpdated(updated)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível atribuir o editor.')
    } finally {
      setSaving(null)
    }
  }

  async function remove(memberId: string) {
    setSaving(memberId)
    setError(null)
    try {
      const updated = await projectService.removeMember(projectId, memberId)
      onUpdated(updated)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível remover o editor.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs font-medium text-muted-foreground">
        Editores com acesso a este projeto
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {members.length === 0 && (
          <span className="text-xs text-muted-foreground">Nenhum editor atribuído ainda.</span>
        )}
        {members.map((m) => (
          <span
            key={m.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-secondary py-1 pl-2.5 pr-1.5 text-xs font-medium text-foreground ring-1 ring-border"
          >
            {m.name || m.email}
            <button
              type="button"
              onClick={() => remove(m.userId)}
              disabled={saving === m.userId}
              aria-label={`Remover ${m.name || m.email} do projeto`}
              className="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive disabled:opacity-50"
            >
              {saving === m.userId ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <X className="size-3" />
              )}
            </button>
          </span>
        ))}
        {assignableCandidates.length > 0 && (
          <div className="inline-flex items-center gap-1.5">
            <UserPlus className="size-3.5 text-muted-foreground" />
            <select
              value=""
              disabled={saving !== null}
              onChange={(e) => assign(e.target.value)}
              className="min-h-8 rounded-lg border border-border bg-secondary px-2 text-xs text-foreground outline-none focus:border-primary disabled:opacity-60"
            >
              <option value="" disabled>
                Adicionar editor...
              </option>
              {assignableCandidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.email}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  )
}
