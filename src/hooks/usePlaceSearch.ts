import { useEffect, useState } from 'react'
import { searchPlaces, tripSearchContext, type GeoResult, type PlaceSearchProvider } from '../api/geocode'
import type { Trip } from '../types'

export function usePlaceSearch(query: string, trip: Trip, key: string, provider: PlaceSearchProvider) {
  const [results, setResults] = useState<GeoResult[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'empty' | 'results' | 'error'>('idle')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const contextKey = JSON.stringify(tripSearchContext(trip))

  useEffect(() => {
    const keyword = query.trim()
    const controller = new AbortController()
    setResults([])
    setError('')
    setStatus(keyword.length >= 2 ? 'loading' : 'idle')
    if (keyword.length < 2) return
    let deadline: number | undefined
    let timedOut = false
    const timer = window.setTimeout(async () => {
      deadline = window.setTimeout(() => {
        timedOut = true
        controller.abort()
        setError('搜索响应较慢，请稍后重试。')
        setStatus('error')
      }, 20_000)
      try {
        const next = await searchPlaces(keyword, controller.signal, key, provider, JSON.parse(contextKey ?? 'null') ?? undefined)
        if (controller.signal.aborted) return
        setResults(next)
        setStatus(next.length ? 'results' : 'empty')
      } catch (reason) {
        if (controller.signal.aborted || timedOut) return
        const message = reason instanceof Error ? reason.message : ''
        setError(message.includes('429') ? '搜索服务繁忙，请稍后重试。' : '暂时无法连接搜索服务，请检查网络后重试。')
        setStatus('error')
      } finally {
        window.clearTimeout(deadline)
      }
    }, 400)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
      window.clearTimeout(deadline)
    }
  }, [query, key, provider, contextKey, attempt])

  return { results, status, error, retry: () => setAttempt((value) => value + 1) }
}
