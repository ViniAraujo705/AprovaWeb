'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Play, Loader2, Mail, Lock, Check, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/components/auth-provider'
import { ThemeToggle } from '@/components/theme-toggle'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginView() {
  const { login, loginDemo } = useAuth()
  const router = useRouter()
  const params = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Vindo da tela de aceitar convite: acesso criado com sucesso.
  const justInvited = params.get('invited') === '1'
  // Vindo da tela de redefinir senha: senha alterada com sucesso.
  const justReset = params.get('reset') === '1'

  function handleDemo() {
    loginDemo()
    router.replace('/dashboard')
  }

  function validate() {
    const next: { email?: string; password?: string } = {}
    if (!email.trim()) next.email = 'Informe seu e-mail.'
    else if (!EMAIL_RE.test(email.trim())) next.email = 'E-mail inválido.'
    if (!password) next.password = 'Informe sua senha.'
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
      await login(email.trim(), password)
      const redirect = params.get('redirect')
      router.replace(redirect && redirect.startsWith('/') ? redirect : '/dashboard')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setFormError('E-mail ou senha incorretos.')
      } else if (err instanceof ApiError) {
        setFormError(err.message)
      } else {
        setFormError('Não foi possível entrar. Tente novamente.')
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

        <h1 className="mt-8 text-center font-display text-4xl tracking-wide">ENTRAR</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Acesse o painel para enviar e acompanhar seus vídeos.
        </p>

        {justInvited && (
          <p className="mt-6 flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-400">
            <Check className="size-4" /> Acesso criado! Entre com seu e-mail e senha.
          </p>
        )}

        {justReset && (
          <p className="mt-6 flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-400">
            <Check className="size-4" /> Senha redefinida! Entre com sua nova senha.
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">E-mail</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!errors.email}
                placeholder="voce@agencia.com"
                className={cn(
                  'min-h-11 w-full rounded-lg border bg-secondary pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary',
                  errors.email ? 'border-destructive' : 'border-border',
                )}
              />
            </div>
            {errors.email && <span className="text-xs text-destructive">{errors.email}</span>}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Senha</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!errors.password}
                placeholder="••••••••"
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
            <Link
              href="/esqueci-senha"
              className="self-end text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Esqueci minha senha
            </Link>
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
                <Loader2 className="size-5 animate-spin" /> ENTRANDO…
              </>
            ) : (
              'ENTRAR'
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Não tem conta?{' '}
          <Link href="/register" className="font-medium text-foreground underline">
            Criar conta
          </Link>
        </p>

        <button
          type="button"
          onClick={handleDemo}
          className="mt-3 w-full text-center text-sm font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Entrar como demo
        </button>
      </div>
    </div>
  )
}
