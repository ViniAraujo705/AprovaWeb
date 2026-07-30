'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Contact, Plus, Loader2, Sparkles, X } from 'lucide-react'
import { clientService } from '@/lib/services'
import type { Client } from '@/lib/types'
import { ErrorState, EmptyState, Skeleton } from '@/components/states'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { StaggerList, staggerItem, motion } from '@/components/motion'
import { toast } from '@/lib/toast'

/**
 * Lista de clientes (rota /clientes) — cada card leva ao detalhe do cliente
 * (`/clientes/[id]`), onde o owner configura nome, a legenda do modo Reels e
 * a foto de perfil. Criar um cliente aqui não exige nenhum vídeo/projeto
 * (diferente do fluxo de "Enviar vídeo", que hoje é o único outro lugar que cria cliente).
 */
export function ClientsView() {
  const router = useRouter()
  const clients = useQuery<Client[]>((signal) => clientService.list(signal), [])

  const [creating, setCreating] = useState(false)
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
      setCreating(false)
      toast.success('Cliente criado')
      router.push(`/clientes/${created.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao criar cliente.')
    } finally {
      setBusy(false)
    }
  }

  const allClients = clients.data ?? []

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-wide sm:text-5xl">CLIENTES</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure nome, foto de perfil e a legenda que aparece no modo Reels de cada cliente.
          </p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={openForm}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-4" /> Novo cliente
          </button>
        )}
      </div>

      {creating && (
        <div className="mt-4 rounded-xl border border-border bg-card p-4">
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
            Criar cliente
          </button>
        </div>
      )}

      <div className="mt-6">
        {clients.loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        ) : clients.error ? (
          <ErrorState message={clients.error} onRetry={clients.refetch} />
        ) : allClients.length === 0 ? (
          <EmptyState
            icon={<Contact className="size-7" />}
            title="Nenhum cliente ainda"
            description="Crie um cliente para depois organizar os projetos e vídeos dele."
            action={
              <button
                type="button"
                onClick={openForm}
                className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Novo cliente
              </button>
            }
          />
        ) : (
          <StaggerList className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {allClients.map((c) => (
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
      className="group relative flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
    >
      <Link
        href={`/clientes/${client.id}`}
        aria-label={`Configurar cliente ${client.name}`}
        className="absolute inset-0 z-[1] rounded-xl"
      />
      <div className="relative size-12 shrink-0 overflow-hidden rounded-full bg-secondary">
        {client.photoUrl ? (
          <Image src={client.photoUrl} alt="" fill className="object-cover" sizes="48px" unoptimized />
        ) : (
          <span className="grid h-full w-full place-items-center text-sm font-bold uppercase text-muted-foreground">
            {(client.name || '?').slice(0, 1)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-display text-xl tracking-wide">{client.name}</h3>
          {client.isExample && (
            <span
              title="Cliente de exemplo — explore e delete quando quiser."
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary"
            >
              <Sparkles className="size-3" /> Exemplo
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}
