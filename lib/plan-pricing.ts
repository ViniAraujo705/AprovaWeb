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
    id: 'portfolio',
    name: 'Portfólio',
    monthly: 19,
    annualMonthly: 16,
    annualTotal: 192,
    description: 'Para apresentar seus trabalhos em um portfólio público profissional.',
    features: [
      'Perfil e portfólio público',
      'Projetos no portfólio ilimitados',
      '10GB de armazenamento',
    ],
  },
  {
    id: 'free',
    name: 'Free',
    monthly: 0,
    annualMonthly: null,
    annualTotal: null,
    description: 'Para começar a receber aprovações de vídeo.',
    features: [
      'Perfil e portfólio público',
      'Até 6 projetos no portfólio',
      '1 cliente ativo e 1 membro na equipe',
      'Até 10 vídeos/arquivos em aprovação por mês',
      'Até 5GB de armazenamento',
      'Solicitação de alterações e aprovação pelo cliente',
      'Gestão básica de gravações, entregas e área do cliente',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: 69,
    annualMonthly: 57,
    annualTotal: 684,
    description: 'Para times com fluxo constante de produção e aprovação.',
    features: [
      'Perfil e portfólio público com projetos ilimitados',
      'Até 8 clientes ativos e 3 membros na equipe',
      'Até 100 vídeos/arquivos em aprovação por mês',
      '100GB de armazenamento',
      'Gestão completa de gravações, entregas e área do cliente',
      'Calendário de conteúdo e conteúdo para postagem',
      'Relatórios básicos',
    ],
  },
  {
    id: 'agencia',
    name: 'Agência',
    monthly: 149,
    annualMonthly: 124,
    annualTotal: 1488,
    description: 'Para equipes maiores com múltiplos clientes e membros.',
    features: [
      'Perfil e portfólio público com projetos ilimitados',
      'Até 30 clientes ativos e 8 membros na equipe',
      'Até 500 vídeos/arquivos em aprovação por mês',
      '500GB de armazenamento',
      'Gestão completa, calendário e conteúdo para postagem',
      'Relatórios avançados e desempenho da equipe',
      'Processamento e suporte prioritários',
    ],
  },
]

export function planPricing(id: PlanId): PlanPricing {
  return PLAN_PRICING.find((p) => p.id === id) ?? PLAN_PRICING[0]
}

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
}
