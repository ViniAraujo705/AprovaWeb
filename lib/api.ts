/**
 * Cliente HTTP central.
 *
 * - Prefixa a URL base da API.
 * - Injeta o header Authorization (Bearer) quando há sessão.
 * - Padroniza o parsing de JSON e o tratamento de erro (ApiError).
 * - Em 401 numa requisição autenticada, limpa a sessão e redireciona ao login.
 */
import { API_URL } from '@/lib/config'
import { clearSession, getToken } from '@/lib/auth'

export class ApiError extends Error {
  status: number
  data: unknown

  constructor(message: string, status: number, data?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

type Json = Record<string, unknown> | unknown[]

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  /** Corpo JSON (será serializado). Use `rawBody` para FormData/etc. */
  body?: Json
  /** Corpo cru (FormData, Blob…) — não serializado. */
  rawBody?: BodyInit
  /** Envia o header Authorization. Default: true. */
  auth?: boolean
  /** Query params. */
  query?: Record<string, string | number | boolean | undefined | null>
  signal?: AbortSignal
  headers?: Record<string, string>
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(
    path.startsWith('http') ? path : `${API_URL}/api${path.startsWith('/') ? '' : '/'}${path}`,
  )
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }
  }
  return url.toString()
}

/** Redireciona ao login quando a sessão expira (só no client). */
function handleUnauthorized() {
  clearSession()
  if (typeof window !== 'undefined') {
    const { pathname, search } = window.location
    // Evita loop se já estiver no login e preserva o destino pretendido.
    if (!pathname.startsWith('/login')) {
      const redirect = encodeURIComponent(pathname + search)
      window.location.href = `/login?redirect=${redirect}`
    }
  }
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, rawBody, auth = true, query, signal, headers = {} } = options

  const finalHeaders: Record<string, string> = { Accept: 'application/json', ...headers }

  if (auth) {
    const token = getToken()
    if (token) finalHeaders.Authorization = `Bearer ${token}`
  }

  let requestBody: BodyInit | undefined
  if (rawBody !== undefined) {
    requestBody = rawBody
  } else if (body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json'
    requestBody = JSON.stringify(body)
  }

  let res: Response
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers: finalHeaders,
      body: requestBody,
      signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(
      'Não foi possível conectar ao servidor. Verifique sua conexão.',
      0,
    )
  }

  if (res.status === 401 && auth) {
    handleUnauthorized()
    throw new ApiError('Sessão expirada. Faça login novamente.', 401)
  }

  // 204 / corpo vazio
  const text = await res.text()
  const data = text ? safeJsonParse(text) : null

  if (!res.ok) {
    throw new ApiError(extractErrorMessage(data, res.status), res.status, data)
  }

  return data as T
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** Extrai uma mensagem amigável do corpo de erro (padrão NestJS). */
function extractErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    const msg = obj.message ?? obj.error
    if (Array.isArray(msg)) return msg.join(', ')
    if (typeof msg === 'string') return msg
  }
  if (typeof data === 'string' && data.trim()) return data
  const fallback: Record<number, string> = {
    400: 'Requisição inválida.',
    403: 'Você não tem permissão para essa ação.',
    404: 'Recurso não encontrado.',
    409: 'Conflito com o estado atual.',
    429: 'Muitas tentativas. Aguarde um momento e tente novamente.',
    500: 'Erro interno do servidor. Tente novamente.',
  }
  return fallback[status] ?? `Erro inesperado (${status}).`
}

export const api = {
  get: <T = unknown>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...opts, method: 'GET' }),
  post: <T = unknown>(path: string, body?: Json, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...opts, method: 'POST', body }),
  patch: <T = unknown>(path: string, body?: Json, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...opts, method: 'PATCH', body }),
  put: <T = unknown>(path: string, body?: Json, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...opts, method: 'PUT', body }),
  delete: <T = unknown>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...opts, method: 'DELETE' }),
}
