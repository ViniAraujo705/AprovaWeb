'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * "Adicionar à tela de início" (PWA). Chrome/Edge/Android disparam
 * `beforeinstallprompt` quando o site é instalável (manifest em
 * `app/manifest.ts`) — guardamos o evento e o botão chama `prompt()`: um toque
 * e o Check vira ícone. iPhone/iPad (Safari) não têm essa API: lá só dá pra
 * ensinar o caminho Compartilhar → Adicionar à Tela de Início.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallPlatform = 'prompt' | 'ios' | 'manual'

export function useInstallApp() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [platform, setPlatform] = useState<InstallPlatform>('manual')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent
    const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    setIsMobile(ios || /Android|Mobile/i.test(ua))
    if (ios) setPlatform('ios')
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone) setInstalled(true)

    // Evento que chegou antes desta tela montar (capturado em app/layout.tsx).
    const early = (window as Window & { __checkInstallPrompt?: BeforeInstallPromptEvent }).__checkInstallPrompt
    if (early) {
      setDeferred(early)
      setPlatform('prompt')
    }

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setPlatform('prompt')
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!deferred) return false
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    setDeferred(null)
    ;(window as Window & { __checkInstallPrompt?: unknown }).__checkInstallPrompt = undefined
    if (outcome === 'accepted') setInstalled(true)
    return outcome === 'accepted'
  }, [deferred])

  return { platform, installed, isMobile, install }
}
