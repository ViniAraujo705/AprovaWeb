'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, User as UserIcon, Eye, EyeOff } from 'lucide-react'
import { inviteService } from '@/lib/services'
import { useAuth } from '@/components/auth-provider'
import { ThemeToggle } from '@/components/theme-toggle'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { CheckLogo } from '@/components/page-header'
import { AuthLayout } from '@/components/auth-layout'

export function AcceptInviteView({ token }: { token: string }) {
  const router = useRouter()
  const { applySession } = useAuth()

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{ password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function validate() {
    const next: { password?: string } = {}
    if (!password) next.password = 'Informe a senha.'
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
      // O backend decide sozinho se é um e-mail novo (cria conta com `name`)
      // ou um e-mail que já tem conta em outra agência (`password` confirma
      // a identidade, `name` é ignorado) — ver API.md "Conta / equipe".
      const { token: accessToken, user } = await inviteService.accept(token, {
        name: name.trim() || undefined,
        password,
      })
      applySession(accessToken, user)
      router.replace('/dashboard')
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
        setFormError('Este convite é inválido ou já expirou. Peça um novo à agência.')
      } else if (err instanceof ApiError && err.status === 401) {
        setFormError('Senha incorreta. Se você já tem uma conta, informe a senha atual dela.')
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
    <AuthLayout>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center lg:hidden">
          <CheckLogo className="h-10 w-[164px]" priority />
        </div>

        <h1 className="mt-8 text-center font-display text-4xl lg:mt-0 lg:text-left">Aceitar convite</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground lg:text-left">
          Já tem conta com este e-mail em outra agência? Informe só sua senha
          atual. Se não, preencha seu nome e crie uma senha.
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">
              Nome <span className="text-muted-foreground">(se for sua primeira conta)</span>
            </span>
            <div className="relative">
              <UserIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                className="min-h-11 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary-ink"
              />
            </div>
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
                placeholder="Nova senha (ou senha atual, se já tiver conta)"
                className={cn(
                  'min-h-12 w-full rounded-xl border bg-card pl-9 pr-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary-ink',
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
            <p className="rounded-xl border border-danger-border bg-danger-soft px-3 py-2.5 text-sm text-danger-ink">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-display text-base text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="size-5 animate-spin" /> Aceitando…
              </>
            ) : (
              'Aceitar convite'
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
    </AuthLayout>
  )
}
