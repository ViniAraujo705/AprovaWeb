'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Images, Plus, Loader2, Film, Link2, Check, X } from 'lucide-react'
import { portfolioService } from '@/lib/services'
import type { Portfolio } from '@/lib/types'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { StaggerList, staggerItem, motion } from '@/components/motion'
import { toast } from '@/lib/toast'

/**
 * Lista de portfólios (rota /portfolios, só owner) — vitrines de vídeos
 * curadas manualmente para atrair novos clientes, cada uma com link público
 * próprio (/p/:link). Diferente da galeria de projeto, um portfólio não
 * espelha uma entrega: o owner escolhe explicitamente o que entra, em
 * `/portfolios/[id]`.
 */
export function PortfoliosView() {
  const router = useRouter()
  const portfolios = useQuery<Portfolio[]>((signal) => portfolioService.list(signal), [])

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openForm() {
    setCreating(true)
    setName('')
    setDescription('')
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

  return (
    <div className="flex flex-1 flex-col px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-wide sm:text-5xl">PORTFÓLIOS</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monte vitrines de vídeos em destaque e compartilhe como link público, sem dados de
            cliente.
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
            description="Crie um portfólio para reunir seus melhores vídeos e compartilhar com possíveis clientes."
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
          <StaggerList className="m-auto grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {all.map((p) => (
              <PortfolioCard key={p.id} portfolio={p} />
            ))}
          </StaggerList>
        )}
      </div>
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
            {portfolio.videos.length === 1 ? 'vídeo' : 'vídeos'}
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
