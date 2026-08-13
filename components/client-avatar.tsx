import Image from 'next/image'

// Paleta fixa (independente do tema) pra manter contraste com o texto branco
// das iniciais tanto no claro quanto no escuro.
const AVATAR_COLORS = [
  'bg-rose-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-lime-600',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-fuchsia-500',
  'bg-pink-500',
]

function hashToIndex(input: string, length: number): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0
  }
  return hash % length
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const SIZE_CLASSES = {
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-10 text-sm',
} as const

/**
 * Avatar do cliente: foto quando existe, senão iniciais sobre uma cor
 * derivada de um hash estável (`seed`, tipicamente o clientId) — mesma cor
 * sempre pro mesmo cliente, sem precisar guardar isso em lugar nenhum.
 */
export function ClientAvatar({
  name,
  photoUrl,
  seed,
  size = 'md',
  className = '',
}: {
  name: string
  photoUrl?: string | null
  seed?: string
  size?: keyof typeof SIZE_CLASSES
  className?: string
}) {
  const sizeClasses = SIZE_CLASSES[size]

  if (photoUrl) {
    return (
      <span className={`relative shrink-0 overflow-hidden rounded-full ${sizeClasses} ${className}`}>
        <Image src={photoUrl} alt="" fill className="object-cover" sizes="40px" unoptimized />
      </span>
    )
  }

  const colorClass = AVATAR_COLORS[hashToIndex(seed || name, AVATAR_COLORS.length)]
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-bold text-white ${sizeClasses} ${colorClass} ${className}`}
    >
      {initials(name)}
    </span>
  )
}
