'use client'

/**
 * Contexto de autenticação do profissional de marketing.
 * Mantém o usuário logado, expõe login/logout e o estado de carregamento
 * inicial (enquanto lê a sessão do localStorage).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  clearSession,
  getStoredUser,
  getToken,
  isTokenExpired,
  setSession,
} from '@/lib/auth'
import { authService } from '@/lib/services'
import { DEMO_TOKEN, clearDemoFlag, demoUser, enableDemoFlag } from '@/lib/demo'
import type { LoginResult, User } from '@/lib/types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  isAuthenticated: boolean
  /** Pode devolver `requiresAccountSelection` — ver `completeAccountSelection`. */
  login: (email: string, password: string) => Promise<LoginResult>
  register: (name: string, email: string, password: string) => Promise<User>
  /** Termina o login após um passo de seleção de conta (`pendingToken` do `login`). */
  completeAccountSelection: (pendingToken: string, accountId: string) => Promise<User>
  /** Troca a conta ativa de uma sessão já logada (dropdown "trocar de agência"). */
  switchAccount: (accountId: string) => Promise<User>
  /** Aplica uma sessão já emitida por outro fluxo (ex.: aceite de convite). */
  applySession: (token: string, sessionUser: User) => void
  loginDemo: () => void
  logout: () => void
  /** Atualiza campos do usuário logado em memória + sessão (após editar o perfil). */
  updateUser: (patch: Partial<User>) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Hidrata a sessão a partir do armazenamento local no primeiro render.
  useEffect(() => {
    const token = getToken()
    if (!token || isTokenExpired(token)) {
      clearSession()
      setUser(null)
      setLoading(false)
      return
    }
    setUser(getStoredUser())
    setLoading(false)
  }, [])

  const applySession = useCallback((token: string, sessionUser: User) => {
    clearDemoFlag() // um login real desliga o modo demo
    setSession(token, sessionUser)
    setUser(sessionUser)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await authService.login(email, password)
    if (!result.requiresAccountSelection) applySession(result.token, result.user)
    return result
  }, [applySession])

  const completeAccountSelection = useCallback(
    async (pendingToken: string, accountId: string) => {
      const { token, user: loggedUser } = await authService.selectAccount(accountId, pendingToken)
      applySession(token, loggedUser)
      return loggedUser
    },
    [applySession],
  )

  const switchAccount = useCallback(async (accountId: string) => {
    const { token, user: nextUser } = await authService.selectAccount(accountId)
    setSession(token, nextUser)
    setUser(nextUser)
    return nextUser
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const { token, user: newUser } = await authService.register({ name, email, password })
    applySession(token, newUser)
    return newUser
  }, [applySession])

  const loginDemo = useCallback(() => {
    enableDemoFlag()
    setSession(DEMO_TOKEN, demoUser)
    setUser(demoUser)
  }, [])

  const logout = useCallback(() => {
    clearSession()
    clearDemoFlag()
    setUser(null)
    if (typeof window !== 'undefined') window.location.href = '/login'
  }, [])

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      const token = getToken()
      if (token) setSession(token, next)
      return next
    })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      login,
      register,
      completeAccountSelection,
      switchAccount,
      applySession,
      loginDemo,
      logout,
      updateUser,
    }),
    [
      user,
      loading,
      login,
      register,
      completeAccountSelection,
      switchAccount,
      applySession,
      loginDemo,
      logout,
      updateUser,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
