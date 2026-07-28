import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

/** Tela de fallback compartilhada por rotas públicas (/v, /g) quando o link não existe ou expirou. */
export function LinkUnavailable({
  description = 'Este link não existe ou expirou.',
}: {
  description?: string
}) {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-7" />
        </span>
        <h1 className="mt-4 font-display text-3xl tracking-wide">LINK INDISPONÍVEL</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-secondary px-4 text-sm font-medium text-foreground hover:bg-secondary/70"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  )
}
