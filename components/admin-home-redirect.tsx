'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-provider'
import { isDemo } from '@/lib/demo'

/**
 * No workspace de super admin a conta não é uma agência: o dashboard e as
 * demais telas respondem 403. Todo login/troca de conta cai em /dashboard,
 * então o admin é mandado direto para o painel.
 */
export function AdminHomeRedirect({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const router = useRouter()
  // O usuário demo também tem role admin, mas a demo precisa abrir no dashboard.
  const isAdmin = user?.role === 'admin' && !isDemo()
  useEffect(() => {
    if (isAdmin) router.replace('/admin')
  }, [isAdmin, router])
  if (isAdmin) return null
  return <>{children}</>
}
