'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Play, Loader2, Mail, Check } from 'lucide-react'
import { authService } from '@/lib/services'
import { ThemeToggle } from '@/components/theme-toggle'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

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
      // Sempre trata como sucesso: não revela se o e-mail tem conta ou não.
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

        <h1 className="mt-8 text-center font-display text-4xl tracking-wide">
          ESQUECI MINHA SENHA
        </h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Informe seu e-mail e enviaremos um link para redefinir sua senha.
        </p>

        {sent ? (
          <p className="mt-8 flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center text-sm font-medium text-emerald-400">
            <Check className="size-4 shrink-0" /> Se esse e-mail tiver uma conta, enviamos um link
            de redefinição.
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
                    'min-h-11 w-full rounded-lg border bg-secondary pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary',
                    error ? 'border-destructive' : 'border-border',
                  )}
                />
              </div>
              {error && <span className="text-xs text-destructive">{error}</span>}
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
                  <Loader2 className="size-5 animate-spin" /> ENVIANDO…
                </>
              ) : (
                'ENVIAR LINK'
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
    </div>
  )
}
