'use client'

import Link from 'next/link'
import Image from 'next/image'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
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
  MoreVertical,
  Pencil,
  Trash2,
  User,
  X,
} from 'lucide-react'
import { portfolioProfileService, portfolioService } from '@/lib/services'
import type { Portfolio, PortfolioCategory, PortfolioLink, PortfolioProfile } from '@/lib/types'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { UploadError, uploadToPresignedUrl, validatePhotoFile } from '@/lib/upload'
import { isDemo } from '@/lib/demo'
import { cn } from '@/lib/utils'
import { StaggerList, staggerItem, motion, AnimatePresence } from '@/components/motion'
import { toast } from '@/lib/toast'

/** Pseudo-id da aba "Sem categoria" (portfólios com `categoryId: null`). */
const UNCATEGORIZED = '__uncategorized__'

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
 * aqui em cima (foto de perfil + categorias). As categorias viram abas: só a
 * ativa é exibida por vez, no padrão de vitrinas visuais (Behance/Vimeo
 * Showcase).
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
  const [categoryLocked, setCategoryLocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [activeTabState, setActiveTabState] = useState<string | null>(null)

  const all = portfolios.data ?? []
  const allCategories = categories.data ?? []
  const uncategorized = all.filter(
    (p) => !p.categoryId || !allCategories.some((c) => c.id === p.categoryId),
  )

  const tabs = [
    ...allCategories.map((c) => ({ id: c.id, name: c.name })),
    ...(uncategorized.length > 0 ? [{ id: UNCATEGORIZED, name: 'Sem categoria' }] : []),
  ]
  const activeTab = tabs.some((t) => t.id === activeTabState) ? (activeTabState as string) : (tabs[0]?.id ?? null)
  const activeItems =
    activeTab === UNCATEGORIZED ? uncategorized : all.filter((p) => p.categoryId === activeTab)
  const activeCategoryName = tabs.find((t) => t.id === activeTab)?.name ?? null

  /** Abre o formulário de criação. `lockedCategoryId` vem de "nova galeria" dentro de uma aba: a categoria fica travada, não é só um default. */
  function openForm(lockedCategoryId?: string | null) {
    setCreating(true)
    setName('')
    setDescription('')
    if (lockedCategoryId !== undefined) {
      setCategoryId(lockedCategoryId === UNCATEGORIZED ? '' : lockedCategoryId ?? '')
      setCategoryLocked(true)
    } else {
      setCategoryId('')
      setCategoryLocked(false)
    }
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
            onClick={() => openForm()}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-4" /> Novo portfólio
          </button>
        )}
      </div>

      {!profile.loading && !profile.error && profile.data && (
        <PortfolioProfileCard profile={profile.data} onUpdated={profile.setData} />
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
          {categoryLocked ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Categoria: <span className="text-foreground">{categoryId ? activeCategoryName : 'Sem categoria'}</span>
            </p>
          ) : (
            allCategories.length > 0 && (
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
            )
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
        {portfolios.loading || categories.loading ? (
          <div className="m-auto grid w-full gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/5] w-full rounded-xl" />
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
                onClick={() => openForm()}
                className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Novo portfólio
              </button>
            }
          />
        ) : (
          <>
            <CategoryTabs
              tabs={tabs}
              active={activeTab}
              onSelect={setActiveTabState}
              onCategoriesChange={categories.setData}
            />
            <StaggerList className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {activeItems.map((p) => (
                <PortfolioCard key={p.id} portfolio={p} />
              ))}
              <NewGalleryCard onClick={() => openForm(activeTab)} />
            </StaggerList>
          </>
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
  const [editOpen, setEditOpen] = useState(false)
  const hubPath = `/portfolio/${profile.hubLink}`

  async function handleFile(file: File | undefined | null) {
    if (!file) return
    const invalid = validatePhotoFile(file)
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
    <div className="mt-6 rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => !busy && inputRef.current?.click()}
          disabled={busy}
          aria-label="Alterar foto de perfil do portfólio"
          className="group relative size-9 shrink-0 overflow-hidden rounded-full border border-border bg-secondary disabled:opacity-70"
        >
          {profile.photoUrl ? (
            <Image src={profile.photoUrl} alt="" fill className="object-cover" sizes="36px" unoptimized />
          ) : (
            <span className="grid h-full w-full place-items-center text-muted-foreground">
              <User className="size-4" />
            </span>
          )}
          <span className="absolute inset-0 hidden items-center justify-center bg-black/50 text-white group-hover:flex">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-foreground">Perfil do portfólio</p>
          <p className="truncate text-[11px] text-muted-foreground">
            Foto exibida no topo do hub público.
          </p>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Pencil className="size-3.5" /> Editar perfil
          </button>
          <a
            href={hubPath}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ExternalLink className="size-3.5" /> Abrir hub
          </a>
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? 'Copiado' : 'Copiar link'}
          </button>
        </div>
      </div>
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
      {(profile.bio || profile.links.length > 0) && (
        <div className="mt-2.5 border-t border-border pt-2.5">
          {profile.bio && <p className="line-clamp-2 text-xs text-muted-foreground">{profile.bio}</p>}
          {profile.links.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {profile.links.map((l) => (
                <a
                  key={l.id}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Link2 className="size-3" /> {l.label}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
      <AnimatePresence>
        {editOpen && (
          <PortfolioProfileEditModal
            profile={profile}
            onUpdated={onUpdated}
            onClose={() => setEditOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function PortfolioProfileEditModal({
  profile,
  onUpdated,
  onClose,
}: {
  profile: PortfolioProfile
  onUpdated: (updater: PortfolioProfile | ((prev: PortfolioProfile | null) => PortfolioProfile)) => void
  onClose: () => void
}) {
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [coverBusy, setCoverBusy] = useState(false)
  const [coverError, setCoverError] = useState<string | null>(null)
  const [bio, setBio] = useState(profile.bio ?? '')
  const [links, setLinks] = useState<PortfolioLink[]>(profile.links)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCoverFile(file: File | undefined | null) {
    if (!file) return
    const invalid = validatePhotoFile(file)
    if (invalid) {
      setCoverError(invalid)
      return
    }
    setCoverError(null)
    setCoverBusy(true)
    try {
      if (isDemo()) {
        const dataUrl = await readAsDataUrl(file)
        const updated = await portfolioProfileService.updateCover(dataUrl)
        onUpdated(updated)
        toast.success('Capa atualizada')
        return
      }
      const presigned = await portfolioProfileService.getCoverUploadUrl({
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
      })
      if (!presigned.uploadUrl) throw new UploadError('Servidor não retornou URL de upload.')
      await uploadToPresignedUrl({ url: presigned.uploadUrl, file, headers: presigned.headers })
      const updated = await portfolioProfileService.updateCover(presigned.publicUrl)
      onUpdated(updated)
      toast.success('Capa atualizada')
    } catch (err) {
      setCoverError(
        err instanceof UploadError || err instanceof ApiError ? err.message : 'Falha ao enviar a capa.',
      )
    } finally {
      setCoverBusy(false)
    }
  }

  function addLinkRow() {
    setLinks((prev) => [...prev, { id: `new-${prev.length}-${Date.now()}`, label: '', url: '' }])
  }

  function updateLinkRow(id: string, patch: Partial<PortfolioLink>) {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function removeLinkRow(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id))
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const cleanedLinks = links
        .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
        .filter((l) => l.label && l.url)
      const updated = await portfolioProfileService.update({ bio: bio.trim() || null, links: cleanedLinks })
      onUpdated(updated)
      toast.success('Perfil atualizado')
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose}>
      <motion.div
        className="absolute inset-0 bg-black/70"
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
      <motion.div
        className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto rounded-xl border border-border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Editar perfil do portfólio</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Capa do hub</span>
          <button
            type="button"
            onClick={() => !coverBusy && coverInputRef.current?.click()}
            disabled={coverBusy}
            className="group relative aspect-[3/1] w-full overflow-hidden rounded-lg border border-border bg-secondary disabled:opacity-70"
          >
            {profile.coverUrl ? (
              <Image src={profile.coverUrl} alt="" fill className="object-cover" sizes="400px" unoptimized />
            ) : (
              <span className="grid h-full w-full place-items-center text-muted-foreground">
                <ImagePlus className="size-5" />
              </span>
            )}
            <span className="absolute inset-0 hidden items-center justify-center bg-black/50 text-white group-hover:flex">
              {coverBusy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            </span>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => handleCoverFile(e.target.files?.[0])}
            />
          </button>
          {coverError && <span className="text-xs text-destructive">{coverError}</span>}
        </label>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            Bio <span className="font-normal text-muted-foreground">(opcional)</span>
          </span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="Uma apresentação curta exibida no topo do hub público."
            className="resize-none rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </label>

        <div className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            Links e contato <span className="font-normal text-muted-foreground">(opcional)</span>
          </span>
          <div className="flex flex-col gap-2">
            {links.map((l) => (
              <div key={l.id} className="flex items-center gap-1.5">
                <input
                  value={l.label}
                  onChange={(e) => updateLinkRow(l.id, { label: e.target.value })}
                  placeholder="Site, Instagram, WhatsApp..."
                  className="min-h-9 w-28 shrink-0 rounded-lg border border-border bg-secondary px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                />
                <input
                  value={l.url}
                  onChange={(e) => updateLinkRow(l.id, { url: e.target.value })}
                  placeholder="https://..."
                  className="min-h-9 min-w-0 flex-1 rounded-lg border border-border bg-secondary px-2.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => removeLinkRow(l.id)}
                  aria-label="Remover link"
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addLinkRow}
            className="mt-1 inline-flex min-h-8 w-fit items-center gap-1.5 rounded-lg bg-secondary px-2.5 text-xs font-medium text-foreground hover:bg-secondary/70"
          >
            <Plus className="size-3.5" /> Adicionar link
          </button>
        </div>

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-secondary text-sm font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            Salvar
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function CategoryTabs({
  tabs,
  active,
  onSelect,
  onCategoriesChange,
}: {
  tabs: { id: string; name: string }[]
  active: string | null
  onSelect: (id: string) => void
  onCategoriesChange: (
    updater: PortfolioCategory[] | ((prev: PortfolioCategory[] | null) => PortfolioCategory[]),
  ) => void
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
      onCategoriesChange((prev) => [...(prev ?? []), created])
      onSelect(created.id)
      setNewName('')
      setAdding(false)
    } catch (err) {
      toast.error('Não foi possível criar a categoria', err instanceof ApiError ? err.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border">
      {tabs.map((t) => (
        <div key={t.id} className="group/tab relative flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => onSelect(t.id)}
            className={cn(
              'whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm transition-colors',
              t.id === active
                ? 'border-foreground font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.name}
          </button>
          {t.id === active && t.id !== UNCATEGORIZED && (
            <CategoryTabMenu categoryId={t.id} categoryName={t.name} onChange={onCategoriesChange} />
          )}
        </div>
      ))}

      {adding ? (
        <div className="flex shrink-0 items-center gap-1 pl-1">
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
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="ml-1 inline-flex shrink-0 items-center gap-1 whitespace-nowrap px-2.5 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="size-3.5" /> Nova categoria
        </button>
      )}
    </div>
  )
}

/**
 * Menu "..." de ações da aba ativa (renomear/excluir). A aba fica dentro de
 * uma faixa com `overflow-x-auto` (rolagem horizontal em telas pequenas), o
 * que clipa qualquer overflow vertical de um filho `absolute` — mesmo
 * problema já resolvido em `notification-bell.tsx`: o painel é portado pro
 * `<body>` e posicionado via `getBoundingClientRect` do gatilho.
 */
function CategoryTabMenu({
  categoryId,
  categoryName,
  onChange,
}: {
  categoryId: string
  categoryName: string
  onChange: (
    updater: PortfolioCategory[] | ((prev: PortfolioCategory[] | null) => PortfolioCategory[]),
  ) => void
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({})
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(categoryName)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
      setRenaming(false)
      setConfirmingDelete(false)
      setName(categoryName)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open, categoryName])

  useEffect(() => {
    if (!open) return
    function updatePosition() {
      const el = triggerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setPanelStyle({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  async function save() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === categoryName) {
      setRenaming(false)
      setOpen(false)
      setName(categoryName)
      return
    }
    setBusy(true)
    try {
      const updated = await portfolioProfileService.updateCategory(categoryId, { name: trimmed })
      onChange((prev) => (prev ?? []).map((c) => (c.id === categoryId ? updated : c)))
      setRenaming(false)
      setOpen(false)
    } catch (err) {
      toast.error('Não foi possível renomear', err instanceof ApiError ? err.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await portfolioProfileService.removeCategory(categoryId)
      onChange((prev) => (prev ?? []).filter((c) => c.id !== categoryId))
      setOpen(false)
    } catch (err) {
      toast.error('Não foi possível excluir', err instanceof ApiError ? err.message : undefined)
      setBusy(false)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Ações da categoria ${categoryName}`}
        className="grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <MoreVertical className="size-3.5" />
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={panelRef}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                style={panelStyle}
                className="fixed z-50 w-52 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-2xl"
              >
                {confirmingDelete ? (
                  <div className="p-1.5">
                    <p className="px-1 pb-2 text-xs text-muted-foreground">
                      Excluir &quot;{categoryName}&quot;? Os álbuns dela ficam sem categoria.
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={remove}
                        disabled={busy}
                        className="inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-destructive px-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : 'Confirmar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(false)}
                        disabled={busy}
                        className="inline-flex min-h-8 flex-1 items-center justify-center rounded-lg bg-secondary text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : renaming ? (
                  <div className="flex items-center gap-1 p-1">
                    <input
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && save()}
                      className="min-h-8 w-full min-w-0 rounded-lg border border-border bg-secondary px-2.5 text-sm text-foreground outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={save}
                      disabled={busy}
                      className="inline-flex min-h-8 shrink-0 items-center rounded-lg bg-foreground px-2.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : 'Salvar'}
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setRenaming(true)}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
                    >
                      <Pencil className="size-3.5 text-muted-foreground" />
                      Renomear
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(true)}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3.5" />
                      Excluir
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  )
}

function PortfolioCard({ portfolio }: { portfolio: Portfolio }) {
  const [copied, setCopied] = useState(false)
  const router = useRouter()

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

  function edit(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    router.push(`/portfolios/${portfolio.id}`)
  }

  return (
    <motion.div variants={staggerItem} className="group relative flex flex-col">
      <Link
        href={`/portfolios/${portfolio.id}`}
        aria-label={`Gerenciar portfólio ${portfolio.name}`}
        className="absolute inset-0 z-[1]"
      />
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-secondary">
        {portfolio.coverUrl ? (
          <Image
            src={portfolio.coverUrl}
            alt=""
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            unoptimized
          />
        ) : (
          <span className="grid h-full w-full place-items-center text-muted-foreground/60">
            <Film className="size-7" />
          </span>
        )}
        <div className="absolute right-2 top-2 z-[2] flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={edit}
            aria-label="Editar portfólio"
            title="Editar portfólio"
            className="grid size-7 place-items-center rounded-md bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={copyLink}
            aria-label="Copiar link público"
            title="Copiar link público"
            className="grid size-7 place-items-center rounded-md bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
          >
            {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
          </button>
        </div>
      </div>
      <div className="pt-2.5">
        <h3 className="truncate text-[13px] font-medium text-foreground" title={portfolio.name}>
          {portfolio.name}
        </h3>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {portfolio.videos.length} {portfolio.videos.length === 1 ? 'item' : 'itens'}
        </p>
      </div>
    </motion.div>
  )
}

function NewGalleryCard({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      variants={staggerItem}
      onClick={onClick}
      className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
    >
      <Plus className="size-5" />
      <span className="text-xs font-medium">Nova galeria</span>
    </motion.button>
  )
}
