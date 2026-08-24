'use client'

/**
 * Itens de comentário compartilhados entre a tela do cliente e o canal do
 * cliente (visão agência). A resposta da agência é diferenciada visualmente
 * (alinhada à direita, destaque em rosa e label "Resposta da agência").
 */
import { useState } from 'react'
import { CornerDownRight, Loader2, MoreVertical, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Comment, CommentAuthorRole } from '@/lib/types'
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
          ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
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
        'h-fit shrink-0 rounded-md bg-primary/15 px-2 py-1 text-xs font-semibold text-primary',
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
      <div className="ml-auto max-w-[85%] rounded-xl border border-primary/40 bg-primary/10 p-3">
        <div className="flex items-center justify-end gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
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
