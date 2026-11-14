'use client'

import { useEffect, useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { clearSession } from '@/lib/auth'
import { clearDemoFlag, isDemo } from '@/lib/demo'

/**
 * Faixa fixa exibida em todas as telas autenticadas enquanto o modo demo está
 * ativo — deixa claro que os dados são fictícios (sem ela, quem entrava sem
 * querer achava que tinha caído na conta de outra agência).
 */
export function DemoBanner() {
  const [demo, setDemo] = useState(false)

  // isDemo() lê localStorage: só depois de montar, para não divergir do SSR.
  useEffect(() => setDemo(isDemo()), [])

  if (!demo) return null

  function exitDemo(to: '/login' | '/register') {
    clearSession()
    clearDemoFlag()
    window.location.href = to
  }

  return (
    <div
      role="status"
      className="z-30 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-warning-border bg-warning-soft px-4 py-2.5 text-sm text-warning-ink sm:px-6 lg:sticky lg:top-0 lg:px-10 print:hidden"
    >
      <p className="flex min-w-0 items-center gap-2">
        <FlaskConical className="size-4 shrink-0" aria-hidden="true" />
        <span>
          Você está numa <strong className="font-semibold">demonstração</strong> com dados fictícios. Nada aqui é
          salvo.
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => exitDemo('/register')}
          className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90"
        >
          Criar minha conta
        </button>
        <button
          type="button"
          onClick={() => exitDemo('/login')}
          className="rounded-lg border border-warning-border px-3 py-1.5 text-xs font-semibold hover:bg-background/60"
        >
          Sair da demo
        </button>
      </div>
    </div>
  )
}
