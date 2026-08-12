import type { CalendarActivityType } from './types'

export const CALENDAR_ACTIVITY_TYPE_LABEL: Record<CalendarActivityType, string> = {
  gravacao: 'Gravação',
  captacao: 'Captação',
  ensaio: 'Ensaio',
  reuniao: 'Reunião',
  entrega: 'Entrega',
  prazo: 'Prazo',
  evento: 'Evento',
  demanda_interna: 'Demanda interna',
}

export const CALENDAR_ACTIVITY_TYPES: CalendarActivityType[] = [
  'gravacao',
  'captacao',
  'ensaio',
  'reuniao',
  'entrega',
  'prazo',
  'evento',
  'demanda_interna',
]
