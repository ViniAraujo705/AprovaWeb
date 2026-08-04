/**
 * Preços e descrições de plano — não vêm da API (o backend só devolve
 * `limits`/`usage` em `GET /plans/me`). Combinado com o usuário: sem
 * checkout ainda, troca de plano é manual via admin.
 *
 * Fonte única para as telas "Meu Plano" (`components/plan-view.tsx`) e
 * comparação de planos (`components/plans-view.tsx`), pra preço/feature não
 * divergir entre as duas.
 */
import type { PlanId } from '@/lib/types'

export interface PlanPricing {
  id: PlanId
  name: string
  /** Preço mensal, sem compromisso anual. `0` para o Free. */
  monthly: number
  /** Preço equivalente por mês quando cobrado anualmente. `null` = sem opção anual (Free). */
  annualMonthly: number | null
  /** Total cobrado no plano anual (12x `annualMonthly`). */
  annualTotal: number | null
  description: string
  features: string[]
}

export const PLAN_PRICING: PlanPricing[] = [
  {
    id: 'free',
    name: 'Free',
    monthly: 0,
    annualMonthly: null,
    annualTotal: null,
    description: 'Para quem está começando a organizar aprovações de vídeo.',
    features: [
      '1 usuário (sem convite de editor)',
      'Até 3 clientes',
      'Até 8 vídeos por mês',
      'Até 3 perguntas de avaliação',
      'Até 5GB de armazenamento',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: 59,
    annualMonthly: 49,
    annualTotal: 588,
    description: 'Para agências com fluxo constante de aprovação.',
    features: [
      '1 usuário + 1 editor',
      'Clientes, vídeos e perguntas ilimitados',
      'Até 50GB de armazenamento',
      'Exportação de relatório em PDF',
    ],
  },
  {
    id: 'agencia',
    name: 'Agência',
    monthly: 169,
    annualMonthly: 141,
    annualTotal: 1690,
    description: 'Para equipes maiores com múltiplos clientes e membros.',
    features: [
      'Tudo do Pro',
      'Até 5 editores inclusos',
      '300GB de armazenamento',
      'Fila de processamento prioritária',
      'Painel de desempenho da equipe',
      'Suporte prioritário',
    ],
  },
]

export function planPricing(id: PlanId): PlanPricing {
  return PLAN_PRICING.find((p) => p.id === id) ?? PLAN_PRICING[0]
}

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
}
