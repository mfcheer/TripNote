import http from 'node:http'
import { basicDiagnosis, normalizeDiagnosis, prepareDraft, selectPlaceGeo, timeToMinutes, validateDraft } from './quality.mjs'

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
let placeSearchQueue = Promise.resolve()

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
规则：必须恰好给出用户要求的天数；新建每天以 2-5 项为宜，调整时允许保留空白天；时间采用有效的 24 小时制 HH:MM，按时间排序，停留、移动、用餐和休息都要留余量。交通段用 traffic，跨城明确安排移动，不要把自驾时间当步行、火车或飞机耗时。地点使用真实的具体名称并补城市/区域地址，无法确认时明确写“待确认”，不要编造坐标、营业时间、班次、精确票价或预约。预计花费是估算而非已发生费用，预算口径默认每人并在 assumptions 中说明；交通、住宿等未确定时不要给出虚假的全包预算。缺少出发地、抵达时间、同行人数等信息时明确假设，不默认为用户已经确定。用户明确的必去地点、交通方式、节奏与预算优先，不合理要求写入 warnings 而非假装可以完成。
调整旅行：未要求修改的日期、地点、时间与内容保持不变，不因每天 2-5 项的建议而删减用户安排；保留原活动时在该活动返回 sourceActivityId（上下文的 id），不要引用其他活动 id。备注、已记录花费不能擅自重写。只调整指定日期时必须返回整份旅行，其他天逐字保留。最近对话仅作偏好参考，当前行程与本次要求优先；新建旅行不得把旧旅行地点强塞到新目的地。${repairHint}`
}

function checkPromptFor(payload, baselineIssues) {
  const { input = {}, context = {} } = payload
  return `你是 TripNote 的旅行行程检查助手。不要生成或改写行程，只诊断当前行程中最值得用户确认的问题。
用户补充：${input.preferences || '无'}。已有旅行：名称=${context.name || '无'}；区域=${context.searchRegion || '无'}；当前行程=${JSON.stringify(context.itinerary || [])}；预检查发现=${JSON.stringify(baselineIssues)}；最近对话=${JSON.stringify(context.conversation || [])}。
严格只输出 JSON，不要 Markdown：
{"summary":"一句整体结论","issues":[{"id":"稳定英文短 id","dayIndex":0,"severity":"warning|info","title":"短标题","detail":"说明问题","suggestion":"可执行的单日调整建议"}]}
规则：最多 5 项；没有明显问题可返回空数组；dayIndex 从 0 开始；不编造营业时间或票价；只聚焦时间冲突、距离/交通、地点待确认与节奏。`
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
          model, temperature: 0.25, max_tokens: 8000, response_format: { type: 'json_object' },
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

async function diagnose(payload) {
  if (!apiKey) throw new Error('服务端尚未配置 OPENAI_API_KEY')
  if (!Array.isArray(payload?.context?.itinerary) || !payload.context.itinerary.length) throw new Error('当前旅行还没有可检查的行程')
  const fallback = basicDiagnosis(payload.context)
  try {
    return normalizeDiagnosis(await callModel(payload, fallback, 'check'), fallback, payload.context.itinerary.length)
  } catch (error) {
    // 模型暂时不可用时仍给出本地规则检查结果，不让“检查行程”整个失效。
    if (fallback.length) return normalizeDiagnosis(null, fallback, payload.context.itinerary.length)
    throw error
  }
}

function resolvePlace(query, title) {
  const pending = placeSearchQueue.then(() => lookupPlace(query, title))
  placeSearchQueue = pending.then(() => undefined, () => undefined)
  return pending
}

async function lookupPlace(query, title) {
  const cacheKey = query.trim().toLocaleLowerCase()
  if (!cacheKey) return undefined
  if (placeCache.has(cacheKey)) return placeCache.get(cacheKey)
  const spacing = 1100 - (Date.now() - lastPlaceSearchAt)
  if (spacing > 0) await wait(spacing)
  lastPlaceSearchAt = Date.now()
  try {
    const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '3', 'accept-language': 'zh-CN,zh' })
    const response = await fetch(`${placeSearchUrl}?${params}`, { headers: { 'User-Agent': 'TripNote-Agent/1.0 (self-hosted travel planner)' }, signal: AbortSignal.timeout(12_000) })
    if (!response.ok) return undefined
    const result = await response.json().catch(() => [])
    const geo = selectPlaceGeo(result, title)
    if (geo) placeCache.set(cacheKey, geo)
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
    const geo = await resolvePlace(`${activity.title} ${area}`, activity.title)
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

async function routeEstimate(from, to) {
  const key = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}:${to.lat.toFixed(4)},${to.lng.toFixed(4)}`
  if (routeCache.has(key)) return routeCache.get(key)
  const direct = directDistanceMeters(from, to)
  try {
    const url = `${routeServiceUrl}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000) })
    const result = await response.json().catch(() => null)
    const route = result?.routes?.[0]
    const estimate = response.ok && result?.code === 'Ok' && route && Number.isFinite(route.distance) && route.distance >= 0 ? {
      distanceMeters: Math.round(route.distance), durationMinutes: Number.isFinite(route.duration) && route.duration >= 0 ? Math.max(1, Math.round(route.duration / 60)) : null, source: 'route',
    } : { distanceMeters: direct, durationMinutes: null, source: 'direct' }
    routeCache.set(key, estimate)
    return estimate
  } catch {
    return { distanceMeters: direct, durationMinutes: null, source: 'direct' }
  }
}

async function assessDraft(draft, payload) {
  const checks = basicDiagnosis({ itinerary: draft.days }).filter((issue) => issue.severity === 'warning').map((issue) => ({ kind: 'schedule', tone: 'warning', title: `第 ${issue.dayIndex + 1} 天 · ${issue.title}`, detail: issue.detail }))
  const verified = draft.days.flatMap((day) => day.activities).filter((activity) => activity.geo).length
  if (verified) checks.push({ kind: 'place', tone: 'info', title: `${verified} 项安排有地图坐标`, detail: '来自你已有的地点或地图检索匹配；不代表已核实营业时间、票价或预约，请核对是否为同名地点。' })
  const unlocated = draft.days.flatMap((day) => day.activities).filter((activity) => activity.category !== 'traffic' && !activity.geo)
  if (unlocated.length) checks.push({ kind: 'place', tone: 'warning', title: `${unlocated.length} 项地点未确认位置`, detail: `包括「${unlocated.slice(0, 3).map((activity) => activity.title).join('、')}」。部分未匹配或未在本次有限检索范围内，应用后请核对位置。` })
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
    const mode = to.travelMode || from.travelMode || (/自驾|驾车/.test(payload.input?.transport ?? '') ? 'drive' : undefined)
    const walkMinutes = Math.ceil(directDistanceMeters(from.geo, to.geo) / 1000 / 4.5 * 60)
    const travelMinutes = mode === 'drive' || mode === 'charter' ? route.durationMinutes : mode === 'walk' ? walkMinutes : null
    const insufficient = travelMinutes !== null && gap !== null && gap - duration < travelMinutes
    if (km >= 15 || insufficient) {
      const distance = km >= 10 ? `${km.toFixed(0)} km` : `${km.toFixed(1)} km`
      const durationText = travelMinutes ? `，${mode === 'walk' ? '按直线距离估算步行至少' : '驾车参考约'} ${travelMinutes} 分钟` : ''
      const detail = `${from.title} → ${to.title} ${route.source === 'direct' ? '直线距离' : '道路距离参考'}约 ${distance}${durationText}。${insufficient ? '当前时间间隔可能不足，建议调整时间或补充交通安排。' : '需确认实际交通方式、班次和出发时间。'}${route.source === 'direct' ? '路线服务未返回可用路径，不代表可沿直线通行。' : '不含实时路况、等候和停车时间。'}`
      checks.push({ kind: 'route', tone: 'warning', title: `第 ${dayIndex + 1} 天有一段较长移动`, detail })
      draft.warnings = [...(draft.warnings || []), detail]
    }
  })
  checks.push({ kind: 'route', tone: 'info', title: `本次检查 ${findings.length} 段移动`, detail: '最多检查 5 段已定位的相邻非交通安排；其他路段、跨日衔接及公共交通班次未核实。' })
  draft.checks = checks.slice(0, 12)
  draft.warnings = [...new Set([...(draft.warnings || []), ...checks.filter((check) => check.tone === 'warning').map((check) => check.detail)])].slice(0, 12)
  return draft
}

async function generate(payload) {
  if (!apiKey) throw new Error('服务端尚未配置 OPENAI_API_KEY')
  const revising = payload?.input?.mode === 'revise'
  const expectedDays = revising ? payload.context?.itinerary?.length : Number(payload?.input?.days)
  if (!Number.isInteger(expectedDays) || expectedDays < 1 || expectedDays > 30) throw new Error('请提供 1–30 天的有效计划天数')
  if (revising) payload.input.days = expectedDays
  if (revising && payload.input.targetDayIndex != null && (!Number.isInteger(payload.input.targetDayIndex) || payload.input.targetDayIndex < 0 || payload.input.targetDayIndex >= expectedDays)) throw new Error('调整日期超出当前旅行范围')
  let draft = await callModel(payload)
  let issue = validateDraft(draft, expectedDays, revising)
  if (issue) {
    draft = await callModel(payload, `\n上一次草案不合格：${issue}。请重新生成完整 JSON，严格修正这个问题。`)
    issue = validateDraft(draft, expectedDays, revising)
  }
  if (issue) throw new Error(`助手返回的草案不完整：${issue}，请重试`)
  return assessDraft(await enrichPlaces(prepareDraft(draft, payload), payload), payload)
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
