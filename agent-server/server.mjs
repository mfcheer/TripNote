import http from 'node:http'

const port = Number(process.env.PORT || 8787)
const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
const apiKey = process.env.OPENAI_API_KEY || ''
const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini'
const allowedOrigin = process.env.CORS_ORIGIN || '*'

function reply(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  })
  response.end(JSON.stringify(body))
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

function promptFor(payload) {
  const { input = {}, context = {} } = payload
  return `你是 TripNote 的旅行规划助手。请按用户需求生成现实可执行的旅行草案。
用户需求：目的地=${input.destination || ''}；天数=${input.days || ''}；出发日期=${input.startDate || '未定'}；出行方式=${input.transport || '未定'}；偏好=${input.preferences || '未提供'}。
任务模式=${input.mode === 'revise' ? '调整现有旅行：保留合理安排，仅按用户调整要求生成完整的新副本' : '新建旅行'}。已有旅行上下文：名称=${context.name || '无'}；区域=${context.searchRegion || '无'}；已收藏地点=${Array.isArray(context.places) ? context.places.join('、') : '无'}；当前行程=${JSON.stringify(context.itinerary || [])}。
严格只输出 JSON，不要 Markdown。使用如下结构：
{"tripName":"","searchRegion":"","totalBudget":0,"assumptions":[""],"warnings":[""],"days":[{"date":"YYYY-MM-DD 或留空","place":"城市或区域","activities":[{"time":"HH:MM","title":"","category":"traffic|sight|food|stay|shop","location":"","durationMinutes":90,"duration":"1.5小时","note":"","estimatedCost":0,"travelMode":"walk|drive|train|flight|charter"}]}]}
规则：必须恰好给出用户要求的天数；每天 2-5 项；交通段用 traffic；不要编造精确营业时间、价格或不存在的预约；不确定信息写入 assumptions 或 warnings；把较长跨城移动明确标注。`
}

async function generate(payload) {
  if (!apiKey) throw new Error('服务端尚未配置 OPENAI_API_KEY')
  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.45,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: '你只返回有效 JSON。' },
        { role: 'user', content: promptFor(payload) },
      ],
    }),
  })
  const result = await upstream.json().catch(() => null)
  if (!upstream.ok) throw new Error(result?.error?.message || `模型服务错误（${upstream.status}）`)
  const content = result?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('模型没有返回草案内容')
  try { return JSON.parse(content) } catch { throw new Error('模型返回内容格式不正确，请重试') }
}

http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return reply(response, 204, {})
  if (request.method === 'GET' && request.url === '/health') return reply(response, 200, { ok: true, model: apiKey ? model : null })
  if (request.method !== 'POST' || request.url !== '/v1/plan') return reply(response, 404, { error: 'Not found' })
  try {
    const payload = await readBody(request)
    if (!payload?.input?.destination || !payload?.input?.days) return reply(response, 400, { error: '请提供目的地和计划天数' })
    const draft = await generate(payload)
    return reply(response, 200, { draft })
  } catch (error) {
    return reply(response, 502, { error: error instanceof Error ? error.message : '规划服务暂时不可用' })
  }
}).listen(port, () => console.log(`TripNote Agent 服务已启动：http://0.0.0.0:${port}`))
