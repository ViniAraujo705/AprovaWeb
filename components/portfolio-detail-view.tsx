'use client'

import Image from 'next/image'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Film,
  ImageIcon,
  ImagePlus,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { portfolioProfileService, portfolioService, videoService } from '@/lib/services'
import type { Portfolio, PortfolioCategory, PortfolioItem, PortfolioItemMediaType, Video } from '@/lib/types'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { UploadError, uploadToPresignedUrl, validateImageFile, validateVideoFile } from '@/lib/upload'
import { isDemo } from '@/lib/demo'
import { AnimatePresence, motion, FadeIn } from '@/components/motion'
import { toast } from '@/lib/toast'

/** Lê um arquivo como Data URL (usado só no preview/modo demo). */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Falha ao ler a imagem.'))
    reader.readAsDataURL(file)
  })
}

export function PortfolioDetailView({ id }: { id: string }) {
  const router = useRouter()
  const portfolio = useQuery<Portfolio>((signal) => portfolioService.get(id, signal), [id])

  function updatePortfolio(next: Portfolio) {
    portfolio.setData(next)
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-10">
      {portfolio.loading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : portfolio.error ? (
        <ErrorState message={portfolio.error} onRetry={portfolio.refetch} />
      ) : portfolio.data ? (
        <PortfolioDetailBody
          portfolio={portfolio.data}
          onChange={updatePortfolio}
          onDeleted={() => router.push('/portfolios')}
        />
      ) : null}
    </div>
  )
}

function PortfolioDetailBody({
  portfolio,
  onChange,
  onDeleted,
}: {
  portfolio: Portfolio
  onChange: (next: Portfolio) => void
  onDeleted: () => void
}) {
  const publicPath = `/p/${portfolio.link}`
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${publicPath}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)

  const sortedVideos = [...portfolio.videos].sort((a, b) => a.order - b.order)

  async function moveVideo(videoId: string, direction: -1 | 1) {
    const idx = sortedVideos.findIndex((v) => v.id === videoId)
    const swapIdx = idx + direction
    if (idx === -1 || swapIdx < 0 || swapIdx >= sortedVideos.length) return
    const reordered = [...sortedVideos]
    ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]
    try {
      const updated = await portfolioService.reorder(
        portfolio.id,
        reordered.map((v) => v.id),
      )
      onChange(updated)
    } catch (err) {
      toast.error('Não foi possível reordenar', err instanceof ApiError ? err.message : undefined)
    }
  }

  async function removeVideo(videoId: string) {
    try {
      const updated = await portfolioService.removeVideo(portfolio.id, videoId)
      onChange(updated)
    } catch (err) {
      toast.error('Não foi possível remover o vídeo', err instanceof ApiError ? err.message : undefined)
    }
  }

  return (
    <>
      <PortfolioDetailsForm portfolio={portfolio} onUpdated={onChange} />

      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Link2 className="size-4 shrink-0 text-primary" />
          <span className="truncate text-muted-foreground">Link público: {publicPath}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
          <a
            href={publicPath}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary/70"
          >
            <ExternalLink className="size-3.5" /> Abrir
          </a>
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary/70"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? 'Copiado' : 'Copiar link'}
          </button>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl tracking-wide">ITENS DO PORTFÓLIO</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-secondary px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
          >
            <Search className="size-4" /> Selecionar vídeo existente
          </button>
          <button
            type="button"
            onClick={() => setUploadOpen((v) => !v)}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <UploadCloud className="size-4" /> Enviar vídeo ou foto
          </button>
        </div>
      </div>

      {uploadOpen && (
        <UploadPortfolioMediaForm
          portfolioId={portfolio.id}
          onDone={(updated) => {
            onChange(updated)
            setUploadOpen(false)
          }}
          onCancel={() => setUploadOpen(false)}
        />
      )}

      <div className="mt-4">
        {sortedVideos.length === 0 ? (
          <EmptyState
            icon={<Film className="size-7" />}
            title="Nenhum item neste portfólio"
            description="Selecione um vídeo já existente ou envie um vídeo/foto novo direto para este portfólio."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {sortedVideos.map((v, i) => (
              <PortfolioItemCard
                key={v.id}
                portfolioId={portfolio.id}
                video={v}
                isFirst={i === 0}
                isLast={i === sortedVideos.length - 1}
                onMove={(dir) => moveVideo(v.id, dir)}
                onRemove={() => removeVideo(v.id)}
                onUpdated={onChange}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-10 border-t border-border pt-6">
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-destructive/10 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
        >
          <Trash2 className="size-4" /> Excluir portfólio
        </button>
      </div>

      <AnimatePresence>
        {confirmingDelete && (
          <DeletePortfolioModal
            portfolio={portfolio}
            onClose={() => setConfirmingDelete(false)}
            onConfirm={async () => {
              await portfolioService.remove(portfolio.id)
              toast.success('Portfólio excluído')
              onDeleted()
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pickerOpen && (
          <SelectExistingVideoModal
            portfolioId={portfolio.id}
            onClose={() => setPickerOpen(false)}
            onAdded={(updated) => onChange(updated)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

function PortfolioDetailsForm({
  portfolio,
  onUpdated,
}: {
  portfolio: Portfolio
  onUpdated: (next: Portfolio) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(portfolio.name)
  const [description, setDescription] = useState(portfolio.description ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [coverBusy, setCoverBusy] = useState(false)
  const [coverError, setCoverError] = useState<string | null>(null)
  const [categoryBusy, setCategoryBusy] = useState(false)

  const categories = useQuery<PortfolioCategory[]>(
    (signal) => portfolioProfileService.listCategories(signal),
    [],
  )

  const dirty = name !== portfolio.name || description !== (portfolio.description ?? '')

  async function save() {
    if (!name.trim()) {
      setError('Informe o nome do portfólio.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const updated = await portfolioService.update(portfolio.id, {
        name: name.trim(),
        description: description.trim() || null,
      })
      onUpdated(updated)
      toast.success('Portfólio atualizado')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCoverFile(file: File | undefined | null) {
    if (!file) return
    const invalid = validateImageFile(file)
    if (invalid) {
      setCoverError(invalid)
      return
    }
    setCoverError(null)
    setCoverBusy(true)
    try {
      if (isDemo()) {
        const dataUrl = await readAsDataUrl(file)
        const updated = await portfolioService.update(portfolio.id, { coverUrl: dataUrl })
        onUpdated(updated)
        toast.success('Capa atualizada')
        return
      }
      const presigned = await portfolioService.getCoverUploadUrl(portfolio.id, {
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
      })
      if (!presigned.uploadUrl) throw new UploadError('Servidor não retornou URL de upload.')
      await uploadToPresignedUrl({ url: presigned.uploadUrl, file, headers: presigned.headers })
      const updated = await portfolioService.update(portfolio.id, { coverUrl: presigned.publicUrl })
      onUpdated(updated)
      toast.success('Capa atualizada')
    } catch (err) {
      setCoverError(
        err instanceof UploadError || err instanceof ApiError
          ? err.message
          : 'Falha ao enviar a capa.',
      )
    } finally {
      setCoverBusy(false)
    }
  }

  async function changeCategory(categoryId: string) {
    setCategoryBusy(true)
    try {
      const updated = await portfolioService.update(portfolio.id, { categoryId: categoryId || null })
      onUpdated(updated)
    } catch (err) {
      toast.error('Não foi possível mudar a categoria', err instanceof ApiError ? err.message : undefined)
    } finally {
      setCategoryBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="shrink-0">
          <span className="text-sm font-medium text-foreground">Capa</span>
          <button
            type="button"
            onClick={() => !coverBusy && inputRef.current?.click()}
            disabled={coverBusy}
            aria-label="Alterar capa do portfólio"
            className="group relative mt-1.5 block aspect-video w-40 overflow-hidden rounded-lg border border-border bg-secondary disabled:opacity-70"
          >
            {portfolio.coverUrl ? (
              <Image src={portfolio.coverUrl} alt="" fill className="object-cover" sizes="160px" unoptimized />
            ) : (
              <span className="grid h-full w-full place-items-center text-muted-foreground/60">
                <ImageIcon className="size-6" />
              </span>
            )}
            <span className="absolute inset-0 hidden items-center justify-center bg-black/50 text-white group-hover:flex">
              {coverBusy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => handleCoverFile(e.target.files?.[0])}
            />
          </button>
          {coverError && <p className="mt-1.5 max-w-40 text-xs text-destructive">{coverError}</p>}
        </div>

        <div className="min-w-0 flex-1">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Nome</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-h-11 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary sm:max-w-md"
            />
          </label>
          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Descrição</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Uma frase sobre este portfólio (opcional)"
              rows={2}
              className="resize-none rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary sm:max-w-md"
            />
          </label>
          {!categories.loading && !categories.error && (categories.data ?? []).length > 0 && (
            <label className="mt-4 flex flex-col gap-1.5 sm:max-w-md">
              <span className="text-sm font-medium text-foreground">Categoria</span>
              <select
                value={portfolio.categoryId ?? ''}
                onChange={(e) => changeCategory(e.target.value)}
                disabled={categoryBusy}
                className="min-h-11 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary disabled:opacity-50"
              >
                <option value="">Sem categoria</option>
                {(categories.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {error && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
              <AlertTriangle className="size-4" /> {error}
            </p>
          )}
          {dirty && (
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Salvar alterações
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function DeletePortfolioModal({
  portfolio,
  onClose,
  onConfirm,
}: {
  portfolio: Portfolio
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível excluir o portfólio.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/70"
        onClick={() => !busy && onClose()}
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
      <motion.div
        className="relative w-full max-w-md rounded-xl border border-border bg-card p-5"
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
            <AlertTriangle className="size-5" />
          </span>
          <h3 className="text-lg font-bold tracking-tight">Excluir portfólio?</h3>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Isso vai apagar <span className="font-medium text-foreground">{portfolio.name}</span> e o
          link público deixa de funcionar. Essa ação não pode ser desfeita.
        </p>
        {error && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" /> {error}
          </p>
        )}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-secondary px-4 text-sm font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-destructive px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Excluir permanentemente
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function SelectExistingVideoModal({
  portfolioId,
  onClose,
  onAdded,
}: {
  portfolioId: string
  onClose: () => void
  onAdded: (updated: Portfolio) => void
}) {
  const videos = useQuery<Video[]>((signal) => videoService.list(undefined, signal), [])
  const [query, setQuery] = useState('')
  const [addingId, setAddingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filtered = (videos.data ?? []).filter((v) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return v.title.toLowerCase().includes(q) || v.clientName.toLowerCase().includes(q)
  })

  async function add(video: Video) {
    setAddingId(video.id)
    setError(null)
    try {
      const updated = await portfolioService.addExistingVideo(portfolioId, video.id, {
        title: video.title,
      })
      onAdded(updated)
      toast.success('Vídeo adicionado ao portfólio')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao adicionar o vídeo.')
    } finally {
      setAddingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <motion.div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
      <motion.div
        className="relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card p-5"
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold tracking-tight">Selecionar vídeo existente</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título ou cliente"
            className="min-h-10 w-full rounded-lg border border-border bg-secondary pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </div>
        {error && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" /> {error}
          </p>
        )}
        <div className="mt-3 flex-1 overflow-y-auto">
          {videos.loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : videos.error ? (
            <ErrorState message={videos.error} onRetry={videos.refetch} />
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum vídeo encontrado.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {filtered.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => add(v)}
                    disabled={addingId === v.id}
                    className="flex w-full items-center gap-3 rounded-lg border border-border bg-background p-2 text-left transition-colors hover:border-primary/50 disabled:opacity-50"
                  >
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-secondary">
                      {v.posterUrl ? (
                        <Image src={v.posterUrl} alt="" fill className="object-cover" sizes="48px" unoptimized />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-muted-foreground/60">
                          <Film className="size-4" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground" title={v.title}>
                        {v.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{v.clientName}</p>
                    </div>
                    {addingId === v.id ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <Plus className="size-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </div>
  )
}

function UploadPortfolioMediaForm({
  portfolioId,
  onDone,
  onCancel,
}: {
  portfolioId: string
  onDone: (updated: Portfolio) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [mediaType, setMediaType] = useState<PortfolioItemMediaType>('video')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleFile(f: File | undefined | null) {
    if (!f) return
    const detectedType: PortfolioItemMediaType = f.type.startsWith('image/') ? 'foto' : 'video'
    const invalid = detectedType === 'foto' ? validateImageFile(f) : validateVideoFile(f)
    if (invalid) {
      setError(invalid)
      return
    }
    setError(null)
    setFile(f)
    setMediaType(detectedType)
    setTitle((prev) => prev || f.name.replace(/\.[^.]+$/, ''))
  }

  async function submit() {
    if (!file) {
      setError('Selecione um vídeo ou foto para enviar.')
      return
    }
    setBusy(true)
    setError(null)
    setProgress(0)
    try {
      // Modo demo: simula o upload sem tocar no backend/R2, reproduzindo o
      // arquivo local escolhido (mesmo padrão de `upload-view.tsx`).
      if (isDemo()) {
        for (let p = 20; p <= 100; p += 20) {
          await new Promise((r) => setTimeout(r, 80))
          setProgress(p)
        }
        const updated = await portfolioService.confirmUpload(portfolioId, {
          urlStorage: URL.createObjectURL(file),
          nomeArquivo: file.name,
          mediaType,
          title: title.trim() || file.name,
          description: description.trim() || undefined,
        })
        onDone(updated)
        toast.success(mediaType === 'foto' ? 'Foto enviada' : 'Vídeo enviado')
        return
      }

      const presigned = await portfolioService.getUploadUrl(portfolioId, {
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
      })
      if (!presigned.uploadUrl) throw new UploadError('Servidor não retornou URL de upload.')
      if (!presigned.publicUrl) throw new UploadError('Servidor não retornou a URL pública do arquivo.')

      await uploadToPresignedUrl({
        url: presigned.uploadUrl,
        file,
        headers: presigned.headers,
        onProgress: (p) => setProgress(p),
      })

      const updated = await portfolioService.confirmUpload(portfolioId, {
        urlStorage: presigned.publicUrl,
        nomeArquivo: file.name,
        mediaType,
        title: title.trim() || file.name,
        description: description.trim() || undefined,
      })
      onDone(updated)
      toast.success(mediaType === 'foto' ? 'Foto enviada' : 'Vídeo enviado')
    } catch (err) {
      setError(
        err instanceof UploadError || err instanceof ApiError
          ? err.message
          : 'Falha ao enviar o arquivo. Tente novamente.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <FadeIn y={6} className="mt-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Enviar vídeo ou foto para o portfólio</span>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          aria-label="Cancelar"
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
        >
          <X className="size-4" />
        </button>
      </div>

      <div
        onClick={() => !busy && inputRef.current?.click()}
        className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/50 bg-background p-6 text-center transition-colors hover:border-primary hover:bg-primary/5"
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <span className="grid size-10 place-items-center rounded-full bg-primary/15 text-primary">
          {mediaType === 'foto' && file ? (
            <ImageIcon className="size-5" />
          ) : (
            <UploadCloud className="size-5" />
          )}
        </span>
        <p className="mt-2 text-sm font-medium text-foreground">
          {file ? file.name : 'Clique para selecionar um vídeo (MP4, MOV, WEBM) ou foto (PNG, JPG, WEBP)'}
        </p>
      </div>

      {file && (
        <>
          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Título</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="min-h-11 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="mt-3 flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Descrição (opcional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="resize-none rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
        </>
      )}

      {error && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" /> {error}
        </p>
      )}

      {busy && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-primary transition-[width] duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={busy || !file}
        className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        Enviar para o portfólio
      </button>
    </FadeIn>
  )
}

function PortfolioItemCard({
  portfolioId,
  video,
  isFirst,
  isLast,
  onMove,
  onRemove,
  onUpdated,
}: {
  portfolioId: string
  video: PortfolioItem
  isFirst: boolean
  isLast: boolean
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
  onUpdated: (updated: Portfolio) => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(video.title)
  const [description, setDescription] = useState(video.description ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [removing, setRemoving] = useState(false)

  async function saveEdits() {
    setBusy(true)
    setError(null)
    try {
      const updated = await portfolioService.updateVideo(portfolioId, video.id, {
        title: title.trim() || video.title,
        description: description.trim() || null,
      })
      onUpdated(updated)
      setEditing(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    setRemoving(true)
    try {
      await onRemove()
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-video w-full bg-secondary">
        {video.posterUrl ? (
          <Image src={video.posterUrl} alt="" fill className="object-cover" sizes="50vw" unoptimized />
        ) : (
          <span className="grid h-full w-full place-items-center text-muted-foreground/60">
            <Film className="size-6" />
          </span>
        )}
        {video.processingStatus === 'processando' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="size-6 animate-spin text-white" />
          </div>
        )}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
          {video.mediaType === 'foto' ? (
            <>
              <ImageIcon className="size-3" /> Foto
            </>
          ) : (
            <>
              <Film className="size-3" /> Vídeo
            </>
          )}
        </span>
        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={isFirst}
            aria-label="Mover para cima"
            title="Mover para cima"
            className="grid size-7 place-items-center rounded-lg bg-card/90 text-foreground ring-1 ring-border hover:bg-secondary disabled:opacity-40"
          >
            <ChevronUp className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={isLast}
            aria-label="Mover para baixo"
            title="Mover para baixo"
            className="grid size-7 place-items-center rounded-lg bg-card/90 text-foreground ring-1 ring-border hover:bg-secondary disabled:opacity-40"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>
      </div>

      <div className="p-3">
        {editing ? (
          <>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="min-h-9 w-full rounded-lg border border-border bg-secondary px-2.5 text-sm text-foreground outline-none focus:border-primary"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Descrição (opcional)"
              className="mt-2 w-full resize-none rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={saveEdits}
                disabled={busy}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
              >
                {busy && <Loader2 className="size-3.5 animate-spin" />}
                Salvar
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setTitle(video.title)
                  setDescription(video.description ?? '')
                  setError(null)
                }}
                disabled={busy}
                className="inline-flex min-h-8 items-center rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-medium text-foreground" title={video.title}>
                {video.title}
              </h3>
              {video.description && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {video.description}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label={`Editar ${video.title}`}
                className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Pencil className="size-3.5" />
              </button>
              {confirmingRemove ? (
                <div className="flex items-center gap-1 rounded-lg bg-background p-0.5 ring-1 ring-border">
                  <button
                    type="button"
                    onClick={handleRemove}
                    disabled={removing}
                    className="inline-flex min-h-7 items-center gap-1 rounded-md bg-destructive px-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {removing ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingRemove(false)}
                    disabled={removing}
                    aria-label="Cancelar exclusão"
                    className="grid size-7 place-items-center rounded-md text-foreground disabled:opacity-50"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(true)}
                  aria-label={`Remover ${video.title}`}
                  className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
