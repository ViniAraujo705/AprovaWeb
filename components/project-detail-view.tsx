'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  MessageSquare,
  Clock,
  ChevronRight,
  Film,
  FileDown,
  Download,
  Loader2,
  AlertTriangle,
  Sparkles,
  Link2,
  Copy,
  Check,
  Trash2,
  X,
  Lock,
  Archive,
  ArchiveRestore,
} from 'lucide-react'
import { projectService, publicService, reportService, teamService, videoService } from '@/lib/services'
import type { Project, TeamMember, Video } from '@/lib/types'
import { StatusBadge } from '@/components/status-badge'
import { DeadlineBadge, DeadlineField } from '@/components/deadline-badge'
import { EditorAssignBadge, EditorAssignField } from '@/components/editor-assign-field'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { useQuery } from '@/lib/use-query'
import { useAuth } from '@/components/auth-provider'
import { ApiError } from '@/lib/api'
import { formatDuration, formatSentAt } from '@/lib/format'
import { triggerDownload } from '@/lib/download'
import { toast } from '@/lib/toast'
import { archiveProject, isProjectArchived, unarchiveProject } from '@/lib/archived-projects'
import { usePlanLimit } from '@/components/plan-limit-provider'

export function ProjectDetailView({ id }: { id: string }) {
  const router = useRouter()
  const { user } = useAuth()
  const isOwner = user?.teamRole === 'owner'
  const { planStatus, handlePlanLimitError, openUpgradeModal } = usePlanLimit()
  const project = useQuery<Project>((signal) => projectService.get(id, signal), [id])
  const videos = useQuery<Video[]>((signal) => videoService.list(id, signal), [id])
  // Esconde versões antigas (substituídas por um reenvio via "Enviar nova
  // versão" na tela de revisão) — só a mais recente de cada cadeia aparece
  // aqui. A antiga continua acessível por link direto, só não polui a lista.
  const currentVideos = (videos.data ?? []).filter((v) => v.latestVersionId === v.id)
  // Buscado para todo mundo: o editor precisa ver o nome do responsável, mesmo sem poder editar.
  const members = useQuery<TeamMember[]>((signal) => teamService.members(signal), [])
  const assignableMembers = (members.data ?? []).filter((m) => m.status === 'active')

  function updateVideoDeadline(videoId: string, deadline: string | null) {
    videos.setData((prev) =>
      (prev ?? []).map((v) => (v.id === videoId ? { ...v, deadline } : v)),
    )
  }

  function updateVideoEditor(videoId: string, editorId: string | null) {
    videos.setData((prev) =>
      (prev ?? []).map((v) => (v.id === videoId ? { ...v, editorId } : v)),
    )
  }

  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const galleryPath = project.data?.publicLink ? `/g/${project.data.publicLink}` : null
  const [copied, setCopied] = useState(false)

  async function copyGalleryLink() {
    if (!galleryPath) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${galleryPath}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const pdfLocked = planStatus ? !planStatus.limits.pdfReports : false

  async function exportReport() {
    if (pdfLocked) {
      openUpgradeModal('Exportar relatório em PDF é exclusivo dos planos pagos.')
      return
    }
    setExporting(true)
    setExportError(null)
    try {
      const { url, filename } = await reportService.getProjectReport(id)
      triggerDownload(url, filename)
      toast.success('Relatório gerado', 'O download deve começar em instantes.')
    } catch (err) {
      if (handlePlanLimitError(err)) return
      setExportError(err instanceof ApiError ? err.message : 'Não foi possível gerar o relatório.')
    } finally {
      setExporting(false)
    }
  }

  // Seleção múltipla de vídeos do projeto, para baixar vários de uma vez.
  // A listagem por projeto (`GET /videos`) é uma resposta enxuta e às vezes
  // não traz a URL pronta do vídeo — só o link público (que sempre vem, é o
  // que monta o "Abrir link do cliente"). Por isso um vídeo é selecionável
  // se tiver `url` OU `publicLink`: sem `url` direto, resolvemos a URL real
  // na hora do download via `publicService.getByLink` (mesma fonte que já
  // funciona no botão de baixar da tela do vídeo).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDownloading, setBulkDownloading] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const downloadableVideos = currentVideos.filter((v) => !!v.url || !!v.publicLink)

  function toggleSelected(videoId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(videoId)) next.delete(videoId)
      else next.add(videoId)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size === downloadableVideos.length
        ? new Set()
        : new Set(downloadableVideos.map((v) => v.id)),
    )
  }

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [confirmingProjectDelete, setConfirmingProjectDelete] = useState(false)
  const [deletingProject, setDeletingProject] = useState(false)
  const [projectDeleteError, setProjectDeleteError] = useState<string | null>(null)
  const [archived, setArchived] = useState(false)
  useEffect(() => {
    setArchived(isProjectArchived(id))
  }, [id])

  const hasVideos = currentVideos.length > 0

  /** Só chamada quando o projeto não tem vídeo — aí sim é seguro excluir de verdade. */
  async function removeProject() {
    setDeletingProject(true)
    setProjectDeleteError(null)
    try {
      await projectService.remove(id)
      toast.success('Projeto excluído')
      router.push('/projetos')
    } catch (err) {
      setProjectDeleteError(
        err instanceof ApiError ? err.message : 'Não foi possível excluir o projeto.',
      )
      setDeletingProject(false)
      setConfirmingProjectDelete(false)
    }
  }

  /**
   * Projeto com vídeo dentro não é excluído de verdade — só arquivado (some
   * da lista principal). Evita risco de perder vídeo do cliente enquanto o
   * backend não decide o comportamento de cascade delete.
   */
  function toggleArchived() {
    if (archived) {
      unarchiveProject(id)
      setArchived(false)
      toast.success('Projeto desarquivado')
    } else {
      archiveProject(id)
      setArchived(true)
      toast.success('Projeto arquivado', 'Ele some da lista principal, mas nada foi apagado.')
      router.push('/projetos')
    }
  }

  async function removeVideo(id: string) {
    setDeletingId(id)
    setDeleteError(null)
    try {
      await videoService.remove(id)
      videos.setData((prev) => (prev ?? []).filter((v) => v.id !== id))
      setSelected((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      toast.success('Vídeo excluído')
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Não foi possível excluir o vídeo.')
    } finally {
      setDeletingId(null)
      setConfirmingDeleteId(null)
    }
  }

  /** Baixa os vídeos selecionados um a um — em sequência, pra não disparar vários downloads simultâneos e o navegador bloquear. */
  async function downloadSelected() {
    const items = downloadableVideos.filter((v) => selected.has(v.id))
    if (items.length === 0) return
    setBulkDownloading(true)
    setBulkError(null)
    let failed = 0
    try {
      for (const v of items) {
        try {
          let url = v.originalUrl ?? v.url ?? null
          if (!url && v.publicLink) {
            const resolved = (await publicService.getByLink(v.publicLink)).video
            url = resolved.originalUrl ?? resolved.url
          }
          if (!url) {
            failed++
            continue
          }
          await triggerDownload(url, `${v.title || 'video'}.mp4`)
          await new Promise((resolve) => setTimeout(resolve, 400))
        } catch {
          failed++
        }
      }
      if (failed > 0) setBulkError(`${failed} vídeo(s) não puderam ser baixados.`)
      else toast.success(`${items.length} vídeo(s) baixados`)
    } finally {
      setBulkDownloading(false)
    }
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        {project.loading ? (
          <Skeleton className="h-12 w-64" />
        ) : project.error ? (
          <ErrorState message={project.error} onRetry={project.refetch} />
        ) : (
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {project.data?.client?.name ?? 'Projeto'}
            </p>
            <div className="mt-1 flex min-w-0 items-center gap-3">
              <h1
                className="truncate text-3xl font-bold tracking-tight sm:text-4xl"
                title={project.data?.name ?? 'Projeto'}
              >
                {project.data?.name ?? 'Projeto'}
              </h1>
              {project.data?.isExample && (
                <span
                  title="Projeto de exemplo — explore e delete quando quiser."
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary"
                >
                  <Sparkles className="size-3.5" /> Exemplo
                </span>
              )}
            </div>
          </div>
        )}

        {!project.error && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportReport}
              disabled={exporting}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileDown className="size-4" />
              )}
              Exportar relatório
              {pdfLocked && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  <Lock className="size-3" /> Pro
                </span>
              )}
            </button>
            {isOwner && archived && (
              <button
                type="button"
                onClick={toggleArchived}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary/40 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
              >
                <ArchiveRestore className="size-4" />
                Desarquivar projeto
              </button>
            )}
            {isOwner && !archived && videos.loading && (
              <button
                type="button"
                disabled
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground opacity-50"
              >
                <Loader2 className="size-4 animate-spin" />
                Excluir projeto
              </button>
            )}
            {isOwner &&
              !archived &&
              !videos.loading &&
              (hasVideos ? (
                <button
                  type="button"
                  onClick={toggleArchived}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                  title="Projeto tem vídeos — é arquivado em vez de excluído, pra não perder nada do cliente."
                >
                  <Archive className="size-4" />
                  Arquivar projeto
                </button>
              ) : confirmingProjectDelete ? (
                <div className="flex items-center gap-1.5 rounded-lg bg-card p-1 ring-1 ring-border">
                  <button
                    type="button"
                    onClick={removeProject}
                    disabled={deletingProject}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-destructive px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {deletingProject ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                    Confirmar exclusão
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingProjectDelete(false)}
                    disabled={deletingProject}
                    aria-label="Cancelar exclusão do projeto"
                    className="grid size-9 place-items-center rounded-lg bg-secondary text-foreground disabled:opacity-50"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingProjectDelete(true)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                  Excluir projeto
                </button>
              ))}
          </div>
        )}
      </div>
      {exportError && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
          <AlertTriangle className="size-4" /> {exportError}
        </p>
      )}
      {projectDeleteError && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
          <AlertTriangle className="size-4" /> {projectDeleteError}
        </p>
      )}

      {galleryPath && (
        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <Link2 className="size-4 shrink-0 text-primary" />
            <span className="truncate text-muted-foreground">Galeria do projeto: {galleryPath}</span>
          </div>
          <button
            type="button"
            onClick={copyGalleryLink}
            className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary/70 sm:ml-auto"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? 'Copiado' : 'Copiar link da galeria'}
          </button>
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl tracking-wide">VÍDEOS DO PROJETO</h2>
        {downloadableVideos.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={selected.size > 0 && selected.size === downloadableVideos.length}
                onChange={toggleSelectAll}
              />
              Selecionar todos
            </label>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={downloadSelected}
                disabled={bulkDownloading}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {bulkDownloading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Baixar selecionados ({selected.size})
              </button>
            )}
          </div>
        )}
      </div>
      {bulkError && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
          <AlertTriangle className="size-4" /> {bulkError}
        </p>
      )}
      {deleteError && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
          <AlertTriangle className="size-4" /> {deleteError}
        </p>
      )}

      <div className="mt-4">
        {videos.loading ? (
          <div className="grid gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 rounded-xl border border-border bg-card p-3">
                <Skeleton className="aspect-video w-28 shrink-0 sm:w-40" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : videos.error ? (
          <ErrorState message={videos.error} onRetry={videos.refetch} />
        ) : currentVideos.length === 0 ? (
          <EmptyState
            icon={<Film className="size-7" />}
            title="Nenhum vídeo neste projeto"
            description="Envie o primeiro vídeo para começar a coletar aprovação e comentários."
            action={
              <Link
                href="/upload"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Enviar vídeo
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3">
            {currentVideos.map((v) => {
              const publicHref = v.publicLink
                ? project.data?.publicLink
                  ? `/v/${v.publicLink}?g=${encodeURIComponent(project.data.publicLink)}`
                  : `/v/${v.publicLink}`
                : null
              return (
                <div
                  key={v.id}
                  className="group relative flex min-w-0 items-center gap-4 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/50"
                >
                  {/*
                    Link "esticado": cobre o card inteiro por baixo. O seletor de
                    editor/prazo abaixo fica acima dele (z-index maior) — não pode
                    ficar aninhado DENTRO do <a>, senão o clique no <select> aciona
                    a navegação do link em vez de abrir o dropdown.
                  */}
                  {publicHref && (
                    <Link
                      href={publicHref}
                      aria-label={`Abrir link do cliente de ${v.title}`}
                      className="absolute inset-0 z-[1] rounded-xl"
                    />
                  )}

                  <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-secondary sm:w-40">
                    <Image
                      src={v.posterUrl || '/placeholder.svg'}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="160px"
                      unoptimized
                    />
                    {(v.url || v.publicLink) && (
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${v.title} para baixar`}
                        checked={selected.has(v.id)}
                        onChange={() => toggleSelected(v.id)}
                        className="absolute left-1.5 top-1.5 z-[2] size-4 cursor-pointer accent-primary"
                      />
                    )}
                    <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {formatDuration(v.duration)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {v.type}
                      </span>
                      <StatusBadge status={v.status} />
                      {v.version > 1 && (
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          v{v.version}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1.5 truncate font-medium text-foreground" title={v.title}>
                      {v.title}
                    </h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3.5" />
                        {formatSentAt(v.createdAt)}
                      </span>
                      <span
                        className={
                          v.commentsCount > 0
                            ? 'inline-flex items-center gap-1 font-medium text-foreground'
                            : 'inline-flex items-center gap-1'
                        }
                      >
                        <MessageSquare
                          className="size-3.5"
                          fill={v.commentsCount > 0 ? 'currentColor' : 'none'}
                        />
                        {v.commentsCount}
                      </span>
                    </div>
                    {/*
                      Prazo de entrega e editor responsável: só a equipe vê (owner
                      edita, editor só lê). Só ESTA linha precisa ficar acima do
                      link esticado (z-index maior) — o resto do card (miniatura,
                      título, etc.) fica sem z-index de propósito, pra deixar o
                      clique passar direto pro link por baixo.
                    */}
                    <div className="relative z-[2] mt-2 flex flex-wrap items-center gap-2">
                      {isOwner ? (
                        <DeadlineField
                          videoId={v.id}
                          deadline={v.deadline}
                          onUpdated={(deadline) => updateVideoDeadline(v.id, deadline)}
                        />
                      ) : (
                        <DeadlineBadge deadline={v.deadline} />
                      )}
                      {isOwner ? (
                        <EditorAssignField
                          videoId={v.id}
                          editorId={v.editorId}
                          members={assignableMembers}
                          onUpdated={(editorId) => updateVideoEditor(v.id, editorId)}
                        />
                      ) : (
                        <EditorAssignBadge editorId={v.editorId} members={assignableMembers} />
                      )}
                    </div>
                  </div>
                  <ChevronRight className="hidden size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary sm:block" />

                  {isOwner && (
                    <div className="absolute right-3 top-3 z-[2]">
                      {confirmingDeleteId === v.id ? (
                        <div className="flex items-center gap-1.5 rounded-lg bg-card p-1 shadow-lg ring-1 ring-border">
                          <button
                            type="button"
                            onClick={() => removeVideo(v.id)}
                            disabled={deletingId === v.id}
                            className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-destructive px-2.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                          >
                            {deletingId === v.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingDeleteId(null)}
                            disabled={deletingId === v.id}
                            aria-label="Cancelar exclusão"
                            className="grid size-8 place-items-center rounded-lg bg-secondary text-foreground disabled:opacity-50"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmingDeleteId(v.id)}
                          aria-label={`Excluir ${v.title}`}
                          className="grid size-8 place-items-center rounded-lg bg-card/90 text-muted-foreground ring-1 ring-border hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
