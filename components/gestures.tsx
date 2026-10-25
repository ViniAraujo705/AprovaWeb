import { cn } from '@/lib/utils'

/**
 * Sistema de gestos da identidade Check (PDF "ID NOVA", página 2).
 *
 * - `check` (gesto 1): a própria mão forma o check. Para momentos bons — meta
 *   batida, equipe no ritmo, cliente aprovou.
 * - `approved` / `attention` / `critical` / `empty` (gesto 2): o dedo toca um
 *   selo que muda conforme o estado.
 *
 * Traços vetorizados direto do PDF. As cores saem de CSS custom properties
 * (`--gesture-stroke`, `--success`, `--warning`, `--danger`), então o mesmo
 * desenho serve pro modo normal e pro noturno sem prop de tema.
 */
export type GestureState = 'check' | 'approved' | 'attention' | 'critical' | 'empty'

const HAND_TOUCH =
  'M23.85 65.48L47.48 41.18C49.6 39 53.3 38.9 55.5 40.8C57.7 42.7 58 46.2 56.48 48.6L39.6 65.48M49.05 55.35C55.35 51.98 62.1 58.73 57.6 63.68L47.48 74.02M57.6 63.68C63.9 62.77 66.6 69.98 61.65 74.48L53.1 83.48M61.65 74.48C67.05 77.85 68.4 85.73 63.23 91.35C55.35 100.35 41.85 109.35 27.23 106.43C11.48 103.27 2.48 85.73 9.23 66.6C11.48 58.73 20.48 55.35 24.98 65.48'
const HAND_SPARKS = 'M30.6 24.98L38.48 30.6M47.48 12.6L49.05 23.85'

const DASHED_SQUARE =
  'M89.1 1.8H90.9C92.4 1.8 93.6 2.2 94.7 3.1M97.2 7.2V13.07M97.2 18.02V20.7C97.2 21.8 97 22.7 96.4 23.7M92.6 26.7C92 26.9 91.5 27 90.9 27H86.81M81.86 27H78.3C77.5 27 76.7 26.85 76 26.6M72.5 23.3C72.15 22.5 72 21.6 72 20.7V17.49M72 12.54V8.1C72 7.6 72.05 7.1 72.15 6.6M74.9 3C75.9 2.2 77 1.8 78.3 1.8H84.15'

/** Contorno grosso do selo pra ele "descolar" do fundo (traço externo + cor). */
function Badge({ state }: { state: Exclude<GestureState, 'check'> }) {
  if (state === 'approved') {
    return (
      <>
        <path d="M65.48 20.48L77.85 31.73L101.48 8.1" stroke="var(--gesture-stroke)" strokeWidth={16.2} />
        <path d="M65.48 20.48L77.85 31.73L101.48 8.1" stroke="var(--success)" strokeWidth={7.65} />
      </>
    )
  }
  if (state === 'attention') {
    return (
      <>
        <circle cx={84.6} cy={18.6} r={13.5} fill="var(--warning)" stroke="var(--gesture-stroke)" strokeWidth={4.5} />
        <path d="M84.6 10.95V19.05L90.45 22.65" stroke="var(--gesture-stroke)" strokeWidth={4.05} />
      </>
    )
  }
  if (state === 'critical') {
    return (
      <>
        <path d="M74.48 8.1L94.73 28.35M94.73 8.1L74.48 28.35" stroke="var(--gesture-stroke)" strokeWidth={16.2} />
        <path d="M74.48 8.1L94.73 28.35M94.73 8.1L74.48 28.35" stroke="var(--danger)" strokeWidth={7.65} />
      </>
    )
  }
  return <path d={DASHED_SQUARE} stroke="var(--gesture-stroke)" strokeWidth={3.6} />
}

const sparkColor: Record<Exclude<GestureState, 'check' | 'empty'>, string> = {
  approved: 'var(--success)',
  attention: 'var(--warning)',
  critical: 'var(--danger)',
}

export function Gesture({
  state,
  className,
  title,
  /** Traço em tom claro, pra superfícies verde-profundo (`bg-deep`). */
  onDeep = false,
}: {
  state: GestureState
  className?: string
  title?: string
  onDeep?: boolean
}) {
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true as const }
  const deepStyle = onDeep
    ? ({
        ['--gesture-stroke' as string]: 'var(--deep-foreground)',
        ['--gesture-muted' as string]: 'var(--deep-muted)',
      } as React.CSSProperties)
    : undefined

  if (state === 'check') {
    return (
      <svg
        viewBox="0 -32 212 226"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn('shrink-0', className)}
        style={deepStyle}
        {...a11y}
      >
        <path
          d="M50.57 37.15L73.05 55.63M85.54 -0.31L100.52 24.67M135.48 -25.28L136.98 9.68"
          stroke="var(--success)"
          strokeWidth={11}
        />
        <path
          d="M65.56 105.58L186.43 7.69C192 3.6 200 4.6 204 10.3C207.2 14.9 206.8 21.6 202.91 26.17L166.95 67.62C180.44 72.12 180.44 92.1 167.95 98.09C183.93 102.09 187.93 122.06 176.94 130.56L127.99 173.51C110.51 188.49 88.03 188.49 75.55 173.51L10.62 99.59C4.3 94.4 3.8 84.9 9.4 79.3C13.9 74.6 22.6 73.7 28.1 78.11L65.56 105.58"
          stroke="var(--gesture-stroke)"
          strokeWidth={11}
        />
        <path d="M137.98 85.6L166.95 67.62M143.98 120.57L167.95 98.09" stroke="var(--gesture-stroke)" strokeWidth={11} />
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 110 112"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', className)}
      style={deepStyle}
      {...a11y}
    >
      {state !== 'empty' && <path d={HAND_SPARKS} stroke={sparkColor[state]} strokeWidth={4.95} />}
      <path
        d={HAND_TOUCH}
        stroke={state === 'empty' ? 'var(--gesture-muted)' : 'var(--gesture-stroke)'}
        strokeWidth={4.95}
      />
      <Badge state={state} />
    </svg>
  )
}
