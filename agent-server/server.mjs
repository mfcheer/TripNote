import http from 'node:http'

const port = Number(process.env.PORT || 8787)
const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
const apiKey = process.env.OPENAI_API_KEY || ''
const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini'
// 使用逗号分隔多个网页来源；生产环境请填 TripNote 页面地址，不要保留 *。
const allowedOrigins = (process.env.CORS_ORIGIN || '*').split(',').map((value) => value.trim()).filter(Boolean)
const accessToken = process.env.AGENT_ACCESS_TOKEN || ''
const placeSearchUrl = process.env.PLACE_SEARCH_URL || 'https://nominatim.openstreetmap.org/search'
const placeCache = new Map()
let lastPlaceSearchAt = 0

function originFor(request) {
  const origin = request.headers.origin
  if (!origin) return undefined
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return allowedOrigins.includes('*') ? '*' : origin
  return null
}

function reply(response, status, body, origin) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
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
任务模式=${input.mode === 'revise' ? '调整现有旅行：保留合理安排，仅按用户调整要求生成完整的新副本' : '新建旅行'}。已有旅行上下文：名称=${context.name || '无'}；区域=${context.searchRegion || '无'}；已收藏地点=${Array.isArray(context.places) ? context.places.join('、') : '无'}；当前行程=${JSON.stringify(context.itinerary || [])}。
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
  return enrichPlaces(draft, payload)
}

http.createServer(async (request, response) => {
  const origin = originFor(request)
  if (request.headers.origin && origin === null) return reply(response, 403, { error: '当前网页来源未被允许访问规划助手' })
  if (request.method === 'OPTIONS') return reply(response, 204, {}, origin)
  if (request.method === 'GET' && request.url === '/health') return reply(response, 200, { ok: true, model: apiKey ? model : null, requiresAuth: Boolean(accessToken) }, origin)
  if (request.method !== 'POST' || request.url !== '/v1/plan') return reply(response, 404, { error: 'Not found' }, origin)
  if (!authorized(request)) return reply(response, 401, { error: '规划助手访问口令不正确' }, origin)
  try {
    const payload = await readBody(request)
    if (!payload?.input?.destination || !payload?.input?.days) return reply(response, 400, { error: '请提供目的地和计划天数' }, origin)
    const draft = await generate(payload)
    return reply(response, 200, { draft }, origin)
  } catch (error) {
    return reply(response, 502, { error: error instanceof Error ? error.message : '规划服务暂时不可用' }, origin)
  }
}).listen(port, () => console.log(`TripNote Agent 服务已启动：http://0.0.0.0:${port}`))
