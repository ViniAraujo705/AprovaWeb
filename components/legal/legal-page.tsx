import Link from 'next/link'
import { CheckLogo } from '@/components/page-header'

/** Moldura simples das páginas legais públicas (fora do shell autenticado). */
export function LegalPage({ title, updatedAt, children }: { title: string; updatedAt: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-background px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <Link href="/" aria-label="Início">
          <CheckLogo className="h-8 w-auto" />
        </Link>
        <h1 className="mt-10 font-display text-4xl leading-tight text-foreground sm:text-5xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Atualizado em {updatedAt}</p>
        <div className="mt-8 flex flex-col gap-6 text-[15px] leading-relaxed text-foreground [&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-xl [&_li]:ml-5 [&_li]:list-disc [&_a]:font-medium [&_a]:text-primary-ink [&_a]:underline">
          {children}
        </div>
      </div>
    </main>
  )
}
