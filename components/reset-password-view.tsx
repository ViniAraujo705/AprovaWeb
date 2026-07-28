'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Play, Loader2, Lock } from 'lucide-react'
import { authService } from '@/lib/services'
import { ThemeToggle } from '@/components/theme-toggle'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

export function ResetPasswordView({ token }: { token: string }) {
  const router = useRouter()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function validate() {
    const next: { password?: string; confirmPassword?: string } = {}
    if (!password) next.password = 'Crie uma nova senha.'
    else if (password.length < 6) next.password = 'A senha deve ter ao menos 6 caracteres.'
    if (confirmPassword !== password) next.confirmPassword = 'As senhas não coincidem.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!validate()) return
    setSubmitting(true)
    try {
      await authService.resetPassword(token, password)
      router.replace('/login?reset=1')
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
        setFormError('Este link é inválido ou já expirou. Peça um novo.')
      } else if (err instanceof ApiError) {
        setFormError(err.message)
      } else {
        setFormError('Não foi possível redefinir a senha. Tente novamente.')
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
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Play className="size-5 fill-current" />
          </span>
          <span className="font-display text-3xl leading-none tracking-wide">APROVA</span>
        </div>

        <h1 className="mt-8 text-center font-display text-4xl tracking-wide">REDEFINIR SENHA</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Escolha uma nova senha para sua conta.
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Nova senha</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!errors.password}
                placeholder="Mínimo de 6 caracteres"
                className={cn(
                  'min-h-11 w-full rounded-lg border bg-secondary pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary',
                  errors.password ? 'border-destructive' : 'border-border',
                )}
              />
            </div>
            {errors.password && (
              <span className="text-xs text-destructive">{errors.password}</span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Confirmar senha</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                aria-invalid={!!errors.confirmPassword}
                placeholder="Repita a nova senha"
                className={cn(
                  'min-h-11 w-full rounded-lg border bg-secondary pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary',
                  errors.confirmPassword ? 'border-destructive' : 'border-border',
                )}
              />
            </div>
            {errors.confirmPassword && (
              <span className="text-xs text-destructive">{errors.confirmPassword}</span>
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
                <Loader2 className="size-5 animate-spin" /> REDEFININDO…
              </>
            ) : (
              'REDEFINIR SENHA'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Lembrou a senha?{' '}
          <Link href="/login" className="font-medium text-foreground underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}
