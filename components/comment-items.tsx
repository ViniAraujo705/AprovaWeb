'use client'

/**
 * Itens de comentário compartilhados entre a tela do cliente e o canal do
 * cliente (visão agência). A resposta da agência é diferenciada visualmente
 * (alinhada à direita, destaque em rosa e label "Resposta da agência").
 */
import { useState } from 'react'
import { ChevronDown, CornerDownRight, History, Loader2, MoreVertical, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Comment, CommentAuthorRole, PreviousVersionComment } from '@/lib/types'
import { isAgencyAuthor } from '@/lib/types'
import { formatDuration } from '@/lib/format'
import { motion } from '@/components/motion'

const roleLabel: Record<CommentAuthorRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  agency: 'Agência',
  client: 'Cliente',
}

/** Chip de papel do autor (rosa para a agência, neutro para o cliente). */
export function RoleBadge({ role }: { role: CommentAuthorRole }) {
  const agency = role === 'owner' || role === 'editor' || role === 'agency'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        agency
          ? 'bg-primary/15 text-primary-ink ring-1 ring-primary-ink/30'
          : 'bg-secondary text-muted-foreground ring-1 ring-border',
      )}
    >
      {roleLabel[role]}
    </span>
  )
}

/** Botão-timestamp que pula para o ponto do vídeo. */
export function TimestampChip({
  seconds,
  onSeek,
  className,
}: {
  seconds: number
  onSeek: (t: number) => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onSeek(seconds)}
      className={cn(
        'h-fit shrink-0 rounded-md bg-primary/15 px-2 py-1 text-xs font-semibold text-primary-ink',
        className,
      )}
    >
      {formatDuration(seconds)}
    </button>
  )
}

/** Comentário do cliente (alinhado à esquerda). */
export function ClientCommentItem({
  comment,
  onSeek,
}: {
  comment: Comment
  onSeek: (t: number) => void
}) {
  return (
    <li className="flex gap-3 rounded-xl border border-border bg-card p-3">
      <TimestampChip seconds={comment.timestamp} onSeek={onSeek} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{comment.author}</p>
        {comment.text && <p className="text-sm text-muted-foreground">{comment.text}</p>}
        {comment.audioUrl && (
          <audio controls src={comment.audioUrl} className="mt-1.5 h-9 w-full max-w-full" />
        )}
      </div>
    </li>
  )
}

/** Largura (px) do menu de ações revelado ao arrastar. */
const ACTIONS_WIDTH = 72

/**
 * Comentário do cliente no canal do cliente (visão do owner), com um
 * menuzinho de ação para excluir
 * revelado arrastando o card para a esquerda — ou pelo botão de "⋮" para
 * quem não está em um dispositivo touch.
 */
export function DraggableClientCommentItem({
  comment,
  onSeek,
  onDelete,
  deleting,
}: {
  comment: Comment
  onSeek: (t: number) => void
  onDelete: () => void
  deleting?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <li className="relative overflow-hidden rounded-xl">
      {/* Menu revelado atrás do card */}
      <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTIONS_WIDTH }}>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={deleting}
          className="flex w-[72px] flex-col items-center justify-center gap-1 bg-destructive text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          Excluir
        </button>
      </div>

      <motion.div
        drag="x"
        dragConstraints={{ left: -ACTIONS_WIDTH, right: 0 }}
        dragElastic={0.06}
        animate={{ x: open ? -ACTIONS_WIDTH : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 42 }}
        onDragEnd={(_, info) => setOpen(info.offset.x < -ACTIONS_WIDTH / 2)}
        className="relative z-10 flex gap-3 rounded-xl border border-border bg-card p-3"
      >
        <TimestampChip seconds={comment.timestamp} onSeek={onSeek} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{comment.author}</p>
          {confirmingDelete ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-xs text-destructive">Excluir este comentário?</span>
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="inline-flex min-h-7 items-center rounded-md bg-destructive px-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {deleting && <Loader2 className="mr-1 size-3 animate-spin" />}
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="inline-flex min-h-7 items-center rounded-md bg-secondary px-2 text-xs font-medium text-foreground hover:bg-secondary/70"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <>
              {comment.text && <p className="text-sm text-muted-foreground">{comment.text}</p>}
              {comment.audioUrl && (
                <audio controls src={comment.audioUrl} className="mt-1.5 h-9 w-full max-w-full" />
              )}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Ações do comentário"
          className="h-fit shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <MoreVertical className="size-4" />
        </button>
      </motion.div>
    </li>
  )
}

/**
 * Resposta da agência publicada no canal do cliente. Alinhada à direita, com
 * destaque em rosa e label explícita — visível tanto para o owner quanto para o
 * cliente na visão pública.
 */
export function AgencyReplyItem({
  comment,
  onSeek,
}: {
  comment: Comment
  onSeek: (t: number) => void
}) {
  return (
    <li className="flex flex-col items-end">
      <div className="ml-auto max-w-[85%] rounded-xl border border-primary-ink/40 bg-primary/10 p-3">
        <div className="flex items-center justify-end gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary-ink">
            <CornerDownRight className="size-3" />
            Resposta da agência
          </span>
          <TimestampChip seconds={comment.timestamp} onSeek={onSeek} />
        </div>
        <p className="mt-1.5 text-right text-sm text-foreground">{comment.text}</p>
        <p className="mt-0.5 text-right text-xs text-muted-foreground">{comment.author}</p>
      </div>
    </li>
  )
}

/**
 * Comentários das versões anteriores do vídeo: recolhidos por padrão, em tom
 * apagado e só leitura. Continuam registrados (nada é apagado ao subir nova
 * versão), mas não disputam atenção com os comentários da versão atual.
 *
 * O timestamp é só texto, não um botão de seek: ele se refere ao corte da
 * versão antiga, e pular pra esse segundo no vídeo novo levaria a outro ponto.
 * Pelo mesmo motivo estes comentários não entram nos marcadores da timeline.
 */
export function PreviousVersionsSection({
  comments,
  label = 'Versões anteriores',
  className,
}: {
  comments: PreviousVersionComment[]
  label?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  if (comments.length === 0) return null

  // Mais recente primeiro; dentro da versão, na ordem do vídeo.
  const versions = [...new Set(comments.map((c) => c.version))].sort((a, b) => b - a)

  return (
    <div className={cn('rounded-xl border border-dashed border-border', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <History className="size-3.5 shrink-0" />
        <span className="flex-1">
          {label} ({comments.length})
        </span>
        <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-dashed border-border px-3 pb-3 pt-2.5">
          {versions.map((version) => (
            <div key={version}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Versão {version}
              </p>
              <ul className="mt-1.5 flex flex-col gap-2">
                {comments
                  .filter((c) => c.version === version)
                  .sort((a, b) => a.timestamp - b.timestamp)
                  .map((c) => (
                    <li key={c.id} className="flex gap-2.5 rounded-lg bg-secondary/40 p-2.5 text-muted-foreground">
                      <span className="h-fit shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
                        {formatDuration(c.timestamp)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-medium">{c.author}</span>
                          {isAgencyAuthor(c.authorRole) && c.authorRole && <RoleBadge role={c.authorRole} />}
                        </div>
                        {c.text && <p className="mt-0.5 text-xs">{c.text}</p>}
                        {c.audioUrl && (
                          <audio controls src={c.audioUrl} className="mt-1.5 h-8 w-full max-w-full opacity-80" />
                        )}
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
