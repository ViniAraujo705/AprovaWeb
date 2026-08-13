'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { authService } from '@/lib/services'
import { ApiError } from '@/lib/api'
import { ThemeToggle } from '@/components/theme-toggle'

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
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <ThemeToggle className="fixed right-4 top-4" />
      <div className="w-full max-w-sm text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="relative size-9 shrink-0 overflow-hidden rounded-lg">
            <Image src="/logo-check.png" alt="Check" fill className="object-cover" sizes="36px" />
          </span>
          <span className="font-display text-3xl leading-none tracking-wide">CHECK</span>
        </div>
        <h1 className="mt-8 font-display text-4xl tracking-wide">CONFIRMAR E-MAIL</h1>
        <div className="mt-6 rounded-lg border border-border bg-secondary p-5 text-sm text-muted-foreground">
          {state === 'loading' && <Loader2 className="mx-auto mb-3 size-6 animate-spin text-primary" />}
          {state === 'success' && <CheckCircle2 className="mx-auto mb-3 size-7 text-emerald-500" />}
          {state === 'error' && <XCircle className="mx-auto mb-3 size-7 text-destructive" />}
          <p>{message}</p>
        </div>
        {state !== 'loading' && (
          <Link href="/login" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 font-display text-xl tracking-wide text-primary-foreground transition-opacity hover:opacity-90">
            IR PARA ENTRAR
          </Link>
        )}
      </div>
    </div>
  )
}
