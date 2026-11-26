'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-provider'
import { isDemo } from '@/lib/demo'
import { shouldShowOnboarding } from '@/lib/onboarding'

/**
 * Manda o dono de uma conta nova pro `/boas-vindas` enquanto ele não concluir
 * (ou pular) o tutorial — cobre quem fechou a aba no meio ou entrou pelo login
 * em vez de vir direto do cadastro.
 */
export function OnboardingGate() {
  const { user } = useAuth()
  const router = useRouter()
  useEffect(() => {
    if (isDemo()) return
    if (shouldShowOnboarding(user)) router.replace('/boas-vindas')
  }, [user, router])
  return null
}
