'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import {
  Images,
  Plus,
  Loader2,
  Film,
  Link2,
  Check,
  Copy,
  ExternalLink,
  ImagePlus,
  Pencil,
  Trash2,
  User,
  X,
} from 'lucide-react'
import { portfolioProfileService, portfolioService } from '@/lib/services'
import type { Portfolio, PortfolioCategory, PortfolioProfile } from '@/lib/types'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { UploadError, uploadToPresignedUrl, validateImageFile } from '@/lib/upload'
import { isDemo } from '@/lib/demo'
import { StaggerList, staggerItem, motion } from '@/components/motion'
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

/**
 * Lista de portfólios (rota /portfolios, só owner) — vitrines de vídeos/fotos
 * curadas manualmente para atrair novos clientes. Cada portfólio é um álbum
 * com link público próprio (/p/:link); todos juntos aparecem agrupados por
 * categoria no hub público da agência (/portfolio/:hubLink), configurado
 * aqui em cima (foto de perfil + categorias).
 */
export function PortfoliosView() {
  const router = useRouter()
  const portfolios = useQuery<Portfolio[]>((signal) => portfolioService.list(signal), [])
  const profile = useQuery<PortfolioProfile>((signal) => portfolioProfileService.get(signal), [])
  const categories = useQuery<PortfolioCategory[]>(
    (signal) => portfolioProfileService.listCategories(signal),
    [],
  )

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openForm() {
    setCreating(true)
    setName('')
    setDescription('')
    setCategoryId('')
    setError(null)
  }

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Informe o nome do portfólio.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await portfolioService.create({
        name: trimmed,
        description: description.trim() || undefined,
        categoryId: categoryId || null,
      })
      portfolios.setData((prev) => [...(prev ?? []), created])
      setCreating(false)
      toast.success('Portfólio criado')
      router.push(`/portfolios/${created.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar portfólio.')
    } finally {
      setBusy(false)
    }
  }

  const all = portfolios.data ?? []
  const allCategories = categories.data ?? []
  const categoriesWithPortfolios = allCategories.map((c) => ({
    category: c,
    items: all.filter((p) => p.categoryId === c.id),
  }))
  const uncategorized = all.filter(
    (p) => !p.categoryId || !allCategories.some((c) => c.id === p.categoryId),
  )

  return (
    <div className="flex flex-1 flex-col px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-wide sm:text-5xl">PORTFÓLIOS</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monte vitrines de vídeos e fotos em destaque e compartilhe como link público, sem
            dados de cliente.
          </p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={openForm}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-4" /> Novo portfólio
          </button>
        )}
      </div>

      {!profile.loading && !profile.error && profile.data && (
        <PortfolioProfileCard profile={profile.data} onUpdated={profile.setData} />
      )}

      {!categories.loading && !categories.error && (
        <CategoriesManager categories={allCategories} onChange={categories.setData} />
      )}

      {creating && (
        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Novo portfólio</span>
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
            placeholder="Nome do portfólio (ex: Reels para redes sociais)"
            className="mt-3 min-h-11 w-full rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrição (opcional)"
            rows={2}
            className="mt-2 w-full resize-none rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          {allCategories.length > 0 && (
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-2 min-h-11 w-full rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="">Sem categoria</option>
              {allCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Criar portfólio
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-1 flex-col">
        {portfolios.loading ? (
          <div className="m-auto grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full rounded-xl" />
            ))}
          </div>
        ) : portfolios.error ? (
          <ErrorState className="m-auto w-full" message={portfolios.error} onRetry={portfolios.refetch} />
        ) : all.length === 0 ? (
          <EmptyState
            className="m-auto w-full"
            icon={<Images className="size-7" />}
            title="Nenhum portfólio ainda"
            description="Crie um portfólio para reunir seus melhores vídeos e fotos e compartilhar com possíveis clientes."
            action={
              <button
                type="button"
                onClick={openForm}
                className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Novo portfólio
              </button>
            }
          />
        ) : (
          <div className="flex flex-col gap-8">
            {categoriesWithPortfolios
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <div key={g.category.id}>
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.category.name}
                  </h2>
                  <StaggerList className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {g.items.map((p) => (
                      <PortfolioCard key={p.id} portfolio={p} />
                    ))}
                  </StaggerList>
                </div>
              ))}
            {uncategorized.length > 0 && (
              <div>
                {allCategories.length > 0 && (
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Sem categoria
                  </h2>
                )}
                <StaggerList className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {uncategorized.map((p) => (
                    <PortfolioCard key={p.id} portfolio={p} />
                  ))}
                </StaggerList>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PortfolioProfileCard({
  profile,
  onUpdated,
}: {
  profile: PortfolioProfile
  onUpdated: (updater: PortfolioProfile | ((prev: PortfolioProfile | null) => PortfolioProfile)) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const hubPath = `/portfolio/${profile.hubLink}`

  async function handleFile(file: File | undefined | null) {
    if (!file) return
    const invalid = validateImageFile(file)
    if (invalid) {
      setError(invalid)
      return
    }
    setError(null)
    setBusy(true)
    try {
      if (isDemo()) {
        const dataUrl = await readAsDataUrl(file)
        const updated = await portfolioProfileService.updatePhoto(dataUrl)
        onUpdated(updated)
        toast.success('Foto de perfil atualizada')
        return
      }
      const presigned = await portfolioProfileService.getPhotoUploadUrl({
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
      })
      if (!presigned.uploadUrl) throw new UploadError('Servidor não retornou URL de upload.')
      await uploadToPresignedUrl({ url: presigned.uploadUrl, file, headers: presigned.headers })
      const updated = await portfolioProfileService.updatePhoto(presigned.publicUrl)
      onUpdated(updated)
      toast.success('Foto de perfil atualizada')
    } catch (err) {
      setError(
        err instanceof UploadError || err instanceof ApiError
          ? err.message
          : 'Falha ao enviar a foto.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${hubPath}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => !busy && inputRef.current?.click()}
            disabled={busy}
            aria-label="Alterar foto de perfil do portfólio"
            className="group relative size-16 shrink-0 overflow-hidden rounded-full border border-border bg-secondary disabled:opacity-70"
          >
            {profile.photoUrl ? (
              <Image src={profile.photoUrl} alt="" fill className="object-cover" sizes="64px" unoptimized />
            ) : (
              <span className="grid h-full w-full place-items-center text-muted-foreground">
                <User className="size-6" />
              </span>
            )}
            <span className="absolute inset-0 hidden items-center justify-center bg-black/50 text-white group-hover:flex">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </button>
          <div>
            <p className="text-sm font-medium text-foreground">Perfil do portfólio</p>
            <p className="text-xs text-muted-foreground">
              Foto de perfil exibida no topo do hub público, com todos os seus portfólios.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <a
            href={hubPath}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary/70"
          >
            <ExternalLink className="size-3.5" /> Abrir hub
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
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  )
}

function CategoriesManager({
  categories,
  onChange,
}: {
  categories: PortfolioCategory[]
  onChange: (updater: PortfolioCategory[] | ((prev: PortfolioCategory[] | null) => PortfolioCategory[])) => void
}) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  async function addCategory() {
    const trimmed = newName.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      const created = await portfolioProfileService.createCategory({ name: trimmed })
      onChange((prev) => [...(prev ?? []), created])
      setNewName('')
      setAdding(false)
    } catch (err) {
      toast.error('Não foi possível criar a categoria', err instanceof ApiError ? err.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <p className="text-sm font-medium text-foreground">Categorias</p>
      <p className="text-xs text-muted-foreground">
        Abas do hub público — organize seus portfólios do jeito que fizer sentido pro seu negócio
        (ex: Fotos, Vídeo, Casamento, Institucional).
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {categories.map((c) => (
          <CategoryChip key={c.id} category={c} onChange={onChange} />
        ))}
        {adding ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCategory()}
              placeholder="Nome da categoria"
              className="min-h-8 w-40 rounded-lg border border-border bg-secondary px-2.5 text-sm text-foreground outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={addCategory}
              disabled={busy}
              className="inline-flex min-h-8 items-center rounded-lg bg-foreground px-2.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : 'Salvar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false)
                setNewName('')
              }}
              disabled={busy}
              aria-label="Cancelar"
              className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-dashed border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            <Plus className="size-3.5" /> Nova categoria
          </button>
        )}
      </div>
    </div>
  )
}

function CategoryChip({
  category,
  onChange,
}: {
  category: PortfolioCategory
  onChange: (updater: PortfolioCategory[] | ((prev: PortfolioCategory[] | null) => PortfolioCategory[])) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  async function save() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === category.name) {
      setEditing(false)
      setName(category.name)
      return
    }
    setBusy(true)
    try {
      const updated = await portfolioProfileService.updateCategory(category.id, { name: trimmed })
      onChange((prev) => (prev ?? []).map((c) => (c.id === category.id ? updated : c)))
      setEditing(false)
    } catch (err) {
      toast.error('Não foi possível renomear', err instanceof ApiError ? err.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await portfolioProfileService.removeCategory(category.id)
      onChange((prev) => (prev ?? []).filter((c) => c.id !== category.id))
    } catch (err) {
      toast.error('Não foi possível excluir', err instanceof ApiError ? err.message : undefined)
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className="min-h-8 w-40 rounded-lg border border-border bg-secondary px-2.5 text-sm text-foreground outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex min-h-8 items-center rounded-lg bg-foreground px-2.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : 'Salvar'}
        </button>
      </div>
    )
  }

  if (confirmingDelete) {
    return (
      <div className="flex items-center gap-1 rounded-full bg-destructive/10 py-1 pl-3 pr-1 text-xs text-destructive">
        Excluir &quot;{category.name}&quot;?
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="ml-1 inline-flex min-h-6 items-center rounded-full bg-destructive px-2 text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : 'Confirmar'}
        </button>
        <button
          type="button"
          onClick={() => setConfirmingDelete(false)}
          disabled={busy}
          aria-label="Cancelar"
          className="grid size-6 place-items-center rounded-full text-destructive disabled:opacity-50"
        >
          <X className="size-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="group flex items-center gap-0.5 rounded-full bg-secondary py-1 pl-3 pr-1 text-xs font-medium text-foreground">
      {category.name}
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Renomear ${category.name}`}
        className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
      >
        <Pencil className="size-3" />
      </button>
      <button
        type="button"
        onClick={() => setConfirmingDelete(true)}
        aria-label={`Excluir ${category.name}`}
        className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-destructive"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  )
}

function PortfolioCard({ portfolio }: { portfolio: Portfolio }) {
  const [copied, setCopied] = useState(false)

  async function copyLink(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/p/${portfolio.link}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <motion.div
      variants={staggerItem}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50"
    >
      <Link
        href={`/portfolios/${portfolio.id}`}
        aria-label={`Gerenciar portfólio ${portfolio.name}`}
        className="absolute inset-0 z-[1]"
      />
      <div className="relative aspect-video w-full overflow-hidden bg-secondary">
        {portfolio.coverUrl ? (
          <Image
            src={portfolio.coverUrl}
            alt=""
            fill
            className="object-cover transition-transform group-hover:scale-105"
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            unoptimized
          />
        ) : (
          <span className="grid h-full w-full place-items-center text-muted-foreground/60">
            <Film className="size-7" />
          </span>
        )}
      </div>
      <div className="flex items-start justify-between gap-2 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold tracking-tight" title={portfolio.name}>
            {portfolio.name}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {portfolio.videos.length}{' '}
            {portfolio.videos.length === 1 ? 'item' : 'itens'}
          </p>
        </div>
        <button
          type="button"
          onClick={copyLink}
          aria-label="Copiar link público"
          title="Copiar link público"
          className="relative z-[2] inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {copied ? (
            <Check className="size-4" />
          ) : (
            <Link2 className="size-4" />
          )}
        </button>
      </div>
    </motion.div>
  )
}
