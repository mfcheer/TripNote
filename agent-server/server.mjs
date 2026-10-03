import http from 'node:http'

const port = Number(process.env.PORT || 8787)
const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
const apiKey = process.env.OPENAI_API_KEY || ''
const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini'
const accessToken = process.env.AGENT_ACCESS_TOKEN || ''
const placeSearchUrl = process.env.PLACE_SEARCH_URL || 'https://nominatim.openstreetmap.org/search'
const routeServiceUrl = process.env.ROUTE_SERVICE_URL || 'https://router.project-osrm.org/route/v1/driving'
const placeCache = new Map()
const routeCache = new Map()
let lastPlaceSearchAt = 0

function reply(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    // 服务端访问口令是唯一访问控制；允许手机、桌面与本地页面直接连接同一 Agent。
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-TripNote-Agent-Token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  })
  response.end(JSON.stringify(body))
}

function authorized(request) {
  if (!accessToken) return true
  const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, '')
  return bearer === accessToken || request.headers['x-tripnote-agent-token'] === accessToken
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
      if (body.length > 80_000) reject(new Error('请求内容过大'))
    })
    request.on('end', () => {
      try { resolve(JSON.parse(body || '{}')) } catch { reject(new Error('请求不是有效 JSON')) }
    })
    request.on('error', reject)
  })
}

function promptFor(payload, repairHint = '') {
  const { input = {}, context = {} } = payload
  return `你是 TripNote 的旅行规划助手。请按用户需求生成现实可执行的旅行草案。
用户需求：目的地=${input.destination || ''}；天数=${input.days || ''}；出发日期=${input.startDate || '未定'}；出行方式=${input.transport || '未定'}；偏好=${input.preferences || '未提供'}。
任务模式=${input.mode === 'revise' ? '调整现有旅行：保留合理安排，仅按用户调整要求生成完整的新副本' : '新建旅行'}。已有旅行上下文：名称=${context.name || '无'}；区域=${context.searchRegion || '无'}；预算=${context.totalBudget || '未定'}；已收藏地点=${JSON.stringify(context.places || [])}；当前行程=${JSON.stringify(context.itinerary || [])}；最近对话=${JSON.stringify(context.conversation || [])}。
严格只输出 JSON，不要 Markdown。使用如下结构：
{"tripName":"","searchRegion":"","totalBudget":0,"assumptions":[""],"warnings":[""],"days":[{"date":"YYYY-MM-DD 或留空","place":"城市或区域","activities":[{"time":"HH:MM","title":"","category":"traffic|sight|food|stay|shop","location":"","durationMinutes":90,"duration":"1.5小时","note":"","estimatedCost":0,"travelMode":"walk|drive|train|flight|charter"}]}]}
规则：必须恰好给出用户要求的天数；每天 2-5 项；交通段用 traffic；不要编造精确营业时间、价格或不存在的预约；不确定信息写入 assumptions 或 warnings；把较长跨城移动明确标注。${repairHint}`
}

function validateDraft(draft, expectedDays) {
  if (!draft || typeof draft !== 'object' || !Array.isArray(draft.days)) return '没有 days 数组'
  if (draft.days.length !== expectedDays) return `需要 ${expectedDays} 天，实际返回 ${draft.days.length} 天`
  if (draft.days.some((day) => !day || typeof day.place !== 'string' || !Array.isArray(day.activities) || !day.activities.length)) return '每天必须有地点和至少一项安排'
  if (draft.days.some((day) => day.activities.some((activity) => !activity || typeof activity.title !== 'string' || !activity.title.trim()))) return '每项安排必须有名称'
  return ''
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function callModel(payload, repairHint = '') {
  let lastError = ''
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 90_000)
    try {
      const upstream = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, temperature: 0.45, max_tokens: 8000, response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: '你只返回有效 JSON。' }, { role: 'user', content: promptFor(payload, repairHint) }],
        }),
      })
      const result = await upstream.json().catch(() => null)
      if (!upstream.ok) {
        lastError = result?.error?.message || `模型服务错误（${upstream.status}）`
        if (upstream.status === 429 || upstream.status >= 500) { await wait(700 * (attempt + 1)); continue }
        throw new Error(lastError)
      }
      const content = result?.choices?.[0]?.message?.content
      if (typeof content !== 'string' || !content.trim()) { lastError = '模型没有返回草案内容'; continue }
      try { return JSON.parse(content) } catch { lastError = '模型返回内容格式不正确'; continue }
    } catch (error) {
      lastError = error?.name === 'AbortError' ? '模型服务响应超时' : (error instanceof Error ? error.message : '模型服务暂时不可用')
      if (attempt === 0) await wait(700)
    } finally { clearTimeout(timeout) }
  }
  throw new Error(lastError || '模型服务暂时不可用，请稍后重试')
}

async function resolvePlace(query) {
  const cacheKey = query.trim().toLocaleLowerCase()
  if (!cacheKey) return undefined
  if (placeCache.has(cacheKey)) return placeCache.get(cacheKey)
  const spacing = 1100 - (Date.now() - lastPlaceSearchAt)
  if (spacing > 0) await wait(spacing)
  lastPlaceSearchAt = Date.now()
  try {
    const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1', 'accept-language': 'zh-CN,zh' })
    const response = await fetch(`${placeSearchUrl}?${params}`, { headers: { 'User-Agent': 'TripNote-Agent/1.0 (self-hosted travel planner)' }, signal: AbortSignal.timeout(12_000) })
    const result = await response.json().catch(() => [])
    const first = Array.isArray(result) ? result[0] : undefined
    const lat = Number(first?.lat); const lng = Number(first?.lon)
    const geo = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined
    placeCache.set(cacheKey, geo)
    return geo
  } catch { return undefined }
}

async function enrichPlaces(draft, payload) {
  const candidates = []
  for (const day of draft.days) for (const activity of day.activities) {
    if (activity.category !== 'traffic' && typeof activity.title === 'string' && !activity.geo) candidates.push({ day, activity })
  }
  // 最多核对 6 个地点，且串行节流，遵守公开 Nominatim 服务的一次/秒限制。
  for (const { day, activity } of candidates.slice(0, 6)) {
    const area = activity.location || day.place || payload.input?.destination || ''
    const geo = await resolvePlace(`${activity.title} ${area}`)
    if (geo) activity.geo = geo
  }
  return draft
}

function directDistanceMeters(from, to) {
  const radians = (value) => value * Math.PI / 180
  const dLat = radians(to.lat - from.lat)
  const dLng = radians(to.lng - from.lng)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function timeToMinutes(value) {
  const match = typeof value === 'string' && value.match(/^(\d{1,2}):(\d{2})$/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

async function routeEstimate(from, to) {
  const key = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}:${to.lat.toFixed(4)},${to.lng.toFixed(4)}`
  if (routeCache.has(key)) return routeCache.get(key)
  const direct = directDistanceMeters(from, to)
  try {
    const url = `${routeServiceUrl}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000) })
    const result = await response.json().catch(() => null)
    const route = result?.routes?.[0]
    const estimate = route && Number.isFinite(route.distance) ? {
      distanceMeters: Math.round(route.distance), durationMinutes: Number.isFinite(route.duration) ? Math.max(1, Math.round(route.duration / 60)) : null, source: 'route',
    } : { distanceMeters: direct, durationMinutes: null, source: 'direct' }
    routeCache.set(key, estimate)
    return estimate
  } catch {
    return { distanceMeters: direct, durationMinutes: null, source: 'direct' }
  }
}

async function assessDraft(draft) {
  const checks = []
  const verified = draft.days.flatMap((day) => day.activities).filter((activity) => activity.geo).length
  if (verified) checks.push({ kind: 'place', tone: 'info', title: `已核验 ${verified} 个地点`, detail: '这些地点已补齐地图坐标，可在行程地图中直接查看。' })
  const pairs = []
  draft.days.forEach((day, dayIndex) => day.activities.slice(1).forEach((to, index) => {
    const from = day.activities[index]
    if (from.geo && to.geo && from.category !== 'traffic' && to.category !== 'traffic') pairs.push({ from, to, dayIndex })
  }))
  const findings = await Promise.all(pairs.slice(0, 5).map(async ({ from, to, dayIndex }) => ({ from, to, dayIndex, route: await routeEstimate(from.geo, to.geo) })))
  findings.forEach(({ from, to, dayIndex, route }) => {
    const km = route.distanceMeters / 1000
    const toMinutes = timeToMinutes(to.time)
    const fromMinutes = timeToMinutes(from.time)
    const gap = toMinutes !== null && fromMinutes !== null ? toMinutes - fromMinutes : null
    const duration = Number(from.durationMinutes) || 0
    const insufficient = route.durationMinutes && gap !== null && gap - duration < route.durationMinutes
    if (km >= 15 || insufficient) {
      const distance = km >= 10 ? `${km.toFixed(0)} km` : `${km.toFixed(1)} km`
      const durationText = route.durationMinutes ? `，驾车约 ${route.durationMinutes} 分钟` : ''
      const detail = `${from.title} → ${to.title} 约 ${distance}${durationText}。${insufficient ? '当前时间间隔可能不足，建议调整时间或补充交通安排。' : '建议确认交通方式与出发时间。'}`
      checks.push({ kind: 'route', tone: 'warning', title: `第 ${dayIndex + 1} 天有一段较长移动`, detail })
      draft.warnings = [...(draft.warnings || []), detail]
    }
  })
  draft.checks = checks.slice(0, 6)
  draft.warnings = [...new Set(draft.warnings || [])].slice(0, 6)
  return draft
}

async function generate(payload) {
  if (!apiKey) throw new Error('服务端尚未配置 OPENAI_API_KEY')
  const expectedDays = Math.max(1, Math.min(30, Number(payload?.input?.days) || 0))
  if (!expectedDays) throw new Error('请提供有效的计划天数')
  let draft = await callModel(payload)
  let issue = validateDraft(draft, expectedDays)
  if (issue) {
    draft = await callModel(payload, `\n上一次草案不合格：${issue}。请重新生成完整 JSON，严格修正这个问题。`)
    issue = validateDraft(draft, expectedDays)
  }
  if (issue) throw new Error(`助手返回的草案不完整：${issue}，请重试`)
  return assessDraft(await enrichPlaces(draft, payload))
}

http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return reply(response, 204, {})
  if (request.method === 'GET' && request.url === '/health') return reply(response, 200, { ok: true, model: apiKey ? model : null, requiresAuth: Boolean(accessToken) })
  if (request.method !== 'POST' || request.url !== '/v1/plan') return reply(response, 404, { error: 'Not found' })
  if (!authorized(request)) return reply(response, 401, { error: '规划助手访问口令不正确' })
  try {
    const payload = await readBody(request)
    if (!payload?.input?.destination || !payload?.input?.days) return reply(response, 400, { error: '请提供目的地和计划天数' })
    const draft = await generate(payload)
    return reply(response, 200, { draft })
  } catch (error) {
    return reply(response, 502, { error: error instanceof Error ? error.message : '规划服务暂时不可用' })
  }
}).listen(port, () => console.log(`TripNote Agent 服务已启动：http://0.0.0.0:${port}`))
