'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { authService } from '@/lib/services'
import { ApiError } from '@/lib/api'
import { ThemeToggle } from '@/components/theme-toggle'
import { CheckLogo } from '@/components/page-header'
import { AuthLayout } from '@/components/auth-layout'

type State = 'loading' | 'success' | 'error'

export function ConfirmEmailView({ token }: { token: string }) {
  const [state, setState] = useState<State>('loading')
  const [message, setMessage] = useState('Confirmando seu e-mail…')

  useEffect(() => {
    let active = true
    authService.confirmEmail(token)
      .then(() => {
        if (!active) return
        setState('success')
        setMessage('Seu e-mail foi confirmado. Agora você já pode entrar.')
      })
      .catch((err) => {
        if (!active) return
        setState('error')
        setMessage(
          err instanceof ApiError && (err.status === 404 || err.status === 410)
            ? 'Este link é inválido, expirou ou já foi utilizado.'
            : 'Não foi possível confirmar seu e-mail. Tente novamente mais tarde.',
        )
      })
    return () => { active = false }
  }, [token])

  return (
    <AuthLayout>
      <div className="w-full max-w-sm text-center">
        <div className="flex items-center justify-center lg:hidden">
          <CheckLogo className="h-10 w-[164px]" priority />
        </div>
        <h1 className="mt-8 font-display text-4xl lg:mt-0">Confirmar e-mail</h1>
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          {state === 'loading' && <Loader2 className="mx-auto mb-3 size-6 animate-spin text-primary-ink" />}
          {state === 'success' && <CheckCircle2 className="mx-auto mb-3 size-7 text-emerald-500" />}
          {state === 'error' && <XCircle className="mx-auto mb-3 size-7 text-destructive" />}
          <p>{message}</p>
        </div>
        {state !== 'loading' && (
          <Link href="/login" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 font-display text-base text-primary-foreground transition-opacity hover:opacity-90">
            Ir para entrar
          </Link>
        )}
      </div>
    </AuthLayout>
  )
}
