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
任务模式=${input.mode === 'revise' ? (Number.isInteger(input.targetDayIndex) ? `只调整第 ${input.targetDayIndex + 1} 天：其他日期必须与当前行程保持一致` : '调整现有旅行：保留合理安排，仅按用户调整要求生成完整的新副本') : '新建旅行'}。已有旅行上下文：名称=${context.name || '无'}；区域=${context.searchRegion || '无'}；预算=${context.totalBudget || '未定'}；已收藏地点=${JSON.stringify(context.places || [])}；当前行程=${JSON.stringify(context.itinerary || [])}；最近对话=${JSON.stringify(context.conversation || [])}。
严格只输出 JSON，不要 Markdown。使用如下结构：
{"tripName":"","searchRegion":"","totalBudget":0,"assumptions":[""],"warnings":[""],"days":[{"date":"YYYY-MM-DD 或留空","place":"城市或区域","activities":[{"time":"HH:MM","title":"","category":"traffic|sight|food|stay|shop","location":"","durationMinutes":90,"duration":"1.5小时","note":"","estimatedCost":0,"travelMode":"walk|drive|train|flight|charter"}]}]}
规则：必须恰好给出用户要求的天数；每天 2-5 项；交通段用 traffic；不要编造精确营业时间、价格或不存在的预约；不确定信息写入 assumptions 或 warnings；把较长跨城移动明确标注。${repairHint}`
}

function checkPromptFor(payload, baselineIssues) {
  const { input = {}, context = {} } = payload
  return `你是 TripNote 的旅行行程检查助手。不要生成或改写行程，只诊断当前行程中最值得用户确认的问题。
用户补充：${input.preferences || '无'}。已有旅行：名称=${context.name || '无'}；区域=${context.searchRegion || '无'}；当前行程=${JSON.stringify(context.itinerary || [])}；预检查发现=${JSON.stringify(baselineIssues)}；最近对话=${JSON.stringify(context.conversation || [])}。
严格只输出 JSON，不要 Markdown：
{"summary":"一句整体结论","issues":[{"id":"稳定英文短 id","dayIndex":0,"severity":"warning|info","title":"短标题","detail":"说明问题","suggestion":"可执行的单日调整建议"}]}
规则：最多 5 项；没有明显问题可返回空数组；dayIndex 从 0 开始；不编造营业时间或票价；只聚焦时间冲突、距离/交通、地点待确认与节奏。`
}

function validateDraft(draft, expectedDays) {
  if (!draft || typeof draft !== 'object' || !Array.isArray(draft.days)) return '没有 days 数组'
  if (draft.days.length !== expectedDays) return `需要 ${expectedDays} 天，实际返回 ${draft.days.length} 天`
  if (draft.days.some((day) => !day || typeof day.place !== 'string' || !Array.isArray(day.activities) || !day.activities.length)) return '每天必须有地点和至少一项安排'
  if (draft.days.some((day) => day.activities.some((activity) => !activity || typeof activity.title !== 'string' || !activity.title.trim()))) return '每项安排必须有名称'
  return ''
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function callModel(payload, repairHint = '', mode = 'plan') {
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
          messages: [{ role: 'system', content: '你只返回有效 JSON。' }, { role: 'user', content: mode === 'check' ? checkPromptFor(payload, repairHint) : promptFor(payload, repairHint) }],
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

function basicDiagnosis(context = {}) {
  const issues = []
  const itinerary = Array.isArray(context.itinerary) ? context.itinerary : []
  itinerary.forEach((day, dayIndex) => {
    const activities = Array.isArray(day.activities) ? day.activities : []
    if (activities.length >= 6) issues.push({ id: `dense-${dayIndex}`, dayIndex, severity: 'warning', title: '当天安排偏多', detail: `第 ${dayIndex + 1} 天有 ${activities.length} 项安排，实际移动与排队时间可能不够。`, suggestion: '保留最想去的 3–4 项，把其余地点移到相邻日期或设为备选。' })
    for (let index = 1; index < activities.length; index += 1) {
      const previous = activities[index - 1]; const current = activities[index]
      const previousTime = timeToMinutes(previous.time); const currentTime = timeToMinutes(current.time)
      const duration = Number(previous.durationMinutes) || 0
      if (previousTime !== null && currentTime !== null && currentTime - previousTime < duration) {
        issues.push({ id: `time-${dayIndex}-${index}`, dayIndex, severity: 'warning', title: '时间可能重叠', detail: `${previous.title} 与 ${current.title} 的间隔短于已填写的停留时长。`, suggestion: `把「${current.title}」延后，或缩短/移走前一项安排。` })
        break
      }
    }
    if (activities.some((activity) => !activity.location && !activity.geo)) issues.push({ id: `location-${dayIndex}`, dayIndex, severity: 'info', title: '有地点尚未定位', detail: '部分安排缺少地址或地图坐标，路线与交通时间暂时无法可靠判断。', suggestion: '补充具体地点或在地图上选点后，再检查当天路线。' })
  })
  return issues.slice(0, 5)
}

function normalizeDiagnosis(value, fallback) {
  const issues = Array.isArray(value?.issues) ? value.issues.slice(0, 5).flatMap((issue, index) => {
    if (!issue || typeof issue.title !== 'string' || typeof issue.detail !== 'string') return []
    return [{ id: typeof issue.id === 'string' ? issue.id : `check-${index}`, dayIndex: Number.isInteger(issue.dayIndex) && issue.dayIndex >= 0 ? issue.dayIndex : undefined, severity: issue.severity === 'warning' ? 'warning' : 'info', title: issue.title, detail: issue.detail, suggestion: typeof issue.suggestion === 'string' ? issue.suggestion : '按实际情况调整。' }]
  }) : fallback
  return { summary: typeof value?.summary === 'string' && value.summary.trim() ? value.summary : (issues.length ? '发现几处可以再确认的安排，建议从影响最大的地方开始调整。' : '当前行程没有发现明显冲突，出发前再核对预约与实时交通即可。'), issues }
}

async function diagnose(payload) {
  if (!apiKey) throw new Error('服务端尚未配置 OPENAI_API_KEY')
  if (!Array.isArray(payload?.context?.itinerary) || !payload.context.itinerary.length) throw new Error('当前旅行还没有可检查的行程')
  const fallback = basicDiagnosis(payload.context)
  try {
    return normalizeDiagnosis(await callModel(payload, fallback, 'check'), fallback)
  } catch (error) {
    // 模型暂时不可用时仍给出本地规则检查结果，不让“检查行程”整个失效。
    if (fallback.length) return normalizeDiagnosis(null, fallback)
    throw error
  }
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
  if (request.method !== 'POST' || !['/v1/plan', '/v1/check'].includes(request.url)) return reply(response, 404, { error: 'Not found' })
  if (!authorized(request)) return reply(response, 401, { error: '规划助手访问口令不正确' })
  try {
    const payload = await readBody(request)
    if (request.url === '/v1/check') {
      const diagnosis = await diagnose(payload)
      return reply(response, 200, { diagnosis })
    }
    if (!payload?.input?.destination || !payload?.input?.days) return reply(response, 400, { error: '请提供目的地和计划天数' })
    const draft = await generate(payload)
    return reply(response, 200, { draft })
  } catch (error) {
    return reply(response, 502, { error: error instanceof Error ? error.message : '规划服务暂时不可用' })
  }
}).listen(port, () => console.log(`TripNote Agent 服务已启动：http://0.0.0.0:${port}`))
