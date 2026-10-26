'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, Mail, Check } from 'lucide-react'
import { authService } from '@/lib/services'
import { ThemeToggle } from '@/components/theme-toggle'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { CheckLogo } from '@/components/page-header'
import { AuthLayout } from '@/components/auth-layout'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function ForgotPasswordView() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  function validate() {
    if (!email.trim()) {
      setError('Informe seu e-mail.')
      return false
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError('E-mail inválido.')
      return false
    }
    setError(null)
    return true
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!validate()) return
    setSubmitting(true)
    try {
      await authService.forgotPassword(email.trim())
      setSent(true)
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message)
      } else {
        setFormError('Não foi possível enviar o e-mail. Tente novamente.')
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

        <h1 className="mt-8 text-center font-display text-4xl lg:mt-0 lg:text-left">
          Esqueci minha senha
        </h1>
        <p className="mt-1 text-center text-sm text-muted-foreground lg:text-left">
          Informe seu e-mail e enviaremos um link para redefinir sua senha.
        </p>

        {sent ? (
          <p className="mt-8 flex items-center justify-center gap-1.5 rounded-lg border border-success-soft bg-success-soft px-3 py-2 text-center text-sm font-medium text-emerald-400">
            <Check className="size-4 shrink-0" /> Enviamos um link de redefinição para o seu
            e-mail.
          </p>
        ) : (
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
                  aria-invalid={!!error}
                  placeholder="voce@agencia.com"
                  className={cn(
                    'min-h-12 w-full rounded-xl border bg-card pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary-ink',
                    error ? 'border-destructive' : 'border-border',
                  )}
                />
              </div>
              {error && <span className="text-xs text-destructive">{error}</span>}
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
                  <Loader2 className="size-5 animate-spin" /> Enviando…
                </>
              ) : (
                'Enviar link'
              )}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Lembrou a senha?{' '}
          <Link href="/login" className="font-medium text-foreground underline">
            Entrar
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
