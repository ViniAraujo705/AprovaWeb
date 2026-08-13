'use client'

/**
 * Guarda de rota protegida. Redireciona para /login quando não há sessão e,
 * opcionalmente, exige a role admin. Enquanto valida, mostra um loader para
 * evitar flash de conteúdo protegido.
 */
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-provider'
import { LoadingState } from '@/components/states'
import type { Role, TeamRole } from '@/lib/types'

export function RequireAuth({
  children,
  role,
  teamRole,
  redirectTo = '/dashboard',
}: {
  children: React.ReactNode
  /** Papel de sistema exigido (admin). */
  role?: Role
  /** Papel na conta exigido (ex.: owner para gestão de equipe). */
  teamRole?: TeamRole
  /** Para onde mandar quem não tem o papel exigido. Use uma rota que o papel
   * negado realmente acessa — '/dashboard' é owner-only, então páginas que
   * bloqueiam o editor não podem usar o default nele (looping). */
  redirectTo?: string
}) {
  const { user, loading, isAuthenticated } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const roleDenied = !!role && user?.role !== role
  const teamRoleDenied = !!teamRole && user?.teamRole !== teamRole

  useEffect(() => {
    if (loading) return
    if (!isAuthenticated) {
      const redirect = encodeURIComponent(pathname)
      router.replace(`/login?redirect=${redirect}`)
      return
    }
    if (roleDenied || teamRoleDenied) {
      router.replace(redirectTo)
    }
  }, [loading, isAuthenticated, roleDenied, teamRoleDenied, router, pathname, redirectTo])

  if (loading || !isAuthenticated || roleDenied || teamRoleDenied) {
    return (
      <div className="grid min-h-screen place-items-center">
        <LoadingState label="Verificando acesso…" />
      </div>
    )
  }

  return <>{children}</>
}
