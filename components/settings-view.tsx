'use client'

/**
 * Telas de Configurações › Minha conta e › Agência › Marca:
 *  - /configuracoes               → ProfileSettings (foto, nome, e-mail)
 *  - /configuracoes/seguranca     → SecuritySettings (senha, sessões)
 *  - /configuracoes/notificacoes  → NotificationSettings (o que vai por e-mail)
 *  - /configuracoes/marca         → BrandSettings (logo, nome, cor; só owner)
 * Layout comum em `settings-ui.tsx`.
 */

import Image from 'next/image'
import { useRef, useState } from 'react'
import { ImagePlus, Loader2, Check, AlertTriangle, Trash2, Camera, Mail, Lock, Star, Moon, Sun } from 'lucide-react'
import { authService, notificationService, sessionService, userService } from '@/lib/services'
import type { NotificationPreferences, NotificationType, Session, User } from '@/lib/types'
import { IMMEDIATE_EMAIL_TYPES, NOTIFICATION_TYPE_NAME } from '@/lib/notification-format'
import { ApiError } from '@/lib/api'
import { validateImageFile, validateImageBeforeCrop, uploadToPresignedUrl, UploadError, resolveContentType } from '@/lib/upload'
import { isDemo } from '@/lib/demo'
import { cn } from '@/lib/utils'
import { brandAccentStyle } from '@/lib/theme'
import { useAuth } from '@/components/auth-provider'
import { toast } from '@/lib/toast'
import { useQuery } from '@/lib/use-query'
import { ErrorState, Skeleton } from '@/components/states'
import { SessionRow, RevokeAllSessionsButton } from '@/components/session-row'
import { usePlanLimit } from '@/components/plan-limit-provider'
import { ImageCropModal } from '@/components/image-crop-modal'
import {
  SaveFooter,
  SettingsCard,
  SettingsPage,
  SettingsRow,
  Switch,
  settingsInputClass,
} from '@/components/settings-ui'

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

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="mt-4 flex items-center gap-2 rounded-[10px] border border-danger-border bg-danger-soft px-3 py-2 text-sm text-destructive">
      <AlertTriangle className="size-4 shrink-0" /> {message}
    </p>
  )
}

const TEAM_ROLE_LABEL: Record<User['teamRole'], string> = { owner: 'Dono da conta', editor: 'Editor' }

/* -------------------------------------------------------------------------- */
/*                                   Perfil                                   */
/* -------------------------------------------------------------------------- */

export function ProfileSettings() {
  // O usuário logado já está em memória (sessão) — não há `GET /users/me` no
  // backend para "recarregar" o perfil, então usamos direto o que veio do login.
  const { user } = useAuth()
  return (
    <SettingsPage title="Perfil" description="Como você aparece para o resto da equipe nos comentários, cards e menções.">
      {user && (
        <>
          <PhotoCard user={user} />
          <IdentityCard user={user} />
        </>
      )}
    </SettingsPage>
  )
}

function PhotoCard({ user }: { user: User }) {
  const { updateUser } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(user.photoUrl)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cropFile, setCropFile] = useState<File | null>(null)

  /** Valida e abre o recorte antes de subir — SVG não passa por canvas (perderia a nitidez vetorial). */
  function onFileSelected(file: File | undefined | null) {
    if (!file) return
    const invalid = validateImageBeforeCrop(file)
    if (invalid) {
      setError(invalid)
      return
    }
    setError(null)
    if (file.type === 'image/svg+xml') {
      void upload(file)
      return
    }
    setCropFile(file)
  }

  async function upload(file: File) {
    const invalid = validateImageFile(file)
    if (invalid) {
      setError(invalid)
      return
    }
    setError(null)
    setBusy(true)
    try {
      if (isDemo()) {
        const dataUrl = await readAsDataUrl(file)
        setPhotoUrl(dataUrl)
        updateUser({ photoUrl: dataUrl })
        toast.success('Foto atualizada')
        return
      }
      const presigned = await userService.getProfileUploadUrl({
        fileName: file.name,
        contentType: resolveContentType(file),
      })
      if (!presigned.uploadUrl) throw new UploadError('Servidor não retornou URL de upload.')
      await uploadToPresignedUrl({ url: presigned.uploadUrl, file, headers: presigned.headers })
      const updated = await userService.updateProfile({ photoUrl: presigned.publicUrl })
      setPhotoUrl(updated.photoUrl)
      updateUser({ photoUrl: updated.photoUrl })
      toast.success('Foto atualizada')
    } catch (err) {
      if (err instanceof UploadError || err instanceof ApiError) setError(err.message)
      else setError('Falha ao enviar a foto. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsCard
      title="Foto"
      description="Clique na foto para trocar. Aparece no seu avatar em todo o Check."
      footer={<p className="text-xs text-muted-foreground">PNG, JPG ou WEBP (até 25 MB, reduzimos no recorte) ou SVG até 2 MB.</p>}
    >
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => !busy && inputRef.current?.click()}
          disabled={busy}
          aria-label="Trocar foto"
          className="group relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-secondary disabled:cursor-not-allowed"
        >
          {photoUrl ? (
            <Image src={photoUrl} alt="" fill className="object-cover" sizes="80px" unoptimized />
          ) : (
            <span className="font-display text-2xl font-bold uppercase text-muted-foreground">
              {(user.name || user.email || '?').slice(0, 1)}
            </span>
          )}
          <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {busy ? <Loader2 className="size-5 animate-spin text-white" /> : <Camera className="size-5 text-white" />}
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="hidden"
          onChange={(e) => {
            onFileSelected(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => !busy && inputRef.current?.click()}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
          >
            <ImagePlus className="size-4" /> {photoUrl ? 'Trocar foto' : 'Enviar foto'}
          </button>
        </div>
      </div>
      <ErrorLine message={error} />
      {cropFile && (
        <ImageCropModal
          file={cropFile}
          aspect={1}
          shape="circle"
          title="Ajustar foto de perfil"
          outputWidth={480}
          outputType="image/jpeg"
          onCancel={() => setCropFile(null)}
          onConfirm={(cropped) => {
            setCropFile(null)
            void upload(cropped)
          }}
        />
      )}
    </SettingsCard>
  )
}

function IdentityCard({ user }: { user: User }) {
  const { updateUser } = useAuth()
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [nameError, setNameError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const dirty = name.trim() !== user.name || email.trim() !== user.email

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmedName = name.trim()
    const trimmedEmail = email.trim()
    const nameErr = trimmedName ? null : 'Informe seu nome.'
    const emailErr = EMAIL_RE.test(trimmedEmail) ? null : 'E-mail inválido.'
    setNameError(nameErr)
    setEmailError(emailErr)
    if (nameErr || emailErr) return
    setBusy(true)
    try {
      if (isDemo()) {
        updateUser({ name: trimmedName, email: trimmedEmail })
      } else {
        const updated = await userService.updateProfile({ name: trimmedName, email: trimmedEmail })
        updateUser({ name: updated.name, email: updated.email })
      }
      toast.success('Perfil atualizado')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsCard
      title="Dados pessoais"
      footer={<SaveFooter form="perfil-dados" dirty={dirty} busy={busy} hint="O e-mail é usado para entrar e receber avisos." />}
    >
      <form id="perfil-dados" onSubmit={save} className="divide-y divide-border">
        <SettingsRow label="Nome" description="Como a equipe te vê e te menciona (@)." htmlFor="perfil-nome">
          <input
            id="perfil-nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!nameError}
            placeholder="Seu nome"
            className={settingsInputClass}
          />
          {nameError && <span className="mt-1 block text-xs text-destructive">{nameError}</span>}
        </SettingsRow>
        <SettingsRow label="E-mail" htmlFor="perfil-email">
          <input
            id="perfil-email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!emailError}
            placeholder="voce@agencia.com"
            className={settingsInputClass}
          />
          {emailError && <span className="mt-1 block text-xs text-destructive">{emailError}</span>}
        </SettingsRow>
        <SettingsRow label="Papel na agência" description="Quem muda é o dono da conta, em Equipe.">
          <span className="inline-flex h-8 items-center rounded-[8px] bg-secondary px-2.5 text-sm font-medium text-foreground">
            {TEAM_ROLE_LABEL[user.teamRole] ?? user.teamRole}
          </span>
        </SettingsRow>
      </form>
      <ErrorLine message={error} />
    </SettingsCard>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Segurança                                 */
/* -------------------------------------------------------------------------- */

export function SecuritySettings() {
  const { user } = useAuth()
  return (
    <SettingsPage title="Segurança" description="Senha de acesso e os aparelhos em que sua conta está aberta.">
      {user && <PasswordCard user={user} />}
      <SessionsCard />
    </SettingsPage>
  )
}

function PasswordCard({ user }: { user: User }) {
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
    <SettingsCard
      title="Senha"
      description={
        <>
          Para trocar, enviamos um link para <strong className="font-medium text-foreground">{user.email}</strong>. A
          senha nova é escolhida pelo link.
        </>
      }
      footer={
        <>
          <p className="text-xs text-muted-foreground">{sent ? 'Link enviado. Ele vale por tempo limitado.' : 'O link chega em até alguns minutos.'}</p>
          <button
            type="button"
            onClick={sendResetEmail}
            disabled={sending || sent}
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : sent ? <Check className="size-4" /> : <Mail className="size-4" />}
            {sent ? 'Link enviado' : 'Enviar link de troca'}
          </button>
        </>
      }
    >
      {error && <ErrorLine message={error} />}
    </SettingsCard>
  )
}

function SessionsCard() {
  const { data, loading, error, refetch, setData } = useQuery<Session[]>((signal) => sessionService.list(signal), [])
  const sessions = data ?? []
  // Sessão atual no topo, depois as mais recentes; quatro bastam para a visão
  // rápida sem esconder a ação de encerrar todas as demais de uma vez.
  const visible = [...sessions]
    .sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1
      const aTime = Date.parse(a.lastActiveAt ?? a.createdAt ?? '') || 0
      const bTime = Date.parse(b.lastActiveAt ?? b.createdAt ?? '') || 0
      return bTime - aTime
    })
    .slice(0, 4)
  const hidden = sessions.length - visible.length
  const others = sessions.filter((s) => !s.current).length

  return (
    <SettingsCard
      title="Sessões ativas"
      description="Aparelhos com a sua conta aberta. Encerre qualquer um que você não reconheça."
      aside={
        !loading && !error && others > 0 ? (
          <RevokeAllSessionsButton
            onRevokeAll={async () => {
              await sessionService.revokeAllOthers()
              setData((prev) => (prev ?? []).filter((s) => s.current))
            }}
          />
        ) : null
      }
      footer={
        hidden > 0 ? (
          <p className="text-xs text-muted-foreground">
            Mostrando as 4 mais recentes. Há mais {hidden} {hidden === 1 ? 'sessão' : 'sessões'}: “Encerrar outras sessões” fecha todas.
          </p>
        ) : undefined
      }
    >
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} className="py-8" />
      ) : (
        <div className="-my-2 divide-y divide-border">
          {visible.map((s) => (
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
    </SettingsCard>
  )
}

/* -------------------------------------------------------------------------- */
/*                                Notificações                                */
/* -------------------------------------------------------------------------- */

/** Tipos agrupados como a agência pensa neles; ordem dentro do grupo = importância. */
const EMAIL_TYPE_GROUPS: { title: string; types: NotificationType[] }[] = [
  { title: 'Cliente', types: ['aprovacao_cliente', 'ajuste_solicitado', 'comentario_cliente', 'avaliacao_cliente', 'aguardando_cliente'] },
  { title: 'Prazos e agenda', types: ['prazo_vencido', 'prazo_proximo', 'lembrete_gravacao'] },
  { title: 'Kanban', types: ['nova_demanda', 'mencao_demanda', 'comentario_demanda'] },
]

/** Lista plana (usada para saber se algum tipo ficou de fora dos grupos). */
export const EMAIL_TYPE_ORDER: NotificationType[] = EMAIL_TYPE_GROUPS.flatMap((g) => g.types)

/**
 * Preferências de e-mail. O sininho e os avisos na tela continuam mostrando
 * tudo; isto só decide o que também vai para a caixa de e-mail. Salva a cada
 * mudança (sem botão "Salvar").
 */
export function NotificationSettings() {
  const { data, loading, error, refetch, setData } = useQuery<NotificationPreferences>(
    (signal) => notificationService.preferences(signal),
    [],
  )

  async function save(patch: Partial<NotificationPreferences>) {
    if (!data) return
    const previous = data
    setData({ ...data, ...patch })
    try {
      setData(await notificationService.updatePreferences(patch))
    } catch (err) {
      setData(previous)
      toast.error('Não foi possível salvar', err instanceof ApiError ? err.message : undefined)
    }
  }

  function setTypes(types: NotificationType[], enabled: boolean) {
    if (!data) return
    const muted = new Set(data.mutedTypes)
    for (const t of types) {
      if (enabled) muted.delete(t)
      else muted.add(t)
    }
    void save({ mutedTypes: [...muted] })
  }

  const anyEmail = !!data && (data.dailyDigest || data.immediate)

  return (
    <SettingsPage
      title="Notificações"
      description="O sininho e os avisos na tela mostram tudo, sempre. Aqui você escolhe o que também chega no seu e-mail."
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-36 w-full rounded-[14px]" />
          <Skeleton className="h-72 w-full rounded-[14px]" />
        </div>
      ) : error || !data ? (
        <ErrorState message={error ?? 'Não foi possível carregar.'} onRetry={refetch} className="py-8" />
      ) : (
        <>
          <SettingsCard title="Quando mandar e-mail" footer={<p className="text-xs text-muted-foreground">As mudanças são salvas na hora.</p>}>
            <div className="divide-y divide-border">
              <SettingsRow label="Resumo diário às 8h" description="Um e-mail por dia com o que você ainda não viu no Check.">
                <div className="flex sm:justify-end">
                  <Switch checked={data.dailyDigest} onChange={(v) => void save({ dailyDigest: v })} label="Resumo diário às 8h" />
                </div>
              </SettingsRow>
              <SettingsRow label="Avisar na hora o que é urgente" description="Aprovação do cliente, prazo vencido e menções chegam no momento em que acontecem.">
                <div className="flex sm:justify-end">
                  <Switch checked={data.immediate} onChange={(v) => void save({ immediate: v })} label="Avisar na hora o que é urgente" />
                </div>
              </SettingsRow>
            </div>
          </SettingsCard>

          <SettingsCard
            title="O que vai por e-mail"
            description={anyEmail ? 'Desligue o que não precisa chegar na sua caixa.' : 'Os dois e-mails acima estão desligados: nada vai para a sua caixa.'}
          >
            <div className={cn('flex flex-col gap-6 transition-opacity', !anyEmail && 'pointer-events-none opacity-50')}>
              {EMAIL_TYPE_GROUPS.map((group) => {
                const allOn = group.types.every((t) => !data.mutedTypes.includes(t))
                return (
                  <div key={group.title}>
                    <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3>
                      <button
                        type="button"
                        disabled={!anyEmail}
                        onClick={() => setTypes(group.types, !allOn)}
                        className="rounded-[6px] px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        {allOn ? 'Desligar todos' : 'Ligar todos'}
                      </button>
                    </div>
                    <ul className="divide-y divide-border">
                      {group.types.map((type) => {
                        const on = !data.mutedTypes.includes(type)
                        return (
                          <li key={type} className="flex items-center justify-between gap-4 py-2.5">
                            <span className="text-sm text-foreground">
                              {NOTIFICATION_TYPE_NAME[type]}
                              {IMMEDIATE_EMAIL_TYPES.includes(type) && data.immediate && (
                                <span className="ml-2 rounded-[4px] bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  na hora
                                </span>
                              )}
                            </span>
                            <Switch checked={on} onChange={(v) => setTypes([type], v)} label={NOTIFICATION_TYPE_NAME[type]} disabled={!anyEmail} />
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          </SettingsCard>
        </>
      )}
    </SettingsPage>
  )
}

/* -------------------------------------------------------------------------- */
/*                                    Marca                                   */
/* -------------------------------------------------------------------------- */

const DEFAULT_ACCENT_COLOR = '#0b0b0d'
/** Secundária padrão (verde escuro do Check); igual a ela = `null` no backend. */
const DEFAULT_SECONDARY_COLOR = '#253326'
const HEX_RE = /^#[0-9a-fA-F]{6}$/
const ACCENT_PRESETS = ['#0b0b0d', '#1f6f4a', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#ca8a04', '#ffffff']

export function BrandSettings() {
  const { user } = useAuth()
  return (
    <SettingsPage
      wide
      title="Marca"
      description="Logo, nome e cor que seus clientes veem nos links de aprovação, galerias e portfólios, e que também aparecem no seu painel."
    >
      {user && <BrandForm user={user} />}
    </SettingsPage>
  )
}

function BrandForm({ user }: { user: User }) {
  const { updateUser } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const savedBranding = user.branding ?? null

  const [logoUrl, setLogoUrl] = useState<string | null>(savedBranding?.logoUrl ?? null)
  const [agencyName, setAgencyName] = useState(savedBranding?.agencyName ?? '')
  const [accentColor, setAccentColor] = useState(savedBranding?.accentColor ?? DEFAULT_ACCENT_COLOR)
  const [secondaryColor, setSecondaryColor] = useState(savedBranding?.secondaryColor ?? DEFAULT_SECONDARY_COLOR)
  const [dragging, setDragging] = useState(false)
  const [busyLogo, setBusyLogo] = useState(false)
  const [busySave, setBusySave] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const { handlePlanLimitError, planStatus, openUpgradeModal } = usePlanLimit()
  // Enquanto o plano ainda não carregou, não bloqueia (o 403 real continua
  // sendo o backstop) — evita prender a UI atrás de um estado de loading.
  const locked = planStatus ? !planStatus.limits.whiteLabel : false
  const validHex = HEX_RE.test(accentColor)
  const validSecondary = HEX_RE.test(secondaryColor)
  const nextAccentOf = () => (accentColor.toLowerCase() === DEFAULT_ACCENT_COLOR ? null : accentColor.toLowerCase())
  const nextSecondaryOf = () => (secondaryColor.toLowerCase() === DEFAULT_SECONDARY_COLOR ? null : secondaryColor.toLowerCase())
  const dirty =
    agencyName.trim() !== (savedBranding?.agencyName ?? '') ||
    nextAccentOf() !== (savedBranding?.accentColor?.toLowerCase() ?? null) ||
    nextSecondaryOf() !== (savedBranding?.secondaryColor?.toLowerCase() ?? null)

  function requireUpgrade() {
    openUpgradeModal('Marca própria (logo e nome da agência sem marca d’água) é exclusiva dos planos pagos.')
  }

  /** Valida e abre o recorte antes de subir — SVG não passa por canvas (perderia a nitidez vetorial). */
  function onFileSelected(file: File | undefined | null) {
    if (locked) return requireUpgrade()
    if (!file) return
    const invalid = validateImageBeforeCrop(file)
    if (invalid) {
      setLogoError(invalid)
      return
    }
    setLogoError(null)
    if (file.type === 'image/svg+xml') {
      void uploadLogo(file)
      return
    }
    setCropFile(file)
  }

  async function uploadLogo(file: File) {
    if (locked) return requireUpgrade()
    const invalid = validateImageFile(file)
    if (invalid) {
      setLogoError(invalid)
      return
    }
    setLogoError(null)
    setBusyLogo(true)
    try {
      if (isDemo()) {
        const dataUrl = await readAsDataUrl(file)
        setLogoUrl(dataUrl)
        updateUser({ branding: { logoUrl: dataUrl, agencyName: savedBranding?.agencyName ?? null, accentColor: savedBranding?.accentColor ?? null, secondaryColor: savedBranding?.secondaryColor ?? null } })
        toast.success('Logo atualizado')
        return
      }
      const presigned = await userService.getBrandingUploadUrl({ fileName: file.name, contentType: resolveContentType(file) })
      if (!presigned.uploadUrl) throw new UploadError('Servidor não retornou URL de upload.')
      await uploadToPresignedUrl({ url: presigned.uploadUrl, file, headers: presigned.headers })
      // Só o logo: nome e cor têm o próprio "Salvar".
      const branding = await userService.updateBranding({ logoUrl: presigned.publicUrl })
      setLogoUrl(branding.logoUrl)
      // Mantém a sessão local coerente com o que acabou de ser salvo.
      updateUser({ branding })
      toast.success('Logo atualizado')
    } catch (err) {
      if (handlePlanLimitError(err)) return
      if (err instanceof UploadError || err instanceof ApiError) setLogoError(err.message)
      else setLogoError('Falha ao enviar o logo. Tente novamente.')
    } finally {
      setBusyLogo(false)
    }
  }

  async function removeLogo() {
    setLogoError(null)
    setBusyLogo(true)
    try {
      if (isDemo()) {
        updateUser({ branding: { logoUrl: null, agencyName: savedBranding?.agencyName ?? null, accentColor: savedBranding?.accentColor ?? null, secondaryColor: savedBranding?.secondaryColor ?? null } })
      } else {
        updateUser({ branding: await userService.updateBranding({ logoUrl: null }) })
      }
      setLogoUrl(null)
      toast.success('Logo removido')
    } catch (err) {
      setLogoError(err instanceof ApiError ? err.message : 'Falha ao remover o logo.')
    } finally {
      setBusyLogo(false)
    }
  }

  async function saveIdentity() {
    if (locked) return requireUpgrade()
    if (!validHex || !validSecondary) {
      setError('Cor inválida. Use o formato #RRGGBB.')
      return
    }
    setError(null)
    setBusySave(true)
    try {
      const nextAccent = nextAccentOf()
      const nextSecondary = nextSecondaryOf()
      if (isDemo()) {
        updateUser({ branding: { logoUrl, agencyName: agencyName.trim() || null, accentColor: nextAccent, secondaryColor: nextSecondary } })
      } else {
        updateUser({
          branding: await userService.updateBranding({
            agencyName: agencyName.trim() || null,
            logoUrl,
            accentColor: nextAccent,
            // Só manda quando mudou (ver `userService.updateBranding`).
            ...(nextSecondary !== (savedBranding?.secondaryColor ?? null) ? { secondaryColor: nextSecondary } : {}),
          }),
        })
      }
      toast.success('Marca salva')
    } catch (err) {
      if (handlePlanLimitError(err)) return
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar. Tente novamente.')
    } finally {
      setBusySave(false)
    }
  }

  const proBadge = locked ? (
    <span className="inline-flex items-center gap-1 rounded-[6px] bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      <Lock className="size-3" /> Pro
    </span>
  ) : null

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="flex min-w-0 flex-col gap-6">
        <SettingsCard
          title="Logo"
          badge={proBadge}
          description="Fica no topo da tela de aprovação do cliente. Use a versão horizontal, com fundo transparente."
          footer={<p className="text-xs text-muted-foreground">PNG, JPG ou WEBP (até 25 MB, reduzimos no recorte) ou SVG até 2 MB. Sem logo, usamos a marca do Check.</p>}
        >
          <div
            onDragOver={(e) => {
              e.preventDefault()
              if (!busyLogo && !locked) setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              if (!busyLogo) onFileSelected(e.dataTransfer.files?.[0])
            }}
            className={cn(
              'flex flex-col items-center gap-4 rounded-[12px] border border-dashed p-5 transition-colors sm:flex-row',
              dragging ? 'border-primary-ink bg-primary/10' : logoError ? 'border-destructive/60' : 'border-border',
            )}
          >
            <div className="grid h-16 w-44 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-border bg-background">
              {logoUrl ? (
                <span className="relative h-12 w-40">
                  <Image src={logoUrl} alt="Logo da agência" fill className="object-contain" sizes="160px" unoptimized />
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Sem logo</span>
              )}
            </div>
            <div className="flex flex-1 flex-col items-center gap-2 text-center sm:items-start sm:text-left">
              <p className="text-sm text-muted-foreground">{busyLogo ? 'Enviando…' : 'Arraste o arquivo aqui ou'}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => (locked ? requireUpgrade() : inputRef.current?.click())}
                  disabled={busyLogo}
                  className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                >
                  {busyLogo ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                  {logoUrl ? 'Trocar logo' : 'Escolher arquivo'}
                </button>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={removeLogo}
                    disabled={busyLogo}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger-ink disabled:opacity-50"
                  >
                    <Trash2 className="size-4" /> Remover
                  </button>
                )}
              </div>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={(e) => {
                onFileSelected(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
          <ErrorLine message={logoError} />
          {cropFile && (
            <ImageCropModal
              file={cropFile}
              aspect={2.4}
              shape="rect"
              title="Ajustar logo"
              outputWidth={800}
              outputType="image/png"
              onCancel={() => setCropFile(null)}
              onConfirm={(cropped) => {
                setCropFile(null)
                void uploadLogo(cropped)
              }}
            />
          )}
        </SettingsCard>

        <SettingsCard
          title="Nome e cores"
          badge={proBadge}
          footer={<SaveFooter dirty={dirty} busy={busySave} onSave={saveIdentity} hint="As cores valem para a tela do cliente, os links públicos e o seu painel." />}
        >
          <div className="divide-y divide-border">
            <SettingsRow label="Nome da agência" description="Aparece junto do logo e nos e-mails ao cliente." htmlFor="marca-nome">
              <input
                id="marca-nome"
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                placeholder="Ex.: Estúdio Aurora"
                maxLength={80}
                className={settingsInputClass}
              />
            </SettingsRow>
            <SettingsRow label="Cor primária" description="Botões, links e destaques. Cores muito claras ou escuras são ajustadas para continuar legíveis.">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {ACCENT_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setAccentColor(c)}
                      aria-label={`Usar a cor ${c}`}
                      title={c === DEFAULT_ACCENT_COLOR ? 'Padrão do Check' : c}
                      className={cn(
                        'size-7 rounded-full border border-border transition-transform hover:scale-110',
                        accentColor.toLowerCase() === c && 'ring-2 ring-foreground ring-offset-2 ring-offset-card',
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={validHex ? accentColor : DEFAULT_ACCENT_COLOR}
                    onChange={(e) => setAccentColor(e.target.value)}
                    aria-label="Escolher outra cor"
                    className="size-10 shrink-0 cursor-pointer rounded-[10px] border border-border bg-card p-1"
                  />
                  <input
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value.trim())}
                    aria-label="Código da cor"
                    aria-invalid={!validHex}
                    maxLength={7}
                    className={cn(settingsInputClass, 'w-28 font-mono uppercase')}
                  />
                  {accentColor !== DEFAULT_ACCENT_COLOR && (
                    <button
                      type="button"
                      onClick={() => setAccentColor(DEFAULT_ACCENT_COLOR)}
                      className="rounded-[8px] px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      Usar padrão
                    </button>
                  )}
                </div>
              </div>
            </SettingsRow>
            <SettingsRow label="Cor secundária" description="Selos, painéis escuros, gráficos e itens selecionados.">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={validSecondary ? secondaryColor : DEFAULT_SECONDARY_COLOR}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  aria-label="Escolher a cor secundária"
                  className="size-10 shrink-0 cursor-pointer rounded-[10px] border border-border bg-card p-1"
                />
                <input
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value.trim())}
                  aria-label="Código da cor secundária"
                  aria-invalid={!validSecondary}
                  maxLength={7}
                  className={cn(settingsInputClass, 'w-28 font-mono uppercase')}
                />
                {secondaryColor.toLowerCase() !== DEFAULT_SECONDARY_COLOR && (
                  <button
                    type="button"
                    onClick={() => setSecondaryColor(DEFAULT_SECONDARY_COLOR)}
                    className="rounded-[8px] px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    Usar padrão
                  </button>
                )}
              </div>
            </SettingsRow>
          </div>
          <ErrorLine message={error} />
        </SettingsCard>
      </div>

      <BrandPreview
        logoUrl={logoUrl}
        agencyName={agencyName.trim()}
        accentColor={validHex ? nextAccentOf() : null}
        secondaryColor={validSecondary ? nextSecondaryOf() : null}
      />
    </div>
  )
}

/** Prévia da tela de aprovação, nos dois temas, com a mesma regra de contraste da tela real. */
function BrandPreview({
  logoUrl,
  agencyName,
  accentColor,
  secondaryColor,
}: {
  logoUrl: string | null
  agencyName: string
  accentColor: string | null
  secondaryColor: string | null
}) {
  const [dark, setDark] = useState(false)
  return (
    <aside className="lg:sticky lg:top-6">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prévia do cliente</p>
        <div className="flex rounded-[8px] border border-border p-0.5" role="group" aria-label="Tema da prévia">
          {[
            { v: false, icon: Sun, label: 'Claro' },
            { v: true, icon: Moon, label: 'Escuro' },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => setDark(o.v)}
              aria-pressed={dark === o.v}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-[6px] px-2 text-xs font-medium transition-colors',
                dark === o.v ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <o.icon className="size-3.5" />
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div
        className={cn(dark ? 'dark' : 'theme-light', 'overflow-hidden rounded-[14px] border border-border bg-background text-foreground shadow-sm')}
        style={brandAccentStyle(accentColor, { dark, secondary: secondaryColor })}
        aria-label="Prévia da tela de aprovação"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          {logoUrl ? (
            <span className="relative h-7 w-28">
              <Image src={logoUrl} alt="" fill className="object-contain object-left" sizes="112px" unoptimized />
            </span>
          ) : (
            <span className="font-display text-base font-bold">{agencyName || 'check'}</span>
          )}
          <span className="truncate text-xs text-muted-foreground">{agencyName || 'Sua agência'}</span>
        </div>
        <div className="p-4">
          <div className="aspect-video w-full rounded-[10px] bg-[linear-gradient(135deg,#3a3f3c,#151816)]" />
          <span className="mt-3 inline-flex rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-foreground">Projeto · Campanha</span>
          <p className="mt-2 font-display text-sm font-bold">Reel lançamento · versão 2</p>
          <p className="text-xs text-muted-foreground">Enviado hoje para sua aprovação</p>
          <div className="mt-3 flex items-center gap-1" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={cn('size-4', i < 4 ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <span className="inline-flex h-9 items-center justify-center rounded-[10px] border border-border text-xs font-semibold">Pedir ajuste</span>
            <span className="inline-flex h-9 items-center justify-center gap-1 rounded-[10px] bg-primary text-xs font-semibold text-primary-foreground">
              <Check className="size-3.5" /> Aprovar
            </span>
          </div>
          <p className="mt-3 text-center text-xs">
            <span className="font-medium text-primary-ink underline-offset-2">Ver comentários (3)</span>
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Representação simplificada. Use “Escuro” para conferir o contraste das duas versões.</p>
    </aside>
  )
}
