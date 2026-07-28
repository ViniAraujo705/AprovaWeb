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
  options: { enabled?: boolean } = {},
): QueryState<T> {
  const { enabled = true } = options
  const [data, setDataState] = useState<T | null>(null)
  const [loading, setLoading] = useState<boolean>(enabled)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

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
        if (!controller.signal.aborted) setDataState(result)
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

  const refetch = useCallback(() => setTick((t) => t + 1), [])
  const setData = useCallback((updater: T | ((prev: T | null) => T)) => {
    setDataState((prev) =>
      typeof updater === 'function' ? (updater as (p: T | null) => T)(prev) : updater,
    )
  }, [])

  return { data, loading, error, refetch, setData }
}
