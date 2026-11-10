'use client'

/**
 * Google Drive no projeto: vincular pastas/arquivos do Drive conectado (só a
 * referência — nada é copiado, movido nem tem permissão alterada no Drive).
 *
 * - `DrivePickerModal`: navega pelo Drive de quem está logado (raiz, pastas,
 *   busca por nome) e devolve o item escolhido via `onPick`.
 * - `ProjectDriveSection`: bloco da tela do projeto com a lista do que está
 *   vinculado, o botão de vincular e o desvincular.
 *
 * O backend vincula com a conexão PESSOAL de quem chama, então o seletor só
 * abre para quem conectou o próprio Drive em Integrações.
 */
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Info,
  Link2,
  ExternalLink,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  Loader2,
  Plus,
  Search,
  Unlink,
  X,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GoogleDriveItem, ProjectDriveItem } from '@/lib/types'
import { googleDriveService } from '@/lib/services'
import { useQuery } from '@/lib/use-query'
import { ApiError } from '@/lib/api'
import { toast } from '@/lib/toast'
import { DriveImportError, importDriveVideo } from '@/lib/drive-import'

const INTEGRATIONS_PATH = '/configuracoes/integracoes'

/** Vídeos que o backend aceita importar do Drive (mesmos do upload direto). */
export const DRIVE_IMPORTABLE_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/mpeg']

export function isDriveImportable(item: GoogleDriveItem) {
  return !item.isFolder && DRIVE_IMPORTABLE_TYPES.includes(item.mimeType)
}

function formatSize(bytes: number | null) {
  if (!bytes) return null
  const mb = bytes / (1024 * 1024)
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(mb < 10 ? 1 : 0)} MB`
}

/** Link para abrir o item no Drive — o backend nem sempre devolve `webViewLink`. */
export function driveOpenUrl(item: { googleFileId?: string; id: string; isFolder: boolean; webViewLink: string | null }) {
  if (item.webViewLink) return item.webViewLink
  const fileId = item.googleFileId ?? item.id
  return item.isFolder
    ? `https://drive.google.com/drive/folders/${encodeURIComponent(fileId)}`
    : `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`
}

/** Ícone neutro por tipo (pasta, vídeo, imagem, documento) — sem caixinha colorida. */
function DriveIcon({ item, className }: { item: { isFolder: boolean; mimeType: string }; className?: string }) {
  if (item.isFolder)
    return <Folder className={cn('size-[18px] shrink-0 fill-muted-foreground/25 text-muted-foreground', className)} />
  const Icon = item.mimeType.startsWith('video/')
    ? FileVideo
    : item.mimeType.startsWith('image/')
      ? FileImage
      : FileText
  return <Icon className={cn('size-[18px] shrink-0 text-muted-foreground', className)} />
}

function kindLabel(item: GoogleDriveItem) {
  if (item.isFolder) return 'Pasta'
  if (item.mimeType.startsWith('video/')) return 'Vídeo'
  if (item.mimeType.startsWith('image/')) return 'Imagem'
  if (item.mimeType === 'application/pdf') return 'PDF'
  if (item.mimeType.startsWith('application/vnd.google-apps.')) return 'Google Docs'
  return 'Arquivo'
}

/* ------------------------------------------------------------------------- */

/**
 * Seletor do Drive em formato de navegador de arquivos: clicar numa pasta
 * entra nela; a caixinha à esquerda marca o item. A ação (vincular/adicionar)
 * é uma só, no rodapé, para tudo o que foi marcado.
 */
export function DrivePickerModal({
  linkedIds,
  onPick,
  onClose,
  title = 'Vincular do Google Drive',
  mode = 'link',
  initialTrail = [],
}: {
  /** Abre já dentro desta pasta (ex.: "Importar vídeos" de uma pasta vinculada). */
  initialTrail?: { id: string; name: string }[]
  /**
   * `link`: vincula pastas/arquivos (referência). `import`: escolhe VÍDEOS
   * para importar para aprovação — pastas só navegam.
   */
  mode?: 'link' | 'import'
  /** ids do Google já vinculados/adicionados (aparecem marcados e travados). */
  linkedIds: Set<string>
  /** Chamado para cada item marcado; rejeitar mantém o modal aberto com o erro. */
  onPick: (item: GoogleDriveItem) => Promise<void> | void
  onClose: () => void
  title?: string
}) {
  const importing = mode === 'import'
  // Pilha de pastas abertas (vazia = raiz do Drive).
  const [trail, setTrail] = useState<{ id: string; name: string }[]>(initialTrail)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  // Marcados, por id — guarda o item inteiro pra sobreviver à troca de pasta.
  const [selected, setSelected] = useState<Map<string, GoogleDriveItem>>(new Map())
  const [submitting, setSubmitting] = useState(false)
  const [pickError, setPickError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  const current = trail[trail.length - 1] ?? null
  const items = useQuery<GoogleDriveItem[]>(
    (signal) =>
      googleDriveService.listItems(
        debounced ? { q: debounced } : current ? { parentId: current.id } : undefined,
        signal,
      ),
    [debounced, current?.id],
  )

  const canSelect = (item: GoogleDriveItem) => (importing ? isDriveImportable(item) : true)

  function toggle(item: GoogleDriveItem) {
    if (!canSelect(item) || linkedIds.has(item.id)) return
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(item.id)) next.delete(item.id)
      else next.set(item.id, item)
      return next
    })
  }

  function openFolder(item: GoogleDriveItem) {
    setSearch('')
    setDebounced('')
    setTrail((prev) => [...prev, { id: item.id, name: item.name }])
  }

  async function confirm() {
    if (selected.size === 0 || submitting) return
    setSubmitting(true)
    setPickError(null)
    const pending = [...selected.values()]
    try {
      for (const item of pending) {
        await onPick(item)
        setSelected((prev) => {
          const next = new Map(prev)
          next.delete(item.id)
          return next
        })
      }
      onClose()
    } catch (err) {
      setPickError(err instanceof ApiError ? err.message : 'Não foi possível concluir. Tente de novo.')
    } finally {
      setSubmitting(false)
    }
  }

  const list = items.data ?? []
  const count = selected.size
  const actionVerb = importing ? 'Adicionar' : 'Vincular'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={() => !submitting && onClose()}
    >
      <div
        className="flex h-[min(640px,92svh)] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho: título + busca na mesma faixa */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Image src="/icons/google-drive.svg" alt="" width={18} height={18} className="shrink-0" />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{title}</p>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Fechar"
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          {debounced ? (
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              Resultados para “<span className="text-foreground">{debounced}</span>”
            </p>
          ) : (
            <nav aria-label="Caminho" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden text-xs">
              {trail.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTrail((prev) => prev.slice(0, -1))}
                  aria-label="Voltar uma pasta"
                  className="mr-1 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <ArrowLeft className="size-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setTrail([])}
                className={cn(
                  'shrink-0 rounded px-1 py-0.5 hover:underline',
                  trail.length === 0 ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                Meu Drive
              </button>
              {trail.map((f, i) => (
                <span key={f.id} className="flex min-w-0 items-center gap-0.5">
                  <span className="text-muted-foreground/60">/</span>
                  <button
                    type="button"
                    onClick={() => setTrail((prev) => prev.slice(0, i + 1))}
                    className={cn(
                      'min-w-0 truncate rounded px-1 py-0.5 hover:underline',
                      i === trail.length - 1 ? 'font-medium text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {f.name}
                  </button>
                </span>
              ))}
            </nav>
          )}
          <label className="relative w-40 shrink-0 sm:w-52">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar"
              aria-label="Buscar no Drive pelo nome"
              className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary-ink"
            />
          </label>
        </div>

        {/* Lista */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {items.loading ? (
            <ul aria-hidden className="divide-y divide-border">
              {Array.from({ length: 7 }).map((_, i) => (
                <li key={i} className="flex h-11 items-center gap-3 px-4">
                  <span className="size-4 rounded bg-secondary" />
                  <span className="h-3 rounded bg-secondary" style={{ width: `${30 + ((i * 17) % 45)}%` }} />
                </li>
              ))}
            </ul>
          ) : items.error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <p className="text-sm text-foreground">{items.error}</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Se continuar, use “Reconectar” no card do Google Drive em{' '}
                <Link href={INTEGRATIONS_PATH} className="text-primary-ink underline">
                  Integrações
                </Link>
                .
              </p>
              <button
                type="button"
                onClick={() => items.refetch()}
                className="mt-1 text-xs font-medium text-foreground underline"
              >
                Tentar de novo
              </button>
            </div>
          ) : list.length === 0 ? (
            <p className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
              {debounced ? 'Nada com esse nome.' : 'Pasta vazia.'}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((item) => {
                const already = linkedIds.has(item.id)
                const selectable = canSelect(item) && !already
                const checked = already || selected.has(item.id)
                const size = formatSize(item.sizeBytes)
                const dimmed = importing && !item.isFolder && !canSelect(item)
                return (
                  <li
                    key={item.id}
                    className={cn(
                      'group flex h-11 items-center gap-3 px-4 text-sm',
                      selected.has(item.id) ? 'bg-primary/10' : 'hover:bg-secondary/60',
                      dimmed && 'opacity-45',
                    )}
                  >
                    {/* Caixinha: some quando o item não pode ser escolhido */}
                    <span className="grid size-4 shrink-0 place-items-center">
                      {(selectable || already) && (
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={already || submitting}
                          onChange={() => toggle(item)}
                          aria-label={`${checked ? 'Desmarcar' : 'Marcar'} ${item.name}`}
                          className="size-4 cursor-pointer accent-primary-ink disabled:cursor-default"
                        />
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => (item.isFolder ? openFolder(item) : toggle(item))}
                      disabled={!item.isFolder && !selectable}
                      title={item.isFolder ? 'Abrir pasta' : item.name}
                      className="flex h-full min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                    >
                      <DriveIcon item={item} />
                      <span className="min-w-0 flex-1 truncate text-foreground">{item.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {already
                          ? importing
                            ? 'Adicionado'
                            : 'Vinculado'
                          : dimmed
                            ? 'Não é vídeo'
                            : (size ?? kindLabel(item))}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Rodapé: uma ação só, para o que foi marcado */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            {pickError ? (
              <span className="text-destructive">{pickError}</span>
            ) : count > 0 ? (
              <span className="text-foreground">
                {count} {count === 1 ? 'item marcado' : 'itens marcados'}
              </span>
            ) : importing ? (
              'Marque os vídeos. Eles são copiados do Drive direto para o Check.'
            ) : (
              'Marque pastas ou arquivos. Só o atalho fica no Check.'
            )}
          </p>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-9 rounded-md px-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={count === 0 || submitting}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40"
          >
            {submitting && <Loader2 className="size-3.5 animate-spin" />}
            {count > 1 ? `${actionVerb} ${count}` : actionVerb}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------- */

/** Aviso "vincular ≠ importar" mostrado uma vez, depois do primeiro vínculo. */
const DRIVE_TIP_KEY = 'check:dica-drive-vinculo'

function readTipSeen() {
  try {
    return window.localStorage.getItem(DRIVE_TIP_KEY) === '1'
  } catch {
    return true
  }
}

interface RunningImport {
  key: string
  name: string
  progress: number
  status: 'importando' | 'erro'
  error?: string
}

export function ProjectDriveSection({
  projectId,
  isOwner,
  onVideosImported,
}: {
  projectId: string
  isOwner: boolean
  /** Chamado quando um vídeo importado do Drive entra no projeto (recarregar a lista). */
  onVideosImported?: () => void
}) {
  const status = useQuery((signal) => googleDriveService.getStatus(signal), [])
  const linked = useQuery<ProjectDriveItem[]>(
    (signal) => googleDriveService.listProjectItems(projectId, signal),
    [projectId],
  )
  const [picking, setPicking] = useState(false)
  // Pasta de onde importar (abre o seletor já dentro dela, modo importar).
  const [importFrom, setImportFrom] = useState<ProjectDriveItem | null>(null)
  const [imports, setImports] = useState<RunningImport[]>([])
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null)
  const [showTip, setShowTip] = useState(false)
  const pendingImport = useRef<GoogleDriveItem[]>([])

  const items = linked.data ?? []
  const linkedIds = new Set(items.map((i) => i.googleFileId))
  const connected = status.data?.connected ?? false

  async function link(item: GoogleDriveItem) {
    const created = await googleDriveService.linkToProject(projectId, item)
    linked.setData((prev) => [created, ...(prev ?? []).filter((p) => p.googleFileId !== created.googleFileId)])
    toast.success(item.isFolder ? 'Pasta vinculada ao projeto' : 'Arquivo vinculado ao projeto')
    if (item.isFolder && !readTipSeen()) setShowTip(true)
  }

  function dismissTip() {
    setShowTip(false)
    try {
      window.localStorage.setItem(DRIVE_TIP_KEY, '1')
    } catch {
      // sem storage: só volta a aparecer numa próxima vez
    }
  }

  function updateImport(key: string, patch: Partial<RunningImport>) {
    setImports((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)))
  }

  /** Importa os vídeos marcados um de cada vez, sem travar a tela. */
  async function runImports(files: GoogleDriveItem[]) {
    const queued = files.map((f) => ({
      key: `${f.id}-${Date.now()}`,
      file: f,
    }))
    setImports((prev) => [
      ...prev.filter((i) => i.status !== 'erro'),
      ...queued.map((q) => ({ key: q.key, name: q.file.name, progress: 0, status: 'importando' as const })),
    ])
    let done = 0
    for (const { key, file } of queued) {
      try {
        await importDriveVideo({ projectId, googleFileId: file.id }, (progress) => updateImport(key, { progress }))
        done++
        setImports((prev) => prev.filter((i) => i.key !== key))
        onVideosImported?.()
      } catch (err) {
        const message = err instanceof ApiError || err instanceof DriveImportError ? err.message : 'Falha ao importar.'
        updateImport(key, { status: 'erro', error: message })
        // Limite do plano: os próximos falhariam igual.
        if (err instanceof ApiError && err.status === 403) break
      }
    }
    if (done > 0) toast.success(done === 1 ? 'Vídeo importado do Drive' : `${done} vídeos importados do Drive`)
  }

  async function unlink(item: ProjectDriveItem) {
    setUnlinkingId(item.id)
    try {
      await googleDriveService.unlinkFromProject(projectId, item.id)
      linked.setData((prev) => (prev ?? []).filter((p) => p.id !== item.id))
      toast.success('Vínculo removido', 'Nada foi apagado no Drive.')
    } catch (err) {
      toast.error('Não foi possível desvincular', err instanceof ApiError ? err.message : undefined)
    } finally {
      setUnlinkingId(null)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card px-4 pt-3 pb-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Image src="/icons/google-drive.svg" alt="" width={18} height={18} />
          <h2 className="text-sm font-semibold text-foreground">Google Drive</h2>
          {items.length > 0 && <span className="text-xs text-muted-foreground">({items.length})</span>}
        </div>
        {connected && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-foreground hover:bg-secondary"
          >
            <Plus className="size-3.5" /> Vincular pasta
          </button>
        )}
      </div>

      {linked.loading || status.loading ? (
        <div className="mb-3 mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          {linked.error && (
            <p className="mb-3 mt-2 text-xs text-destructive">
              Não foi possível carregar os itens vinculados.{' '}
              <button type="button" onClick={() => linked.refetch()} className="underline">
                Tentar de novo
              </button>
            </p>
          )}

          {/* Explicação curta: vincular é atalho, importar traz o vídeo. */}
          {items.length === 0 && !linked.error && connected && (
            <dl className="mb-3 mt-2 grid gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-lg bg-secondary/50 px-3 py-2">
                <dt className="flex items-center gap-1.5 font-medium text-foreground">
                  <Link2 className="size-3.5" /> Vincular pasta
                </dt>
                <dd className="mt-0.5 text-muted-foreground">
                  Atalho para a pasta do Drive, pra equipe achar brutos e briefing daqui. Nada é copiado.
                </dd>
              </div>
              <div className="rounded-lg bg-secondary/50 px-3 py-2">
                <dt className="flex items-center gap-1.5 font-medium text-foreground">
                  <Download className="size-3.5" /> Importar vídeos
                </dt>
                <dd className="mt-0.5 text-muted-foreground">
                  Traz o vídeo do Drive pro projeto, pro cliente aprovar. Depois de vincular a pasta, use o
                  botão “Importar vídeos” nela.
                </dd>
              </div>
            </dl>
          )}

          {showTip && (
            <div className="mb-2 mt-2 flex items-start gap-2 rounded-lg border border-primary-ink/30 bg-primary/10 px-3 py-2 text-xs">
              <Info className="mt-0.5 size-3.5 shrink-0 text-primary-ink" />
              <p className="min-w-0 flex-1 text-foreground">
                Pasta vinculada como <strong>atalho</strong> — os vídeos dela ainda não estão no projeto. Para
                trazê-los pra aprovação, use <strong>Importar vídeos</strong> na linha da pasta.
              </p>
              <button
                type="button"
                onClick={dismissTip}
                className="shrink-0 font-medium text-foreground underline-offset-2 hover:underline"
              >
                Entendi
              </button>
            </div>
          )}

          {items.length > 0 && (
            <ul className="-mx-4 mt-3 divide-y divide-border border-t border-border">
              {items.map((item) => (
                <li key={item.id} className="group flex min-h-11 items-center gap-3 px-4 py-1.5 text-sm hover:bg-secondary/50">
                  <DriveIcon item={item} />
                  <a
                    href={driveOpenUrl(item)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir no Google Drive"
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-foreground hover:underline"
                  >
                    <span className="truncate">{item.name}</span>
                    <ExternalLink className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </a>
                  {(item.linkedByName || item.linkedAt) && (
                    <span className="hidden shrink-0 text-xs text-muted-foreground md:block">
                      {item.linkedByName ?? ''}
                      {item.linkedByName && item.linkedAt ? ' · ' : ''}
                      {item.linkedAt ? new Date(item.linkedAt).toLocaleDateString('pt-BR') : ''}
                    </span>
                  )}
                  {item.isFolder && connected && (
                    <button
                      type="button"
                      onClick={() => {
                        dismissTip()
                        setImportFrom(item)
                      }}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:border-primary-ink/50"
                    >
                      <Download className="size-3.5" /> Importar vídeos
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => unlink(item)}
                    disabled={unlinkingId === item.id}
                    aria-label={`Desvincular ${item.name}`}
                    title="Desvincular (não apaga no Drive)"
                    className="-mr-1.5 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-destructive disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                  >
                    {unlinkingId === item.id ? <Loader2 className="size-4 animate-spin" /> : <Unlink className="size-4" />}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Imports em andamento (ou que falharam) */}
          {imports.length > 0 && (
            <ul className="-mx-4 divide-y divide-border border-t border-border">
              {imports.map((imp) => (
                <li key={imp.key} className="px-4 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    {imp.status === 'erro' ? (
                      <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
                    ) : (
                      <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-foreground">{imp.name}</span>
                    {imp.status === 'erro' ? (
                      <button
                        type="button"
                        onClick={() => setImports((prev) => prev.filter((i) => i.key !== imp.key))}
                        aria-label="Dispensar"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    ) : (
                      <span className="tabular-nums text-muted-foreground">Importando… {imp.progress}%</span>
                    )}
                  </div>
                  {imp.status === 'erro' ? (
                    <p className="ml-5.5 mt-0.5 pl-0.5 text-destructive">{imp.error}</p>
                  ) : (
                    <div className="ml-5.5 mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${imp.progress}%` }} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!connected && !status.error && (
            <p className="mb-3 mt-1 text-xs text-muted-foreground">
              {isOwner ? (
                <>
                  Conecte seu Google Drive em{' '}
                  <Link href={INTEGRATIONS_PATH} className="font-medium text-primary-ink underline">
                    Integrações
                  </Link>{' '}
                  para vincular pastas e importar vídeos de lá.
                </>
              ) : (
                'Para usar o Google Drive, peça ao dono da conta — ele é conectado em Integrações.'
              )}
            </p>
          )}
        </>
      )}

      {picking && (
        <DrivePickerModal linkedIds={linkedIds} onPick={link} onClose={() => setPicking(false)} />
      )}
      {importFrom && (
        <DrivePickerModal
          mode="import"
          title={`Importar vídeos de “${importFrom.name}”`}
          initialTrail={[{ id: importFrom.googleFileId, name: importFrom.name }]}
          linkedIds={new Set()}
          onPick={(file) => {
            // Junta o lote e importa quando o seletor fechar (ver onClose).
            pendingImport.current.push(file)
          }}
          onClose={() => {
            const files = pendingImport.current
            pendingImport.current = []
            setImportFrom(null)
            if (files.length > 0) void runImports(files)
          }}
        />
      )}
    </section>
  )
}
