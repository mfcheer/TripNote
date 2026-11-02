import { useEffect, useState } from 'react'
import { parsePlaceSnippet, searchPlaces, tripSearchContext, type GeoResult } from '../api/geocode'
import type { Trip } from '../types'

// 会话级内存缓存：避免重复输入相同地点时反复请求网络
const searchCache = new Map<string, GeoResult[]>()

export function usePlaceSearch(
  query: string,
  trip: Trip,
) {
  const [results, setResults] = useState<GeoResult[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'empty' | 'results' | 'error'>('idle')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const contextKey = JSON.stringify(tripSearchContext(trip))

  useEffect(() => {
    const raw = query.trim()
    const parsed = parsePlaceSnippet(raw)
    const keyword = parsed.title.trim() || raw

    if (keyword.length < 2) {
      setResults([])
      setError('')
      setStatus('idle')
      return
    }

    // 1. 检查会话缓存（0ms 响应）
    const cacheKey = `${contextKey}:${keyword}`
    if (searchCache.has(cacheKey)) {
      const cached = searchCache.get(cacheKey)!
      setResults(cached)
      setError('')
      setStatus(cached.length ? 'results' : 'empty')
      return
    }

    const controller = new AbortController()
    setStatus('loading')
    setError('')

    let deadline: number | undefined
    let timedOut = false

    const timer = window.setTimeout(async () => {
      deadline = window.setTimeout(() => {
        timedOut = true
        controller.abort()
        setError('搜索响应较慢，可直接回车作为普通安排添加。')
        setStatus('error')
      }, 7000)

      try {
        const next = await searchPlaces(
          keyword,
          controller.signal,
          JSON.parse(contextKey ?? 'null') ?? undefined,
        )
        if (controller.signal.aborted) return
        searchCache.set(cacheKey, next)
        setResults(next)
        setStatus(next.length ? 'results' : 'empty')
      } catch (reason) {
        if (controller.signal.aborted || timedOut) return
        const message = reason instanceof Error ? reason.message : ''
        setError(message.includes('429') ? '搜索服务繁忙，可直接回车添加。' : '未连接到在线地图，仍可直接回车添加。')
        setStatus('error')
      } finally {
        window.clearTimeout(deadline)
      }
    }, 220)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
      window.clearTimeout(deadline)
    }
  }, [query, contextKey, attempt])

  return { results, status, error, retry: () => setAttempt((value) => value + 1) }
}
