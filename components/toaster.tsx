'use client'

import { Toast } from '@base-ui/react/toast'
import { Check, AlertTriangle, Info, X } from 'lucide-react'
import { toastManager, type ToastType } from '@/lib/toast'
import { cn } from '@/lib/utils'

// Toast no padrão "notificação" da marca: cartão verde-profundo com o selo
// à esquerda — lima com check no sucesso, coral no erro.
const typeStyles: Record<ToastType, string> = {
  success: '[&_[data-slot=toast-icon]]:bg-primary [&_[data-slot=toast-icon]]:text-primary-foreground',
  error: '[&_[data-slot=toast-icon]]:bg-danger [&_[data-slot=toast-icon]]:text-danger-foreground',
  info: '[&_[data-slot=toast-icon]]:bg-white/10 [&_[data-slot=toast-icon]]:text-primary',
}

const typeIcons: Record<ToastType, React.ReactNode> = {
  success: <Check className="size-5" strokeWidth={3} />,
  error: <AlertTriangle className="size-4" />,
  info: <Info className="size-4" />,
}

function ToastList() {
  const { toasts } = Toast.useToastManager()
  return toasts.map((t) => (
    <Toast.Root
      key={t.id}
      toast={t}
      className={cn(
        'absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] w-[min(23rem,calc(100vw-2rem))] rounded-2xl bg-deep px-3 py-3 text-deep-foreground shadow-xl shadow-black/20',
        'transition-all duration-300 [transform:translateY(calc(var(--toast-offset-y)*-1))]',
        'data-[starting-style]:translate-y-4 data-[starting-style]:opacity-0',
        'data-[ending-style]:translate-y-2 data-[ending-style]:opacity-0',
        typeStyles[(t.type as ToastType) ?? 'info'],
      )}
    >
      <div className="flex items-center gap-3">
        <span data-slot="toast-icon" className="grid size-9 shrink-0 place-items-center rounded-lg">
          {typeIcons[(t.type as ToastType) ?? 'info']}
        </span>
        <div className="min-w-0 flex-1">
          {t.title && <Toast.Title className="text-sm font-semibold text-deep-foreground">{t.title}</Toast.Title>}
          {t.description && (
            <Toast.Description className="mt-0.5 text-xs text-deep-muted">
              {t.description}
            </Toast.Description>
          )}
        </div>
        <Toast.Close
          aria-label="Fechar"
          className="shrink-0 self-start rounded-md p-0.5 text-deep-muted hover:bg-white/10 hover:text-deep-foreground"
        >
          <X className="size-3.5" />
        </Toast.Close>
      </div>
    </Toast.Root>
  ))
}

/** Toasts globais — montado uma vez no layout raiz. */
export function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager}>
      <Toast.Portal>
        <Toast.Viewport className="fixed bottom-4 right-4 z-50 flex h-0 w-[min(23rem,calc(100vw-2rem))] flex-col items-end sm:bottom-6 sm:right-6">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}
