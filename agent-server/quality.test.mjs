import test from 'node:test'
import assert from 'node:assert/strict'
import { basicDiagnosis, normalizeDiagnosis, prepareDraft, selectPlaceGeo, timeToMinutes, validateDraft } from './quality.mjs'

const activity = (extra = {}) => ({ time: '09:00', title: '中央大街', category: 'sight', location: '哈尔滨', durationMinutes: 90, ...extra })
const draft = (extra = {}) => ({ tripName: '测试旅行', days: [{ place: '哈尔滨', activities: [activity()] }], ...extra })

test('拒绝无效时间、倒序、负花费和非法日期，并允许调整空白天', () => {
  assert.equal(timeToMinutes('23:59'), 1439)
  for (const value of ['24:00', '10:80', '9:00']) assert.equal(timeToMinutes(value), null)
  for (const bad of [{ time: '24:10' }, { estimatedCost: -1 }, { durationMinutes: -10 }, { category: 'invalid' }]) assert.ok(validateDraft(draft({ days: [{ place: '哈尔滨', activities: [activity(bad)] }] }), 1))
  assert.ok(validateDraft(draft({ days: [{ date: '2026-02-30', place: '哈尔滨', activities: [activity()] }] }), 1))
  assert.ok(validateDraft(draft({ days: [{ place: '哈尔滨', activities: [activity({ time: '12:00' }), activity()] }] }), 1))
  assert.equal(validateDraft(draft({ days: [{ place: '哈尔滨', activities: [] }] }), 1, true), '')
})
test('丢弃模型坐标与核验声明，保留可信上下文坐标；日期跨月顺延', () => {
  const result = prepareDraft(draft({ days: [0, 1].map(() => ({ place: '哈尔滨', activities: [activity({ geo: { lat: 0, lng: 0 } })] })), checks: [{ title: '全部已核验' }], warnings: 'invalid' }), { input: { mode: 'create', startDate: '2026-01-31' } })
  assert.equal(result.days[0].activities[0].geo, undefined)
  assert.equal(result.days[1].date, '2026-02-01')
  assert.deepEqual(result.checks, [])
  assert.deepEqual(result.warnings, [])
  const known = prepareDraft(draft(), { input: {}, context: { places: [activity({ geo: { lat: 45.77, lng: 126.62 } })] } })
  assert.deepEqual(known.days[0].activities[0].geo, { lat: 45.77, lng: 126.62 })
})
test('单日调整硬保留其他日期，空白天也不会被填入模型内容', () => {
  const original = { date: '2026-10-01', place: '哈尔滨', activities: [activity({ id: 'a1', note: '已预约', cost: 100 })] }
  const result = prepareDraft(draft({ days: [original, { place: '模型修改', activities: [activity()] }] }), { input: { mode: 'revise', targetDayIndex: 1 }, context: { itinerary: [original, { date: '2026-10-02', place: '吉林', activities: [] }] } })
  assert.equal(result.days[0].activities[0].sourceActivityId, 'a1')
  assert.equal(result.days[0].activities[0].note, '已预约')
  assert.equal(result.days[1].date, '2026-10-02')
})
test('检查先排序、识别文本时长，并保留被模型否认的真实冲突', () => {
  const context = { itinerary: [{ activities: [activity({ time: '10:00' }), activity({ time: '09:00', durationMinutes: undefined, duration: '2小时' })] }] }
  const baseline = basicDiagnosis(context)
  assert.ok(baseline.some((item) => item.id.startsWith('time-')))
  const result = normalizeDiagnosis({ summary: '完全没有问题', issues: [] }, baseline, 1)
  assert.ok(result.issues.some((item) => item.id.startsWith('time-')))
  assert.notEqual(result.summary, '完全没有问题')
  assert.equal(normalizeDiagnosis({ issues: [{ dayIndex: 99, title: '检查', detail: '详情' }] }, [], 1).issues[0].dayIndex, undefined)
})
test('检索返回无关地点、越界坐标和歧义同名时不自动定位', () => {
  assert.equal(selectPlaceGeo([{ display_name: '吉林市', lat: '43.8', lon: '126.5' }], '中央大街'), undefined)
  assert.equal(selectPlaceGeo([{ name: '中央大街', lat: '180', lon: '126' }], '中央大街'), undefined)
  assert.equal(selectPlaceGeo([{ name: '中央大街', lat: '45', lon: '126' }, { name: '中央大街', lat: '40', lon: '116' }], '中央大街'), undefined)
  assert.deepEqual(selectPlaceGeo([{ name: '中央大街', lat: '45.77', lon: '126.62' }], '中央大街'), { lat: 45.77, lng: 126.62 })
})
