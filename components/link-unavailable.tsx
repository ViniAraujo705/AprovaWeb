import Link from 'next/link'
import { Gesture } from '@/components/gestures'
import { CheckLogo } from '@/components/page-header'

/** Tela de fallback compartilhada por rotas públicas (/v, /g) quando o link não existe ou expirou. */
export function LinkUnavailable({
  description = 'Este link não existe ou expirou.',
}: {
  description?: string
}) {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="max-w-sm text-center">
        <CheckLogo className="mx-auto mb-10 !block h-8 w-[130px]" />
        <Gesture state="empty" className="mx-auto h-24 w-auto" />
        <h1 className="mt-6 font-display text-3xl">Link indisponível</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-secondary"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  )
}
