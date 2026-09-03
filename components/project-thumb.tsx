import Image from 'next/image'

const SIZE_CLASSES = {
  sm: 'size-8',
  md: 'size-10',
  lg: 'size-14',
} as const

/**
 * Miniatura quadrada da foto do projeto (`Project.photoUrl`). Projeto sem foto
 * cai no `fallback` que cada tela já usava antes — avatar do cliente na lista
 * de projetos, ícone de pasta dentro do cliente —, então nada muda de aparência
 * pros projetos antigos.
 */
export function ProjectThumb({
  photoUrl,
  size = 'md',
  className = '',
  fallback = null,
}: {
  photoUrl?: string | null
  size?: keyof typeof SIZE_CLASSES
  className?: string
  fallback?: React.ReactNode
}) {
  if (!photoUrl) return <>{fallback}</>
  return (
    <span
      className={`relative shrink-0 overflow-hidden rounded-lg bg-secondary ${SIZE_CLASSES[size]} ${className}`}
    >
      <Image src={photoUrl} alt="" fill className="object-cover" sizes="56px" unoptimized />
    </span>
  )
}
