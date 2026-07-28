/**
 * Gerenciamento da sessão no navegador.
 *
 * Estratégia MVP: token JWT + usuário em localStorage. É simples e suficiente
 * para o MVP. Para produção o ideal é migrar para cookie httpOnly (setado pelo
 * backend) — a superfície de API aqui (getToken/setSession/clearSession) foi
 * mantida pequena justamente para facilitar essa troca depois.
 */
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from '@/lib/config'
import type { User } from '@/lib/types'

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(USER_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

export function setSession(token: string, user: User) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token)
  window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
}

export function clearSession() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(TOKEN_STORAGE_KEY)
  window.localStorage.removeItem(USER_STORAGE_KEY)
}

/**
 * Decodifica o payload de um JWT sem validar assinatura (só para checar
 * expiração no client e evitar chamadas com token vencido).
 */
export function isTokenExpired(token: string | null): boolean {
  if (!token) return true
  try {
    const [, payload] = token.split('.')
    if (!payload) return false // token opaco: deixa o backend decidir
    const json = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { exp?: number }
    if (!json.exp) return false
    return Date.now() >= json.exp * 1000
  } catch {
    return false
  }
}
