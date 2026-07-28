'use client'

import { Check, CreditCard, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FadeIn } from '@/components/motion'

type PlanTier = {
  id: string
  name: string
  price: string
  description: string
  features: string[]
  current?: boolean
  highlighted?: boolean
}

// Placeholder — valores e limites ainda serão definidos.
const plans: PlanTier[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 'A definir',
    description: 'Para quem está começando a organizar aprovações de vídeo.',
    features: ['Projetos limitados', 'Vídeos limitados por mês', 'Link de aprovação com marca APROVA'],
    current: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'A definir',
    description: 'Para agências com fluxo constante de aprovação.',
    features: [
      'Projetos ilimitados',
      'Vídeos ilimitados',
      'Link de aprovação sem marca d’água',
      'Canal do cliente',
    ],
    highlighted: true,
  },
  {
    id: 'business',
    name: 'Business',
    price: 'A definir',
    description: 'Para equipes maiores com múltiplos clientes e membros.',
    features: [
      'Tudo do Pro',
      'Membros de equipe ilimitados',
      'Branding personalizado',
      'Suporte prioritário',
    ],
  },
]

export function PlansView() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-10">
      <div className="flex items-center gap-2">
        <h1 className="font-display text-4xl tracking-wide sm:text-5xl">PLANOS</h1>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground ring-1 ring-border">
          Em breve
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Os planos e valores ainda estão sendo definidos. Esta é uma prévia de como a sua agência
        poderá comparar e escolher um plano.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <FadeIn key={plan.id} y={6}>
            <div
              className={cn(
                'flex h-full flex-col rounded-2xl border p-5 sm:p-6',
                plan.highlighted
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/40'
                  : 'border-border bg-card',
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {plan.highlighted ? (
                    <Sparkles className="size-4 text-primary" />
                  ) : (
                    <CreditCard className="size-4 text-muted-foreground" />
                  )}
                  {plan.name}
                </div>
                {plan.current && (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    Plano atual
                  </span>
                )}
              </div>

              <p className="mt-3 font-display text-3xl tracking-wide">{plan.price}</p>
              <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>

              <ul className="mt-5 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                disabled
                title="Em breve"
                className={cn(
                  'mt-6 inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50',
                  plan.highlighted
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-foreground',
                )}
              >
                {plan.current ? 'Plano atual' : 'Em breve'}
              </button>
            </div>
          </FadeIn>
        ))}
      </div>
    </div>
  )
}
