'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Check, HardDrive, Loader2, Trash2, X } from 'lucide-react'
import { motion } from '@/components/motion'
import { projectService } from '@/lib/services'
import type { ProjectStorageSummary } from '@/lib/types'
import { ApiError } from '@/lib/api'

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * Confirmação de "Liberar armazenamento": apaga DEFINITIVAMENTE do R2 os
 * arquivos de vídeo de um projeto todo aprovado. Mostra antes o que sai e o
 * que fica, e só libera o botão depois do "entendi que não dá para recuperar"
 * — não existe lixeira do outro lado.
 */
export function ReleaseStorageModal({
  projectId,
  projectName,
  onReleased,
  onClose,
}: {
  projectId: string
  projectName: string
  onReleased: (result: { bytes: number; videos: number; releasedAt: string }) => void
  onClose: () => void
}) {
  const [summary, setSummary] = useState<ProjectStorageSummary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    projectService
      .storageSummary(projectId, controller.signal)
      .then(setSummary)
      .catch((err) => {
        if (controller.signal.aborted) return
        setLoadError(err instanceof ApiError ? err.message : 'Não foi possível calcular o espaço do projeto.')
      })
    return () => controller.abort()
  }, [projectId])

  async function release() {
    setBusy(true)
    setError(null)
    try {
      onReleased(await projectService.releaseStorage(projectId))
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error ? err.message : 'Não foi possível liberar o armazenamento.',
      )
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/70"
        onClick={busy ? undefined : onClose}
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-storage-title"
        className="relative flex max-h-[90svh] w-full max-w-md flex-col overflow-y-auto rounded-xl border border-border bg-card p-5"
        initial={{ y: 8, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 8, scale: 0.98 }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 id="release-storage-title" className="flex items-center gap-2 text-base font-semibold">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-destructive/15 text-destructive">
              <Trash2 className="size-4" />
            </span>
            Excluir os vídeos do armazenamento?
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>

        {!summary && !loadError ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Calculando o espaço do projeto…
          </div>
        ) : loadError ? (
          <p className="mt-4 flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {loadError}
          </p>
        ) : summary && !summary.releasable ? (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-secondary p-3 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" /> {summary.reason}
          </p>
        ) : summary ? (
          <>
            <p className="mt-4 text-sm text-foreground">
              Os arquivos de vídeo de <strong>{projectName}</strong> vão ser apagados{' '}
              <strong className="text-destructive">para sempre</strong>. Não tem como recuperar depois — se
              precisar deles, baixe antes.
            </p>

            <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-secondary/50 p-3">
              <HardDrive className="size-5 shrink-0 text-primary" />
              <div className="text-sm">
                <p className="font-medium text-foreground">Libera {formatBytes(summary.bytes)}</p>
                <p className="text-xs text-muted-foreground">
                  {summary.videos} {summary.videos === 1 ? 'vídeo' : 'vídeos'}, contando versões antigas
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-destructive">Sai</p>
                <ul className="mt-1.5 space-y-1 text-muted-foreground">
                  <li>Arquivo original</li>
                  <li>Cópia HD do player</li>
                  <li>Download pelo link do cliente</li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500">Fica</p>
                <ul className="mt-1.5 space-y-1 text-muted-foreground">
                  <li>Comentários e avaliações</li>
                  <li>Histórico e relatório</li>
                  <li>Miniatura de cada vídeo</li>
                </ul>
              </div>
            </div>

            <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                disabled={busy}
                className="mt-0.5 size-4 shrink-0 accent-destructive"
              />
              <span className="text-foreground">Entendi que os vídeos não podem ser recuperados depois.</span>
            </label>

            {error && (
              <p className="mt-3 flex items-start gap-1.5 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
              </p>
            )}
          </>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-secondary px-4 text-sm font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
          >
            {summary?.releasable ? 'Cancelar' : 'Fechar'}
          </button>
          {summary?.releasable && (
            <button
              type="button"
              onClick={release}
              disabled={!acknowledged || busy}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-destructive px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Excluir definitivamente
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
