'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, User as UserIcon, Eye, EyeOff } from 'lucide-react'
import { inviteService } from '@/lib/services'
import { ThemeToggle } from '@/components/theme-toggle'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

export function AcceptInviteView({ token }: { token: string }) {
  const router = useRouter()

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{ name?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function validate() {
    const next: { name?: string; password?: string } = {}
    if (!name.trim()) next.name = 'Informe seu nome.'
    if (!password) next.password = 'Crie uma senha.'
    else if (password.length < 6) next.password = 'A senha deve ter ao menos 6 caracteres.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!validate()) return
    setSubmitting(true)
    try {
      await inviteService.accept(token, { name: name.trim(), password })
      router.replace('/login?invited=1')
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
        setFormError('Este convite é inválido ou já expirou. Peça um novo à agência.')
      } else if (err instanceof ApiError) {
        setFormError(err.message)
      } else {
        setFormError('Não foi possível aceitar o convite. Tente novamente.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <ThemeToggle className="fixed right-4 top-4" />
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2">
          <span className="relative size-9 shrink-0 overflow-hidden rounded-lg">
            <Image src="/logo-check.png" alt="Check" fill className="object-cover" sizes="36px" />
          </span>
          <span className="font-display text-3xl leading-none tracking-wide">CHECK</span>
        </div>

        <h1 className="mt-8 text-center font-display text-4xl tracking-wide">ACEITAR CONVITE</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Crie sua senha para entrar como editor da agência.
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Nome</span>
            <div className="relative">
              <UserIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={!!errors.name}
                placeholder="Seu nome"
                className={cn(
                  'min-h-11 w-full rounded-lg border bg-secondary pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary',
                  errors.name ? 'border-destructive' : 'border-border',
                )}
              />
            </div>
            {errors.name && <span className="text-xs text-destructive">{errors.name}</span>}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Senha</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!errors.password}
                placeholder="Mínimo de 6 caracteres"
                className={cn(
                  'min-h-11 w-full rounded-lg border bg-secondary pl-9 pr-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary',
                  errors.password ? 'border-destructive' : 'border-border',
                )}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {errors.password && (
              <span className="text-xs text-destructive">{errors.password}</span>
            )}
          </label>

          {formError && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 font-display text-xl tracking-wide text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="size-5 animate-spin" /> CRIANDO ACESSO…
              </>
            ) : (
              'ACEITAR E CRIAR ACESSO'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Já tem conta?{' '}
          <Link href="/login" className="font-medium text-foreground underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}
