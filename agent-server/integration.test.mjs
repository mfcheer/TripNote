import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

test('真实 HTTP 链路：口令、自动修复、去除伪坐标、限定单日与保留检查冲突', { timeout: 20000 }, async (t) => {
  let modelCalls = 0
  let answer
  let latestPrompt = ''
  const mock = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/v1/chat/completions') {
      modelCalls++
      latestPrompt = JSON.parse(Buffer.concat(chunks).toString()).messages[1].content
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer(modelCalls)) } }] }))
    } else res.end('[]')
  }).listen(0, '127.0.0.1')
  await once(mock, 'listening')
  t.after(() => mock.close())
  const base = `http://127.0.0.1:${mock.address().port}`
  const reserve = http.createServer().listen(0, '127.0.0.1')
  await once(reserve, 'listening')
  const port = reserve.address().port
  await new Promise((resolve) => reserve.close(resolve))
  const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('.', import.meta.url), env: { ...process.env, PORT: String(port), OPENAI_API_KEY: 'test-only', OPENAI_BASE_URL: `${base}/v1`, AGENT_ACCESS_TOKEN: 'test-token', PLACE_SEARCH_URL: `${base}/search`, ROUTE_SERVICE_URL: `${base}/route` }, stdio: 'ignore' })
  t.after(async () => { child.kill(); await once(child, 'exit').catch(() => {}) })
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  const post = async (path, payload, token = 'test-token') => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })
    return { status: response.status, body: await response.json() }
  }
  const activity = { time: '09:00', title: '中央大街', category: 'sight', location: '哈尔滨', durationMinutes: 120, geo: { lat: 0, lng: 0 } }
  const payload = { input: { destination: '哈尔滨', days: 1, startDate: '2026-10-01' } }
  assert.equal((await post('/v1/plan', payload, 'wrong')).status, 401)
  answer = (count) => ({ tripName: '测试', warnings: [], days: [{ place: '哈尔滨', activities: [{ ...activity, time: count === 1 ? '25:60' : '09:00' }] }] })
  const generated = await post('/v1/plan', payload)
  assert.equal(generated.status, 200)
  assert.equal(modelCalls, 2)
  assert.equal(generated.body.draft.days[0].activities[0].geo, undefined)
  assert.ok(generated.body.draft.checks.some((check) => check.title.includes('未确认位置')))
  assert.match(latestPrompt, /上一次草案不合格/)
  const original = { date: '2026-10-01', place: '哈尔滨', activities: [{ ...activity, id: 'existing', note: '保留预约', cost: 100 }] }
  answer = () => ({ tripName: '修改', days: [{ place: '不该改', activities: [] }, { place: '吉林', activities: [{ ...activity, geo: undefined }] }] })
  const revised = await post('/v1/plan', { input: { ...payload.input, mode: 'revise', days: 1, targetDayIndex: 1 }, context: { itinerary: [original, { date: '2026-10-02', place: '吉林', activities: [] }] } })
  assert.equal(revised.status, 200)
  assert.equal(revised.body.draft.days.length, 2)
  assert.equal(revised.body.draft.days[0].place, '哈尔滨')
  assert.equal(revised.body.draft.days[0].activities[0].note, '保留预约')
  answer = () => ({ summary: '没有问题', issues: [] })
  const checked = await post('/v1/check', { input: {}, context: { itinerary: [{ activities: [activity, { ...activity, time: '10:00' }] }] } })
  assert.equal(checked.status, 200)
  assert.ok(checked.body.diagnosis.issues.some((issue) => issue.title === '安排时间重叠'))
})
