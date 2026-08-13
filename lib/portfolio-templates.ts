import type { PortfolioTemplateId } from '@/lib/types'

/** Opções exibidas no seletor de tema do hub público — "Livre" (`id: null`) é sempre a primeira. */
export interface PortfolioTemplateOption {
  id: PortfolioTemplateId | null
  name: string
  description: string
}

export const PORTFOLIO_TEMPLATE_OPTIONS: PortfolioTemplateOption[] = [
  { id: null, name: 'Livre', description: 'Layout padrão: sidebar à esquerda, grade simples de 2 colunas.' },
  { id: 'minimalista', name: 'Minimalista', description: 'Sem sidebar, cabeçalho centralizado no topo, grade espaçada.' },
  { id: 'grade', name: 'Grade em destaque', description: 'Capa em banner no topo e grade densa de 3 colunas.' },
  { id: 'revista', name: 'Revista', description: 'Sidebar editorial com tipografia forte e grade de 3 colunas.' },
  { id: 'editorial-escuro', name: 'Editorial escuro', description: 'Capa em tela cheia com texto sobreposto, clima cinematográfico.' },
  { id: 'retrato', name: 'Retrato', description: 'Cards em formato vertical — ideal para fotografia still/produto.' },
]

/** Eixos de layout que cada tema ajusta na renderização do hub público (`PublicPortfolioHubView`). */
export interface PortfolioTemplateLayout {
  sidebarPosition: 'left' | 'top'
  heroBanner: boolean
  gridColsClass: string
  cardAspectClass: string
  headingClass: string
  sidebarBgClass: string
}

const DEFAULT_LAYOUT: PortfolioTemplateLayout = {
  sidebarPosition: 'left',
  heroBanner: false,
  gridColsClass: 'grid-cols-2',
  cardAspectClass: 'aspect-square',
  headingClass: 'tracking-wide',
  sidebarBgClass: 'bg-sidebar text-sidebar-foreground',
}

const PORTFOLIO_TEMPLATE_LAYOUTS: Record<PortfolioTemplateId, PortfolioTemplateLayout> = {
  minimalista: {
    ...DEFAULT_LAYOUT,
    sidebarPosition: 'top',
    headingClass: 'tracking-normal',
  },
  grade: {
    ...DEFAULT_LAYOUT,
    sidebarPosition: 'top',
    heroBanner: true,
    gridColsClass: 'grid-cols-3',
  },
  revista: {
    ...DEFAULT_LAYOUT,
    gridColsClass: 'grid-cols-3',
    headingClass: 'tracking-[0.2em] uppercase',
    sidebarBgClass: 'bg-card text-foreground',
  },
  'editorial-escuro': {
    ...DEFAULT_LAYOUT,
    sidebarPosition: 'top',
    heroBanner: true,
    headingClass: 'tracking-[0.15em] uppercase',
  },
  retrato: {
    ...DEFAULT_LAYOUT,
    cardAspectClass: 'aspect-[3/4]',
  },
}

export function resolvePortfolioTemplateLayout(id: PortfolioTemplateId | null): PortfolioTemplateLayout {
  return id ? PORTFOLIO_TEMPLATE_LAYOUTS[id] : DEFAULT_LAYOUT
}
