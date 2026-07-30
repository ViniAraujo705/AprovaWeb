'use client'

import { Toast } from '@base-ui/react/toast'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { toastManager, type ToastType } from '@/lib/toast'
import { cn } from '@/lib/utils'

const typeStyles: Record<ToastType, string> = {
  success: 'border-emerald-500/30 [&_[data-slot=toast-icon]]:text-emerald-400',
  error: 'border-destructive/40 [&_[data-slot=toast-icon]]:text-destructive',
  info: 'border-primary/30 [&_[data-slot=toast-icon]]:text-primary',
}

const typeIcons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="size-4" />,
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
        'absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] w-[min(23rem,calc(100vw-2rem))] rounded-xl border bg-card px-4 py-3 shadow-lg',
        'transition-all duration-300 [transform:translateY(calc(var(--toast-offset-y)*-1))]',
        'data-[starting-style]:translate-y-4 data-[starting-style]:opacity-0',
        'data-[ending-style]:translate-y-2 data-[ending-style]:opacity-0',
        typeStyles[(t.type as ToastType) ?? 'info'],
      )}
    >
      <div className="flex items-start gap-2.5">
        <span data-slot="toast-icon" className="mt-0.5 shrink-0">
          {typeIcons[(t.type as ToastType) ?? 'info']}
        </span>
        <div className="min-w-0 flex-1">
          {t.title && <Toast.Title className="text-sm font-medium text-foreground">{t.title}</Toast.Title>}
          {t.description && (
            <Toast.Description className="mt-0.5 text-xs text-muted-foreground">
              {t.description}
            </Toast.Description>
          )}
        </div>
        <Toast.Close
          aria-label="Fechar"
          className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
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
