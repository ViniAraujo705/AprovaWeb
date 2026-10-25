'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ChevronRight, Contact, Plus, Loader2, Search, Sparkles, X } from 'lucide-react'
import { clientService } from '@/lib/services'
import type { Client } from '@/lib/types'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { StaggerList, staggerItem, motion } from '@/components/motion'
import { toast } from '@/lib/toast'
import { usePlanLimit } from '@/components/plan-limit-provider'
import { ClientAvatar } from '@/components/client-avatar'
import { PageHeader } from '@/components/page-header'

/**
 * Lista de clientes (rota /clientes) — cada card leva ao detalhe do cliente
 * (`/clientes/[id]`), onde o owner configura nome, a legenda do modo Reels e
 * a foto de perfil. Criar um cliente aqui não exige nenhum vídeo/projeto
 * (diferente do fluxo de "Enviar vídeo", que hoje é o único outro lugar que cria cliente).
 */
export function ClientsView() {
  const router = useRouter()
  const clients = useQuery<Client[]>((signal) => clientService.list(signal), [])
  const { handlePlanLimitError, bumpUsage } = usePlanLimit()

  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openForm() {
    setCreating(true)
    setName('')
    setError(null)
  }

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Informe o nome do cliente.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await clientService.create({ name: trimmed })
      clients.setData((prev) => [...(prev ?? []), created])
      bumpUsage({ clients: 1 })
      setCreating(false)
      toast.success('Cliente criado')
      router.push(`/clientes/${created.id}`)
    } catch (err) {
      if (handlePlanLimitError(err)) return
      setError(err instanceof ApiError ? err.message : 'Falha ao criar cliente.')
    } finally {
      setBusy(false)
    }
  }

  const allClients = clients.data ?? []
  const query = search.trim().toLocaleLowerCase('pt-BR')
  const visibleClients = query
    ? allClients.filter((c) => c.name.toLocaleLowerCase('pt-BR').includes(query))
    : allClients

  return (
    <div className="flex flex-1 flex-col px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <PageHeader
        eyebrow="Carteira da agência"
        title="Clientes"
        description="Configure nome, foto de perfil e a legenda que aparece no modo Reels de cada cliente."
        actions={
          <>
            {allClients.length > 0 && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar cliente…"
                  className="min-h-11 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary-ink sm:w-64"
                />
              </div>
            )}
            {!creating && (
              <button
                type="button"
                onClick={openForm}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-display text-base text-primary-foreground hover:opacity-90"
              >
                <Plus className="size-4" /> Novo cliente
              </button>
            )}
          </>
        }
      />

      {creating && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Novo cliente</span>
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
            placeholder="Nome do cliente"
            className="mt-3 min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary-ink"
          />
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Criar cliente
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-1 flex-col">
        {clients.loading ? (
          <div className="m-auto grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        ) : clients.error ? (
          <ErrorState className="m-auto w-full" message={clients.error} onRetry={clients.refetch} />
        ) : allClients.length === 0 ? (
          <EmptyState
            className="m-auto w-full"
            icon={<Contact className="size-7" />}
            title="Nenhum cliente ainda"
            description="Crie um cliente para depois organizar os projetos e vídeos dele."
            action={
              <button
                type="button"
                onClick={openForm}
                className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Novo cliente
              </button>
            }
          />
        ) : (
          <StaggerList className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleClients.map((c) => (
              <ClientCard key={c.id} client={c} />
            ))}
          </StaggerList>
        )}
      </div>
    </div>
  )
}

function ClientCard({ client }: { client: Client }) {
  return (
    <motion.div
      variants={staggerItem}
      className="group relative flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary-ink/50"
    >
      <Link
        href={`/clientes/${client.id}`}
        aria-label={`Configurar cliente ${client.name}`}
        className="absolute inset-0 z-[1] rounded-2xl"
      />
      {client.photoUrl ? (
        <div className="relative size-12 shrink-0 overflow-hidden rounded-full bg-secondary">
          <Image src={client.photoUrl} alt="" fill className="object-cover" sizes="48px" unoptimized />
        </div>
      ) : (
        <ClientAvatar name={client.name || '?'} seed={client.id} size="xl" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-display text-lg font-bold" title={client.name}>
            {client.name}
          </h3>
          {client.isExample && (
            <span
              title="Cliente de exemplo — explore e delete quando quiser."
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary-ink"
            >
              <Sparkles className="size-3" /> Exemplo
            </span>
          )}
        </div>
        {client.email && <p className="truncate text-sm text-muted-foreground">{client.email}</p>}
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </motion.div>
  )
}
