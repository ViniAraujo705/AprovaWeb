import { Toast } from '@base-ui/react/toast'

export type ToastType = 'success' | 'error' | 'info'

/** Manager global — pode ser chamado de qualquer lugar (fora de componentes). */
export const toastManager = Toast.createToastManager()

function show(type: ToastType, title: string, description?: string) {
  toastManager.add({ type, title, description })
}

export const toast = {
  success: (title: string, description?: string) => show('success', title, description),
  error: (title: string, description?: string) => show('error', title, description),
  info: (title: string, description?: string) => show('info', title, description),
}
