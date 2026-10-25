import { Check } from 'lucide-react'
import { CheckLogo } from '@/components/page-header'
import { ThemeToggle } from '@/components/theme-toggle'

/**
 * Casca das telas de entrada (login, cadastro, senha, convite) no padrão da
 * apresentação de marca: painel verde-profundo com a chamada "Dê um check na
 * sua operação." à esquerda e o formulário à direita. No celular sobra só o
 * formulário, com o logo em cima (o `children` já traz o logo, escondido no
 * desktop via `lg:hidden`).
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-deep px-12 py-10 text-deep-foreground lg:flex xl:px-16">
        <CheckLogo onDeep className="h-9 w-[148px]" priority />

        <div className="max-w-xl">
          <span className="inline-flex rounded-full border border-white/15 px-4 py-1.5 text-sm text-deep-muted">
            Para agências de marketing e conteúdo
          </span>
          <h2 className="mt-6 font-display text-6xl leading-[0.95] xl:text-7xl">
            Dê um <span className="text-primary">check</span> na sua operação.
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-deep-muted">
            Demandas de cada cliente, calendário da equipe, envio de vídeos e aprovação do cliente num só lugar.
          </p>

          <div className="mt-10 max-w-md rounded-3xl bg-card p-4 text-card-foreground shadow-2xl shadow-black/20">
            <div className="flex items-center justify-between px-1 pb-3">
              <p className="font-display text-base">Entregas da semana</p>
              <p className="text-xs text-muted-foreground">Marca Exemplo</p>
            </div>
            <ul className="flex flex-col gap-2">
              <AuthPreviewRow title="Reels — Lançamento" pill="approved" />
              <AuthPreviewRow title="Institucional 60s" pill="review" />
              <AuthPreviewRow title="Bastidores — gravação" pill="scheduled" />
            </ul>
          </div>
        </div>

        <p className="text-sm text-deep-muted">Plataforma de entregas para o mercado audiovisual.</p>
      </aside>

      <main className="relative grid min-h-screen place-items-center px-4 py-10 sm:px-8">
        <ThemeToggle className="absolute right-4 top-4" />
        {children}
      </main>
    </div>
  )
}

function AuthPreviewRow({ title, pill }: { title: string; pill: 'approved' | 'review' | 'scheduled' }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-2xl bg-background px-4 py-3 text-sm">
      <span className="truncate font-medium">{title}</span>
      {pill === 'approved' ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
          <Check className="size-3" strokeWidth={3} /> Aprovado
        </span>
      ) : pill === 'review' ? (
        <span className="shrink-0 rounded-full bg-[#3d533c] px-2.5 py-1 text-xs font-medium text-[#ebece7]">Em revisão</span>
      ) : (
        <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
          Gravação agendada
        </span>
      )}
    </li>
  )
}
