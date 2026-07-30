'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRef, useState } from 'react'
import {
  ImagePlus,
  Loader2,
  Check,
  AlertTriangle,
  Trash2,
  Sparkles,
  FolderOpen,
  Plus,
  X,
} from 'lucide-react'
import { clientService, projectService } from '@/lib/services'
import type { Client, Project } from '@/lib/types'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { validateImageFile, uploadToPresignedUrl, UploadError } from '@/lib/upload'
import { isDemo } from '@/lib/demo'
import { cn } from '@/lib/utils'
import { FadeIn, AnimatePresence, motion, StaggerList, staggerItem } from '@/components/motion'
import { useRouter } from 'next/navigation'
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

export function ClientDetailView({ id }: { id: string }) {
  const client = useQuery<Client>((signal) => clientService.get(id, signal), [id])

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
      {client.loading ? (
        <Skeleton className="h-12 w-64" />
      ) : client.error ? (
        <ErrorState message={client.error} onRetry={client.refetch} />
      ) : client.data ? (
        <>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-4xl tracking-wide sm:text-5xl">{client.data.name}</h1>
            {client.data.isExample && (
              <span
                title="Cliente de exemplo — explore e delete quando quiser."
                className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary"
              >
                <Sparkles className="size-3.5" /> Exemplo
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure os dados do cliente e a legenda/foto exibidas no modo Reels da tela de aprovação.
          </p>

          <div className="mt-8">
            <ClientForm client={client.data} onUpdated={client.setData} />
          </div>

          <div className="mt-8">
            <ClientProjects clientId={id} />
          </div>
        </>
      ) : null}
    </div>
  )
}

function ClientForm({
  client,
  onUpdated,
}: {
  client: Client
  onUpdated: (updater: Client | ((prev: Client | null) => Client)) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(client.name)
  const [description, setDescription] = useState(client.description ?? '')
  const [photoUrl, setPhotoUrl] = useState<string | null>(client.photoUrl)
  const [dragging, setDragging] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function flashSaved() {
    setSaved(true)
    toast.success('Configuração salva')
    setTimeout(() => setSaved(false), 2000)
  }

  async function saveDetails() {
    setError(null)
    setBusy(true)
    try {
      const updated = await clientService.update(client.id, {
        name: name.trim(),
        description: description.trim() || null,
      })
      onUpdated(updated)
      flashSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function handleFile(file: File | undefined | null) {
    if (!file) return
    const invalid = validateImageFile(file)
    if (invalid) {
      setFileError(invalid)
      return
    }
    setFileError(null)
    setError(null)
    setBusy(true)
    try {
      // Modo demo: preview local, sem tocar no backend/R2.
      if (isDemo()) {
        const dataUrl = await readAsDataUrl(file)
        const updated = await clientService.update(client.id, { photoUrl: dataUrl })
        setPhotoUrl(updated.photoUrl)
        onUpdated(updated)
        flashSaved()
        return
      }

      // 1) presigned URL
      const presigned = await clientService.getPhotoUploadUrl({
        clientId: client.id,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
      })
      if (!presigned.uploadUrl) throw new UploadError('Servidor não retornou URL de upload.')

      // 2) upload direto pro R2
      await uploadToPresignedUrl({ url: presigned.uploadUrl, file, headers: presigned.headers })

      // 3) salva a foto no cliente
      const updated = await clientService.update(client.id, { photoUrl: presigned.publicUrl })
      setPhotoUrl(updated.photoUrl)
      onUpdated(updated)
      flashSaved()
    } catch (err) {
      if (err instanceof UploadError || err instanceof ApiError) setError(err.message)
      else setError('Falha ao enviar a foto. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function removePhoto() {
    setError(null)
    setBusy(true)
    try {
      const updated = await clientService.update(client.id, { photoUrl: null })
      setPhotoUrl(null)
      onUpdated(updated)
      flashSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao remover a foto.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FadeIn y={6}>
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="text-sm font-medium">Foto de perfil</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Aparece como avatar no modo Reels da tela do cliente. PNG, JPG, SVG ou WEBP até 2MB.
        </p>

        <div className="mt-4 flex items-center gap-4">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-full border border-border bg-secondary">
            {photoUrl ? (
              <Image src={photoUrl} alt="Foto do cliente" fill className="object-cover" sizes="64px" unoptimized />
            ) : (
              <span className="grid h-full w-full place-items-center text-lg font-bold uppercase text-muted-foreground">
                {(name || '?').slice(0, 1)}
              </span>
            )}
          </div>
          {photoUrl && (
            <button
              type="button"
              onClick={removePhoto}
              disabled={busy}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" /> Remover
            </button>
          )}
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault()
            if (!busy) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            if (!busy) handleFile(e.dataTransfer.files?.[0])
          }}
          onClick={() => !busy && inputRef.current?.click()}
          className={cn(
            'mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors',
            busy ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
            fileError
              ? 'border-destructive/60 bg-destructive/5'
              : dragging
                ? 'border-primary bg-primary/10'
                : 'border-primary/50 bg-background hover:border-primary hover:bg-primary/5',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <span className="grid size-12 place-items-center rounded-full bg-primary/15 text-primary">
            {busy ? <Loader2 className="size-6 animate-spin" /> : <ImagePlus className="size-6" />}
          </span>
          <p className="mt-2 text-sm font-medium text-foreground">
            {busy ? 'Enviando…' : 'Arraste uma foto ou clique para selecionar'}
          </p>
        </div>
        {fileError && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
            <AlertTriangle className="size-4" /> {fileError}
          </p>
        )}

        {/* Nome */}
        <label className="mt-6 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Nome</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-h-11 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>

        {/* Descrição / legenda do Reels */}
        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Legenda no modo Reels</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Gostou do resultado?💛"
            rows={2}
            className="resize-none rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          <span className="text-xs text-muted-foreground">
            Aparece como legenda por cima do vídeo na aba &quot;Preview Reels&quot; que o cliente vê.
          </span>
        </label>

        <button
          type="button"
          onClick={saveDetails}
          disabled={busy}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          Salvar
        </button>

        {error && (
          <p className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" /> {error}
          </p>
        )}

        <AnimatePresence>
          {saved && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-4 flex items-center gap-1.5 text-sm font-medium text-emerald-400"
            >
              <Check className="size-4" /> Alterações salvas
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </FadeIn>
  )
}

function ClientProjects({ clientId }: { clientId: string }) {
  const router = useRouter()
  const projects = useQuery<Project[]>((signal) => projectService.list(clientId, signal), [clientId])

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Informe o nome do projeto.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await projectService.create({ name: trimmed, clientId })
      toast.success('Projeto criado')
      router.push(`/projetos/${created.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar projeto.')
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl tracking-wide">PROJETOS</h2>
        {!creating && (
          <button
            type="button"
            onClick={() => {
              setCreating(true)
              setName('')
              setError(null)
            }}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70"
          >
            <Plus className="size-3.5" /> Novo projeto
          </button>
        )}
      </div>

      {creating && (
        <div className="mt-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Novo projeto para este cliente</span>
            <button
              type="button"
              onClick={() => setCreating(false)}
              aria-label="Cancelar"
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Reel lançamento batom"
            className="mt-3 min-h-11 w-full rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Criar projeto
          </button>
        </div>
      )}

      <div className="mt-3">
        {projects.loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-[60px] w-full" />
            ))}
          </div>
        ) : projects.error ? (
          <ErrorState message={projects.error} onRetry={projects.refetch} />
        ) : (projects.data ?? []).length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="size-7" />}
            title="Nenhum projeto ainda"
            description="Crie um projeto para este cliente para começar a enviar vídeos."
          />
        ) : (
          <StaggerList className="grid gap-3 sm:grid-cols-2">
            {(projects.data ?? []).map((p) => (
              <motion.div key={p.id} variants={staggerItem}>
                <Link
                  href={`/projetos/${p.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
                >
                  <FolderOpen className="size-5 shrink-0 text-primary" />
                  <span className="truncate font-medium text-foreground">{p.name}</span>
                </Link>
              </motion.div>
            ))}
          </StaggerList>
        )}
      </div>
    </div>
  )
}
