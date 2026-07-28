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
} from 'lucide-react'
import { userService } from '@/lib/services'
import type { User } from '@/lib/types'
import { ApiError } from '@/lib/api'
import { validateImageFile, uploadToPresignedUrl, UploadError } from '@/lib/upload'
import { isDemo } from '@/lib/demo'
import { cn } from '@/lib/utils'
import { useAuth } from '@/components/auth-provider'
import { FadeIn, AnimatePresence, motion } from '@/components/motion'

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
        Personalize a marca que seus clientes veem nos links de aprovação.
      </p>

      {user && (
        <div className="mt-8">
          <BrandingForm user={user} />
        </div>
      )}
    </div>
  )
}

function BrandingForm({ user }: { user: User }) {
  const inputRef = useRef<HTMLInputElement>(null)

  const [logoUrl, setLogoUrl] = useState<string | null>(user.branding?.logoUrl ?? null)
  const [agencyName, setAgencyName] = useState(user.branding?.agencyName ?? '')
  const [dragging, setDragging] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function flashSaved() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleFile(file: File | undefined | null) {
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
      flashSaved()
    } catch (err) {
      if (err instanceof UploadError || err instanceof ApiError) setError(err.message)
      else setError('Falha ao enviar o logo. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function saveName() {
    setError(null)
    setBusy(true)
    try {
      if (isDemo()) {
        flashSaved()
        return
      }
      await userService.updateBranding({ agencyName: agencyName.trim() || null, logoUrl })
      flashSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function removeLogo() {
    setError(null)
    setBusy(true)
    try {
      if (!isDemo()) await userService.updateBranding({ logoUrl: null })
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
          Logo da agência
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Aparece no topo da tela de aprovação do cliente. PNG, JPG, SVG ou WEBP até 2MB.
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
              <span className="text-xs text-muted-foreground">Logo padrão (APROVA)</span>
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
            if (!busy) setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            if (!busy) handleFile(e.dataTransfer.files?.[0])
          }}
          onClick={() => !busy && inputRef.current?.click()}
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
          <div className="flex gap-2">
            <input
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              placeholder="Ex: Estúdio Aurora"
              className="min-h-11 flex-1 rounded-lg border border-border bg-secondary px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            <button
              type="button"
              onClick={saveName}
              disabled={busy}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              Salvar
            </button>
          </div>
        </label>

        {error && (
          <p className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" /> {error}
          </p>
        )}

        {/* Confirmação */}
        <AnimatePresence>
          {saved && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
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
