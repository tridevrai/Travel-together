import { useCallback, useEffect, useRef, useState } from 'react'

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'done'; value: T }
  | { status: 'error'; error: unknown }

/** Runs `load` on mount and whenever `key` changes; `reload` re-runs it. */
export function useAsync<T>(load: () => Promise<T>, key: string) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })
  const [version, setVersion] = useState(0)
  const loadRef = useRef(load)
  // Runs before the effect below, so it always calls the latest `load`.
  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    let cancelled = false
    loadRef.current().then(
      (value) => !cancelled && setState({ status: 'done', value }),
      (error: unknown) => !cancelled && setState({ status: 'error', error }),
    )
    return () => {
      cancelled = true
    }
  }, [key, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return [state, reload] as const
}
