'use client'

/**
 * Hook mínimo de data-fetching com estados de loading/erro e refetch.
 * Evita adicionar dependências (SWR/React Query) num MVP.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/lib/api'

interface QueryState<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
  setData: (updater: T | ((prev: T | null) => T)) => void
}

export function useQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[] = [],
  options: { enabled?: boolean; refetchOnFocus?: boolean; staleAfterMs?: number } = {},
): QueryState<T> {
  const { enabled = true, refetchOnFocus = false, staleAfterMs = 30_000 } = options
  const [data, setDataState] = useState<T | null>(null)
  const [loading, setLoading] = useState<boolean>(enabled)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const lastFetchedAtRef = useRef(0)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setDataState(result)
          lastFetchedAtRef.current = Date.now()
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof ApiError ? err.message : 'Erro ao carregar os dados.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, enabled, ...deps])

  /**
   * Rebusca quando a aba volta ao foco. Sem isto, uma tela aberta e deixada de
   * lado (aba em segundo plano no celular, app na bandeja) segue mostrando o
   * que foi buscado no mount — por horas ou dias — e o usuário não vê o que a
   * equipe criou nesse meio tempo. `staleAfterMs` evita refetch a cada
   * alt-tab: só rebusca se os dados já tiverem uma idade mínima.
   *
   * Opt-in porque várias telas fazem atualização local otimista via `setData`
   * (comentários, edições em linha) e um refetch inesperado atropelaria isso.
   */
  useEffect(() => {
    if (!enabled || !refetchOnFocus) return
    function maybeRefetch() {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastFetchedAtRef.current < staleAfterMs) return
      setTick((t) => t + 1)
    }
    document.addEventListener('visibilitychange', maybeRefetch)
    window.addEventListener('focus', maybeRefetch)
    return () => {
      document.removeEventListener('visibilitychange', maybeRefetch)
      window.removeEventListener('focus', maybeRefetch)
    }
  }, [enabled, refetchOnFocus, staleAfterMs])

  const refetch = useCallback(() => setTick((t) => t + 1), [])
  const setData = useCallback((updater: T | ((prev: T | null) => T)) => {
    setDataState((prev) =>
      typeof updater === 'function' ? (updater as (p: T | null) => T)(prev) : updater,
    )
  }, [])

  return { data, loading, error, refetch, setData }
}
