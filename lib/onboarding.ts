/**
 * Onboarding de primeiro acesso (`/boas-vindas`): passo a passo em tela cheia
 * que o dono da conta vê logo depois do cadastro. O conteúdo se adapta ao
 * plano em vigor — ensina o que o plano dá e mostra os limites dele.
 *
 * Os limites aqui espelham `src/plans/plan-limits.config.ts` do Aprova-back
 * (o frontend ainda não recebe `maxTeamMembers` em `GET /plans/me`); se o
 * backend mudar um número, mude aqui também. Equipe conta o dono.
 */
import type { PlanId, User } from '@/lib/types'

const DONE_KEY_PREFIX = 'check:onboarding-concluido:'

/**
 * Contas criadas antes desta data não são mandadas pro onboarding — quem já
 * usa o Check não deve cair num "boas-vindas" do nada.
 */
const ONBOARDING_RELEASED_AT = new Date('2026-11-26T00:00:00-03:00').getTime()

export function isOnboardingDone(userId: string): boolean {
  try {
    return localStorage.getItem(DONE_KEY_PREFIX + userId) === '1'
  } catch {
    // Sem storage: não força o onboarding (melhor pular do que prender a pessoa nele).
    return true
  }
}

export function markOnboardingDone(userId: string) {
  try {
    localStorage.setItem(DONE_KEY_PREFIX + userId, '1')
  } catch {
    // sem storage: nada a fazer
  }
}

/** Dono, conta nova (criada depois do lançamento do onboarding) e que ainda não concluiu. */
export function shouldShowOnboarding(user: User | null | undefined): boolean {
  if (!user || user.teamRole !== 'owner' || !user.createdAt) return false
  const created = new Date(user.createdAt).getTime()
  if (Number.isNaN(created) || created < ONBOARDING_RELEASED_AT) return false
  return !isOnboardingDone(user.id)
}

export interface PlanTour {
  maxClients: number | null
  /** Inclui o dono. */
  maxTeamMembers: number
  maxVideosPerMonth: number | null
  storageGb: number
  whiteLabel: boolean
  calendar: boolean
  publishContent: boolean
  reports: 'none' | 'basic' | 'advanced'
  teamPerformance: boolean
  priority: boolean
}

export const PLAN_TOUR: Record<PlanId, PlanTour> = {
  portfolio: {
    maxClients: 0,
    maxTeamMembers: 1,
    maxVideosPerMonth: 0,
    storageGb: 10,
    whiteLabel: false,
    calendar: false,
    publishContent: false,
    reports: 'none',
    teamPerformance: false,
    priority: false,
  },
  free: {
    maxClients: 1,
    maxTeamMembers: 1,
    maxVideosPerMonth: 10,
    storageGb: 5,
    whiteLabel: false,
    calendar: false,
    publishContent: false,
    reports: 'none',
    teamPerformance: false,
    priority: false,
  },
  pro: {
    maxClients: 8,
    maxTeamMembers: 3,
    maxVideosPerMonth: 100,
    storageGb: 100,
    whiteLabel: true,
    calendar: true,
    publishContent: true,
    reports: 'basic',
    teamPerformance: false,
    priority: false,
  },
  agencia: {
    maxClients: 30,
    maxTeamMembers: 8,
    maxVideosPerMonth: 500,
    storageGb: 500,
    whiteLabel: true,
    calendar: true,
    publishContent: true,
    reports: 'advanced',
    teamPerformance: true,
    priority: true,
  },
}

/** Paleta sugerida no passo "cor da marca" (a pessoa ainda pode digitar outra). */
export const BRAND_SWATCHES = [
  '#d6f593',
  '#253326',
  '#0b0b0d',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#e11d48',
  '#ea580c',
  '#f59e0b',
  '#0d9488',
  '#0ea5e9',
  '#64748b',
]
