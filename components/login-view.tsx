'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Loader2,
  Mail,
  Lock,
  Check,
  Eye,
  EyeOff,
  Building2,
  ChevronRight,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  DoorOpen,
  X,
} from 'lucide-react'
import { useAuth } from '@/components/auth-provider'
import { ThemeToggle } from '@/components/theme-toggle'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { teamRoleLabel, type AccountOption } from '@/lib/types'
import { CheckLogo } from '@/components/page-header'
import { AuthLayout } from '@/components/auth-layout'
import { Gesture } from '@/components/gestures'
import { AnimatePresence, motion } from '@/components/motion'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Passo intermediário quando o e-mail tem 2+ agências vinculadas. */
function AccountPicker({
  pendingToken,
  accounts,
  onDone,
}: {
  pendingToken: string
  accounts: AccountOption[]
  onDone: () => void
}) {
  const { completeAccountSelection } = useAuth()
  const [selecting, setSelecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function pick(accountId: string) {
    setError(null)
    setSelecting(accountId)
    try {
      await completeAccountSelection(pendingToken, accountId)
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar. Tente novamente.')
      setSelecting(null)
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex items-center justify-center lg:hidden">
        <CheckLogo className="h-10 w-[164px]" priority />
      </div>

      <h1 className="mt-8 text-center font-display text-4xl lg:mt-0 lg:text-left">Qual agência?</h1>
      <p className="mt-1 text-center text-sm text-muted-foreground lg:text-left">
        Seu e-mail está vinculado a mais de uma agência. Escolha em qual entrar.
      </p>

      <div className="mt-8 flex flex-col gap-2">
        {accounts.map((acc) => (
          <button
            key={acc.accountId}
            type="button"
            disabled={selecting !== null}
            onClick={() => pick(acc.accountId)}
            className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-4 text-left transition-colors hover:border-primary-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Building2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {acc.nomeAgencia}
              </span>
              <span className="block text-xs text-muted-foreground">{teamRoleLabel[acc.role]}</span>
            </span>
            {selecting === acc.accountId ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            )}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-danger-border bg-danger-soft px-3 py-2.5 text-sm text-danger-ink">
          {error}
        </p>
      )}
    </div>
  )
}

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
  const [accountSelection, setAccountSelection] = useState<{
    pendingToken: string
    accounts: AccountOption[]
  } | null>(null)

  // Vindo da tela de aceitar convite: acesso criado com sucesso.
  const justInvited = params.get('invited') === '1'
  // Vindo da tela de redefinir senha: senha alterada com sucesso.
  const justReset = params.get('reset') === '1'

  const [confirmDemo, setConfirmDemo] = useState(false)

  function handleDemo() {
    setConfirmDemo(false)
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
      const result = await login(email.trim(), password)
      if (result.requiresAccountSelection) {
        setAccountSelection({ pendingToken: result.pendingToken, accounts: result.accounts })
        return
      }
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

  if (accountSelection) {
    return (
      <AuthLayout>
        <AccountPicker
          pendingToken={accountSelection.pendingToken}
          accounts={accountSelection.accounts}
          onDone={() => {
            const redirect = params.get('redirect')
            router.replace(redirect && redirect.startsWith('/') ? redirect : '/dashboard')
          }}
        />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center lg:hidden">
          <CheckLogo className="h-10 w-[164px]" priority />
        </div>

        <h1 className="mt-8 text-center font-display text-4xl lg:mt-0 lg:text-left">Entrar</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground lg:text-left">
          Acesse o painel para enviar e acompanhar seus vídeos.
        </p>

        {justInvited && (
          <p className="mt-6 flex items-center justify-center gap-1.5 rounded-xl bg-success-soft px-3 py-2.5 text-sm font-medium text-success-ink">
            <Check className="size-4" /> Acesso criado! Entre com seu e-mail e senha.
          </p>
        )}

        {justReset && (
          <p className="mt-6 flex items-center justify-center gap-1.5 rounded-xl bg-success-soft px-3 py-2.5 text-sm font-medium text-success-ink">
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
                  'min-h-12 w-full rounded-xl border bg-card pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary-ink',
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
            <Link
              href="/esqueci-senha"
              className="self-end text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Esqueci minha senha
            </Link>
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
                <Loader2 className="size-5 animate-spin" /> Entrando…
              </>
            ) : (
              'Entrar'
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
          onClick={() => setConfirmDemo(true)}
          className="mt-3 w-full text-center text-sm font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Ver demonstração (dados fictícios)
        </button>
      </div>

      <AnimatePresence>
        {confirmDemo && <DemoConfirmDialog onConfirm={handleDemo} onCancel={() => setConfirmDemo(false)} />}
      </AnimatePresence>
    </AuthLayout>
  )
}

/** Confirmação antes de entrar no modo demo — evita que um clique acidental pareça login na conta de outra pessoa. */
function DemoConfirmDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const points = [
    { icon: Sparkles, title: 'Dados 100% fictícios', text: 'Clientes, vídeos e equipe foram inventados para o tour.' },
    { icon: ShieldCheck, title: 'Nada é salvo', text: 'Mexa à vontade: nenhuma alteração sai do seu navegador.' },
    { icon: DoorOpen, title: 'Saia quando quiser', text: 'Uma faixa no topo mostra que é demo e leva de volta ao login.' },
  ]

  return (
    <div className="fixed inset-0 z-50 grid place-items-end p-0 sm:place-items-center sm:p-4">
      <motion.div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-confirm-title"
        className="relative w-full overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:max-w-md sm:rounded-3xl"
        initial={{ y: 24, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 24, opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Topo em verde profundo, com o gesto da marca */}
        <div className="relative overflow-hidden bg-deep px-6 pb-6 pt-6 text-deep-foreground">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-primary/20 blur-3xl"
          />
          <button
            type="button"
            onClick={onCancel}
            aria-label="Fechar"
            className="absolute right-3 top-3 grid size-9 place-items-center rounded-full text-deep-muted transition hover:bg-white/10 hover:text-deep-foreground"
          >
            <X className="size-4" />
          </button>
          <div className="relative flex items-end justify-between gap-4">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground">
                <span className="size-1.5 rounded-full bg-primary-foreground/70" />
                Modo demonstração
              </span>
              <h2 id="demo-confirm-title" className="mt-4 font-display text-2xl font-bold leading-tight">
                Conheça o Check
                <br />
                por dentro
              </h2>
            </div>
            <Gesture state="check" onDeep className="-mb-2 h-24 w-24 shrink-0" />
          </div>
        </div>

        <div className="px-6 pb-6 pt-5">
          <p className="text-sm text-muted-foreground">
            Você vai entrar numa <strong className="font-semibold text-foreground">conta de exemplo</strong>. Ela não
            pertence a ninguém.
          </p>

          <ul className="mt-5 space-y-3">
            {points.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-foreground ring-1 ring-border">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-sm font-semibold text-foreground">{title}</p>
                  <p className="text-[13px] leading-snug text-muted-foreground">{text}</p>
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="group mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground transition hover:brightness-95 active:scale-[0.99]"
          >
            Começar o tour
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="mt-2 w-full rounded-2xl px-4 py-3 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            Agora não
          </button>
        </div>
      </motion.div>
    </div>
  )
}
