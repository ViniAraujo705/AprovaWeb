'use client'

import Image from 'next/image'
import { useRef, useState } from 'react'
import {
  ImagePlus,
  Loader2,
  Check,
  AlertTriangle,
  Trash2,
  Building2,
  Camera,
  Mail,
  Lock,
  Monitor,
} from 'lucide-react'
import { authService, sessionService, userService } from '@/lib/services'
import type { Session, User } from '@/lib/types'
import { ApiError } from '@/lib/api'
import { validateImageFile, uploadToPresignedUrl, UploadError } from '@/lib/upload'
import { isDemo } from '@/lib/demo'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/auth-provider'
import { FadeIn, AnimatePresence, motion } from '@/components/motion'
import { toast } from '@/lib/toast'
import { useQuery } from '@/lib/use-query'
import { ErrorState, Skeleton } from '@/components/states'
import { SessionRow, RevokeAllSessionsButton } from '@/components/session-row'
import { usePlanLimit } from '@/components/plan-limit-provider'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Lê um arquivo como Data URL (usado só no preview/modo demo). */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Falha ao ler a imagem.'))
    reader.readAsDataURL(file)
  })
}

export function SettingsView() {
  // O usuário logado já está em memória (sessão) — não há `GET /users/me` no
  // backend para "recarregar" o perfil, então usamos direto o que veio do login.
  const { user } = useAuth()

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
      <h1 className="font-display text-4xl tracking-wide sm:text-5xl">CONFIGURAÇÕES</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Gerencie seu perfil e a marca que seus clientes veem nos links de aprovação.
      </p>

      {user && (
        <>
          <ProfileForm user={user} />
          <SecurityForm user={user} />
          <SessionsSection />
          {/* Branding é exclusivo do owner — gate inline, não na rota, pois
              editores também acessam esta tela para editar o próprio perfil. */}
          {user.teamRole === 'owner' && <BrandingForm user={user} />}
        </>
      )}
    </div>
  )
}

function ProfileForm({ user }: { user: User }) {
  const { updateUser } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)

  const [photoUrl, setPhotoUrl] = useState<string | null>(user.photoUrl)
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [nameError, setNameError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyPhoto, setBusyPhoto] = useState(false)
  const [busySave, setBusySave] = useState(false)
  const [saved, setSaved] = useState(false)

  function flashSaved() {
    setSaved(true)
    toast.success('Perfil atualizado')
    setTimeout(() => setSaved(false), 2000)
  }

  async function handlePhoto(file: File | undefined | null) {
    if (!file) return
    const invalid = validateImageFile(file)
    if (invalid) {
      setFileError(invalid)
      return
    }
    setFileError(null)
    setError(null)
    setBusyPhoto(true)
    try {
      if (isDemo()) {
        const dataUrl = await readAsDataUrl(file)
        setPhotoUrl(dataUrl)
        updateUser({ photoUrl: dataUrl })
        flashSaved()
        return
      }

      const presigned = await userService.getProfileUploadUrl({
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
      })
      if (!presigned.uploadUrl) throw new UploadError('Servidor não retornou URL de upload.')

      await uploadToPresignedUrl({ url: presigned.uploadUrl, file, headers: presigned.headers })

      const updated = await userService.updateProfile({ photoUrl: presigned.publicUrl })
      setPhotoUrl(updated.photoUrl)
      updateUser({ photoUrl: updated.photoUrl })
      flashSaved()
    } catch (err) {
      if (err instanceof UploadError || err instanceof ApiError) setError(err.message)
      else setError('Falha ao enviar a foto. Tente novamente.')
    } finally {
      setBusyPhoto(false)
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmedName = name.trim()
    const trimmedEmail = email.trim()
    let hasError = false
    if (!trimmedName) {
      setNameError('Informe seu nome.')
      hasError = true
    } else {
      setNameError(null)
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setEmailError('E-mail inválido.')
      hasError = true
    } else {
      setEmailError(null)
    }
    if (hasError) return

    setBusySave(true)
    try {
      if (isDemo()) {
        updateUser({ name: trimmedName, email: trimmedEmail })
        flashSaved()
        return
      }
      const updated = await userService.updateProfile({ name: trimmedName, email: trimmedEmail })
      updateUser({ name: updated.name, email: updated.email })
      flashSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar. Tente novamente.')
    } finally {
      setBusySave(false)
    }
  }

  return (
    <FadeIn className="mt-8" y={6}>
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Camera className="size-4 text-primary" />
          Perfil
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Seu nome, e-mail e foto — visíveis para o resto da sua equipe.
        </p>

        <div className="mt-4 flex items-center gap-4">
          <button
            type="button"
            onClick={() => !busyPhoto && inputRef.current?.click()}
            disabled={busyPhoto}
            className="group relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-secondary disabled:cursor-not-allowed"
          >
            {photoUrl ? (
              <Image src={photoUrl} alt="" fill className="object-cover" sizes="64px" unoptimized />
            ) : (
              <span className="text-lg font-bold uppercase text-muted-foreground">
                {(name || email || '?').slice(0, 1)}
              </span>
            )}
            <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              {busyPhoto ? (
                <Loader2 className="size-5 animate-spin text-white" />
              ) : (
                <Camera className="size-5 text-white" />
              )}
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={(e) => handlePhoto(e.target.files?.[0])}
          />
          <div>
            <button
              type="button"
              onClick={() => !busyPhoto && inputRef.current?.click()}
              disabled={busyPhoto}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
            >
              <ImagePlus className="size-3.5" /> Alterar foto
            </button>
            {fileError && <p className="mt-1.5 text-xs text-destructive">{fileError}</p>}
          </div>
        </div>

        <form onSubmit={saveProfile} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Nome</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!nameError}
              placeholder="Seu nome"
              className={cn(
                'min-h-11 rounded-lg border bg-secondary px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary',
                nameError ? 'border-destructive' : 'border-border',
              )}
            />
            {nameError && <span className="text-xs text-destructive">{nameError}</span>}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">E-mail</span>
            <input
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!emailError}
              placeholder="voce@agencia.com"
              className={cn(
                'min-h-11 rounded-lg border bg-secondary px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary',
                emailError ? 'border-destructive' : 'border-border',
              )}
            />
            {emailError && <span className="text-xs text-destructive">{emailError}</span>}
          </label>

          <button
            type="submit"
            disabled={busySave}
            className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busySave && <Loader2 className="size-3.5 animate-spin" />}
            Salvar
          </button>
        </form>

        {error && (
          <p className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" /> {error}
          </p>
        )}

        <AnimatePresence>
          {saved && (
            <motion.p
              initial={{ y: -4 }}
              animate={{ y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-4 flex items-center gap-1.5 text-sm font-medium text-emerald-400"
            >
              <Check className="size-4" /> Alterações salvas
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </FadeIn>
  )
}

function SecurityForm({ user }: { user: User }) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendResetEmail() {
    setSending(true)
    setError(null)
    try {
      await authService.forgotPassword(user.email)
      setSent(true)
      toast.success('Link enviado', 'Confira sua caixa de entrada.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar o e-mail.')
    } finally {
      setSending(false)
    }
  }

  return (
    <FadeIn className="mt-8" y={6}>
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Lock className="size-4 text-primary" />
          Senha
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Enviamos um link de redefinição para <strong className="text-foreground">{user.email}</strong>{' '}
          — clique nele para escolher uma nova senha.
        </p>

        <button
          type="button"
          onClick={sendResetEmail}
          disabled={sending || sent}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-secondary px-4 text-sm font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
        >
          {sending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : sent ? (
            <Check className="size-3.5" />
          ) : (
            <Mail className="size-3.5" />
          )}
          {sent ? 'Link enviado' : 'Enviar link para trocar a senha'}
        </button>

        {error && (
          <p className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" /> {error}
          </p>
        )}
      </div>
    </FadeIn>
  )
}

function SessionsSection() {
  const { data, loading, error, refetch, setData } = useQuery<Session[]>(
    (signal) => sessionService.list(signal),
    [],
  )
  const sessions = data ?? []
  const otherCount = sessions.filter((s) => !s.current).length

  return (
    <FadeIn className="mt-8" y={6}>
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Monitor className="size-4 text-primary" />
              Sessões ativas
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Dispositivos onde sua conta está logada agora. Encerre remotamente qualquer um deles.
            </p>
          </div>
          {!loading && !error && otherCount > 0 && (
            <RevokeAllSessionsButton
              onRevokeAll={async () => {
                await sessionService.revokeAllOthers()
                setData((prev) => (prev ?? []).filter((s) => s.current))
              }}
            />
          )}
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={refetch} className="py-8" />
          ) : (
            <div className="divide-y divide-border">
              {sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  onRevoke={async (id) => {
                    await sessionService.revoke(id)
                    setData((prev) => (prev ?? []).filter((item) => item.id !== id))
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </FadeIn>
  )
}

const DEFAULT_ACCENT_COLOR = '#0b0b0d'

function BrandingForm({ user }: { user: User }) {
  const { updateUser } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)

  const [logoUrl, setLogoUrl] = useState<string | null>(user.branding?.logoUrl ?? null)
  const [agencyName, setAgencyName] = useState(user.branding?.agencyName ?? '')
  const [accentColor, setAccentColor] = useState(user.branding?.accentColor ?? DEFAULT_ACCENT_COLOR)
  const [dragging, setDragging] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const { handlePlanLimitError, planStatus, openUpgradeModal } = usePlanLimit()
  // Enquanto o plano ainda não carregou, não bloqueia (o 403 real continua
  // sendo o backstop) — evita prender a UI atrás de um estado de loading.
  const locked = planStatus ? !planStatus.limits.whiteLabel : false

  function requireUpgrade() {
    openUpgradeModal(
      'Marca própria (logo e nome da agência sem marca d’água) é exclusiva dos planos pagos.',
    )
  }

  function flashSaved() {
    setSaved(true)
    toast.success('Configuração salva')
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleFile(file: File | undefined | null) {
    if (locked) {
      requireUpgrade()
      return
    }
    if (!file) return
    const invalid = validateImageFile(file)
    if (invalid) {
      setFileError(invalid)
      return
    }
    setFileError(null)
    setError(null)
    setBusy(true)
    try {
      // Modo demo: preview local, sem tocar no backend/R2.
      if (isDemo()) {
        const dataUrl = await readAsDataUrl(file)
        setLogoUrl(dataUrl)
        flashSaved()
        return
      }

      // 1) presigned URL
      const presigned = await userService.getBrandingUploadUrl({
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
      })
      if (!presigned.uploadUrl) throw new UploadError('Servidor não retornou URL de upload.')

      // 2) upload direto pro R2
      await uploadToPresignedUrl({ url: presigned.uploadUrl, file, headers: presigned.headers })

      // 3) salva o branding
      const branding = await userService.updateBranding({
        logoUrl: presigned.publicUrl,
        agencyName: agencyName.trim() || null,
      })
      setLogoUrl(branding.logoUrl)
      // Mantém a sessão local coerente com o que acabou de ser salvo. Sem
      // isso, voltar para esta tela antes de um novo login ainda mostrava o
      // branding anterior, apesar do PATCH já ter persistido o logo.
      updateUser({ branding })
      flashSaved()
    } catch (err) {
      if (handlePlanLimitError(err)) return
      if (err instanceof UploadError || err instanceof ApiError) setError(err.message)
      else setError('Falha ao enviar o logo. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function saveAppearance() {
    if (locked) {
      requireUpgrade()
      return
    }
    setError(null)
    setBusy(true)
    try {
      const nextAccentColor = accentColor === DEFAULT_ACCENT_COLOR ? null : accentColor
      if (isDemo()) {
        updateUser({ branding: { logoUrl, agencyName: agencyName.trim() || null, accentColor: nextAccentColor } })
        flashSaved()
        return
      }
      const branding = await userService.updateBranding({
        agencyName: agencyName.trim() || null,
        logoUrl,
        accentColor: nextAccentColor,
      })
      updateUser({ branding })
      flashSaved()
    } catch (err) {
      if (handlePlanLimitError(err)) return
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function removeLogo() {
    setError(null)
    setBusy(true)
    try {
      if (!isDemo()) {
        const branding = await userService.updateBranding({ logoUrl: null })
        updateUser({ branding })
      } else {
        updateUser({
          branding: {
            logoUrl: null,
            agencyName: user.branding?.agencyName ?? null,
            accentColor: user.branding?.accentColor ?? null,
          },
        })
      }
      setLogoUrl(null)
      flashSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao remover o logo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FadeIn className="mt-8" y={6}>
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Building2 className="size-4 text-primary" />
          Marca da agência
          {locked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              <Lock className="size-3" /> Pro
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Logo (PNG, JPG, SVG ou WEBP até 2MB), nome e cor de destaque — aparecem na tela de
          aprovação do cliente e no seu próprio painel.
        </p>

        {/* Preview atual */}
        <div className="mt-4 flex items-center gap-4">
          <div className="grid h-16 w-40 place-items-center overflow-hidden rounded-lg border border-border bg-secondary">
            {logoUrl ? (
              <span className="relative h-12 w-36">
                <Image
                  src={logoUrl}
                  alt="Logo da agência"
                  fill
                  className="object-contain"
                  sizes="144px"
                  unoptimized
                />
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Logo padrão (CHECK)</span>
            )}
          </div>
          {logoUrl && (
            <button
              type="button"
              onClick={removeLogo}
              disabled={busy}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" /> Remover
            </button>
          )}
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            if (!busy && !locked) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            if (locked) requireUpgrade()
            else if (!busy) handleFile(e.dataTransfer.files?.[0])
          }}
          onClick={() => {
            if (locked) requireUpgrade()
            else if (!busy) inputRef.current?.click()
          }}
          className={cn(
            'mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors',
            busy ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
            fileError
              ? 'border-destructive/60 bg-destructive/5'
              : dragging
                ? 'border-primary bg-primary/10'
                : 'border-primary/50 bg-background hover:border-primary hover:bg-primary/5',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <span className="grid size-12 place-items-center rounded-full bg-primary/15 text-primary">
            {busy ? <Loader2 className="size-6 animate-spin" /> : <ImagePlus className="size-6" />}
          </span>
          <p className="mt-2 text-sm font-medium text-foreground">
            {busy ? 'Enviando…' : 'Arraste um logo ou clique para selecionar'}
          </p>
        </div>
        {fileError && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
            <AlertTriangle className="size-4" /> {fileError}
          </p>
        )}

        {/* Nome da agência */}
        <label className="mt-6 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Nome da agência</span>
          <input
            value={agencyName}
            onChange={(e) => setAgencyName(e.target.value)}
            placeholder="Ex: Estúdio Aurora"
            className="min-h-11 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </label>

        {/* Cor de destaque — substitui a cor primária (botões, links, ícones) em toda a tela de aprovação e no seu próprio painel. */}
        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Cor de destaque</span>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              aria-label="Cor de destaque da agência"
              className="size-11 cursor-pointer rounded-lg border border-border bg-secondary p-1"
            />
            <input
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              placeholder={DEFAULT_ACCENT_COLOR}
              className="min-h-11 w-32 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            {accentColor !== DEFAULT_ACCENT_COLOR && (
              <button
                type="button"
                onClick={() => setAccentColor(DEFAULT_ACCENT_COLOR)}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Usar padrão
              </button>
            )}
          </div>
        </label>

        <button
          type="button"
          onClick={saveAppearance}
          disabled={busy}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          Salvar
        </button>

        {error && (
          <p className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" /> {error}
          </p>
        )}

        {/* Confirmação */}
        <AnimatePresence>
          {saved && (
            <motion.p
              initial={{ y: -4 }}
              animate={{ y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-4 flex items-center gap-1.5 text-sm font-medium text-emerald-400"
            >
              <Check className="size-4" /> Alterações salvas
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </FadeIn>
  )
}
