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
import type { User } from '@/lib/types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<User>
  register: (name: string, email: string, password: string) => Promise<User>
  loginDemo: () => void
  logout: () => void
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

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: loggedUser } = await authService.login(email, password)
    clearDemoFlag() // um login real desliga o modo demo
    setSession(token, loggedUser)
    setUser(loggedUser)
    return loggedUser
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const { token, user: newUser } = await authService.register({ name, email, password })
    clearDemoFlag()
    setSession(token, newUser)
    setUser(newUser)
    return newUser
  }, [])

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

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, isAuthenticated: !!user, login, register, loginDemo, logout }),
    [user, loading, login, register, loginDemo, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
