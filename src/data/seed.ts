import type { Trip } from '../types'

// 示例旅程：日本关西之旅（示例）
// 预算一律记在行程条目的 costs 里，一个条目可有多笔花费
export const seedTrip: Trip = {
  id: 'trip-kansai',
  name: '日本关西之旅（示例）',
  daysCount: 5,
  totalBudget: 13000,
  days: [
    { id: 'd1', label: '第1天', date: '2026-10-01', place: '大阪' },
    { id: 'd2', label: '第2天', date: '2026-10-02', place: '大阪' },
    { id: 'd3', label: '第3天', date: '2026-10-03', place: '京都' },
    { id: 'd4', label: '第4天', date: '2026-10-04', place: '京都' },
    { id: 'd5', label: '第5天', date: '2026-10-05', place: '奈良' },
  ],
  activities: [
    { id: 'a1', dayId: 'd1', time: '10:30', title: '抵达关西机场', category: 'traffic', location: '关西国际机场', note: 'HARUKA 关空特急 → 天王寺', costs: [{ id: 'c1', title: 'HARUKA 车票', amount: 1200 }], duration: '车程约50分钟', geo: { lat: 34.4347, lng: 135.2441 } },
    { id: 'a2', dayId: 'd1', time: '14:00', title: '心斋桥 · 道顿堀', category: 'sight', location: '大阪市中央区', note: '格力高跑男打卡、逛街购物', costs: [], duration: '3小时', geo: { lat: 34.6687, lng: 135.5013 } },
    { id: 'a3', dayId: 'd1', time: '18:30', title: '一兰拉面 道顿堀店', category: 'food', location: '道顿堀', costs: [{ id: 'c2', amount: 120 }], duration: '1小时', geo: { lat: 34.6695, lng: 135.501 } },
    { id: 'a4', dayId: 'd1', time: '21:00', title: '入住 心斋桥民宿', category: 'stay', location: '大阪市中央区', note: '第1-3晚 · 含早餐；入住时确认京都行李寄送', costs: [{ id: 'c3', title: '民宿 3晚', amount: 2800 }], geo: { lat: 34.6712, lng: 135.5031 } },
    { id: 'a22', dayId: 'd1', time: '20:00', title: '法善寺横丁 夜间散步', category: 'sight', location: '大阪市中央区难波1丁目', note: '从道顿堀步行约 8 分钟，适合晚餐后顺路逛', costs: [], duration: '40分钟', durationMinutes: 40, endTime: '20:40', geo: { lat: 34.6682, lng: 135.5035 } },

    { id: 'a5', dayId: 'd2', time: '09:00', title: '大阪城公园 · 天守阁', category: 'sight', location: '大阪市中央区大阪城1-1', note: '开放 09:00-17:00', costs: [{ id: 'c4', title: '天守阁门票', amount: 600 }], duration: '2小时', geo: { lat: 34.6873, lng: 135.5262 } },
    { id: 'a6', dayId: 'd2', time: '11:30', title: '黑门市场 午餐', category: 'food', location: '大阪市中央区日本桥', costs: [{ id: 'c5', amount: 300 }], duration: '1.5小时', geo: { lat: 34.6645, lng: 135.5066 } },
    { id: 'a7', dayId: 'd2', time: '13:30', title: '四天王寺', category: 'sight', location: '大阪市天王寺区', costs: [{ id: 'c6', title: '门票', amount: 300 }], duration: '1.5小时', geo: { lat: 34.6545, lng: 135.5161 } },
    { id: 'a8', dayId: 'd2', time: '16:00', title: '梅田蓝天大厦 · 空中庭园', category: 'sight', location: '大阪市北区大淀中1-1', costs: [{ id: 'c7', title: '观景台门票', amount: 800 }], duration: '2小时', note: '日落前上楼看夜景；建议提前线上购票', geo: { lat: 34.7052, lng: 135.4902 } },
    { id: 'a23', dayId: 'd2', time: '19:00', title: '梅田地下街 晚餐', category: 'food', location: '大阪市北区梅田', note: '候选：烧鸟 / 大阪烧；根据排队情况二选一', costs: [{ id: 'c17', title: '晚餐预算', amount: 350 }], duration: '1.5小时', durationMinutes: 90, endTime: '20:30', geo: { lat: 34.7025, lng: 135.4959 } },

    { id: 'a9', dayId: 'd3', time: '08:30', title: '前往京都 · JR东海道线', category: 'traffic', location: '大阪站 → 京都站', note: '关西周游卡可直接搭乘', costs: [{ id: 'c8', title: '关西周游卡 3日', amount: 520 }], duration: '车程约30分钟', geo: { lat: 34.9858, lng: 135.7588 } },
    { id: 'a10', dayId: 'd3', time: '10:00', title: '清水寺', category: 'sight', location: '京都市东山区清水1-294', note: '建议游览 1.5小时', costs: [{ id: 'c9', title: '门票', amount: 400 }], duration: '1.5小时', geo: { lat: 34.9949, lng: 135.785 } },
    { id: 'a11', dayId: 'd3', time: '12:30', title: '二年坂 · 三年坂 午餐', category: 'food', location: '东山区', costs: [{ id: 'c10', amount: 250 }], duration: '2小时', geo: { lat: 34.9956, lng: 135.7819 } },
    { id: 'a12', dayId: 'd3', time: '15:30', title: '祇园 · 花见小路', category: 'sight', location: '京都市东山区', costs: [], duration: '2小时', geo: { lat: 35.0037, lng: 135.7788 } },
    { id: 'a13', dayId: 'd3', time: '19:00', title: '先斗町 晚餐', category: 'food', location: '京都市中京区', note: '若热门店满座，可改到木屋町一带', costs: [{ id: 'c11', title: '晚餐预算', amount: 300 }], duration: '1.5小时', durationMinutes: 90, endTime: '20:30', geo: { lat: 35.0069, lng: 135.7705 } },
    { id: 'a24', dayId: 'd3', time: '21:00', title: '鸭川沿岸 夜间散步', category: 'sight', location: '四条大桥 → 三条大桥', note: '饭后沿河慢走，雨天可直接返回住宿', costs: [], duration: '45分钟', durationMinutes: 45, endTime: '21:45', geo: { lat: 35.0064, lng: 135.772 }, sourceWishId: 'w-kamo' },

    { id: 'a14', dayId: 'd4', time: '07:30', title: '伏见稻荷大社', category: 'sight', location: '京都市伏见区', note: '千本鸟居，早上人少', costs: [], duration: '2.5小时', geo: { lat: 34.9671, lng: 135.7727 } },
    { id: 'a15', dayId: 'd4', time: '11:00', title: '锦市场 午餐', category: 'food', location: '京都市中京区', costs: [{ id: 'c12', amount: 280 }], duration: '1.5小时', geo: { lat: 35.005, lng: 135.7651 } },
    { id: 'a16', dayId: 'd4', time: '14:00', title: '金阁寺', category: 'sight', location: '京都市北区金阁寺町1', costs: [{ id: 'c13', title: '门票', amount: 400 }], duration: '1.5小时', geo: { lat: 35.0394, lng: 135.7292 } },
    { id: 'a17', dayId: 'd4', time: '17:00', title: '岚山 · 渡月桥', category: 'sight', location: '京都市右京区', note: '日落后返程；如时间充足可增加竹林小径', costs: [], duration: '2小时', geo: { lat: 35.0146, lng: 135.6768 } },
    { id: 'a25', dayId: 'd4', time: '20:00', title: '京都站 空中径路', category: 'sight', location: '京都市下京区东盐小路町', note: '返程经过京都站，适合补拍夜景', costs: [], duration: '40分钟', durationMinutes: 40, endTime: '20:40', geo: { lat: 34.9855, lng: 135.7586 } },

    { id: 'a18', dayId: 'd5', time: '09:00', title: '前往奈良 · 近铁线', category: 'traffic', location: '京都站 → 近铁奈良站', duration: '车程约45分钟', costs: [{ id: 'c14', amount: 680 }], geo: { lat: 34.6851, lng: 135.8431 } },
    { id: 'a19', dayId: 'd5', time: '10:30', title: '奈良公园 · 喂小鹿', category: 'sight', location: '奈良市奈良公园', note: '鹿饼 ¥200/份，注意别被围堵', costs: [{ id: 'c15', title: '鹿饼', amount: 200 }], duration: '2.5小时', geo: { lat: 34.6849, lng: 135.8481 }, sourceWishId: 'w-nara-park' },
    { id: 'a20', dayId: 'd5', time: '13:00', title: '东大寺 · 大佛殿', category: 'sight', location: '奈良市杂司町406-1', costs: [{ id: 'c16', title: '门票', amount: 600 }], duration: '1.5小时', geo: { lat: 34.6891, lng: 135.8398 } },
    { id: 'a26', dayId: 'd5', time: '14:45', title: '奈良町 格子之家', category: 'sight', location: '奈良市中院町', note: '小巷和町屋体验；若下雨可跳过，直接前往车站', costs: [], duration: '45分钟', durationMinutes: 45, endTime: '15:30', geo: { lat: 34.6779, lng: 135.83 } },
    { id: 'a21', dayId: 'd5', time: '16:00', title: '返程 · 近铁奈良 → 关西机场', category: 'traffic', location: '近铁奈良站', note: '预留退税和登机时间；建议提前确认末班车与航站楼', costs: [{ id: 'c18', title: '机场交通预留', amount: 950 }], geo: { lat: 34.6851, lng: 135.8431 } },
  ],
  wishPlaces: [
    { id: 'w-tsutenkaku', title: '通天阁', category: 'sight', location: '大阪市浪速区惠美须东1-18-6', note: '若第2天体力充足，可和新世界串联', geo: { lat: 34.6525, lng: 135.5063 } },
    { id: 'w-nakanoshima', title: '大阪中之岛美术馆', category: 'sight', location: '大阪市北区中之岛4-3-1', note: '雨天备选；留意展览日期', geo: { lat: 34.6917, lng: 135.4894 } },
    { id: 'w-philosophers', title: '哲学之道', category: 'sight', location: '京都市左京区净土寺下南田町', note: '春季樱花、秋季红叶更适合安排', geo: { lat: 35.0215, lng: 135.798 } },
    { id: 'w-uji', title: '宇治平等院', category: 'sight', location: '京都府宇治市宇治莲华116', note: '需预留半天，适合作为京都延伸日', geo: { lat: 34.8893, lng: 135.8077 } },
    { id: 'w-nara-park', title: '奈良公园 · 喂小鹿', category: 'sight', location: '奈良市奈良公园', note: '已安排到第5天；也可拖到其他日期再次安排', geo: { lat: 34.6849, lng: 135.8481 }, scheduledActivityIds: ['a19'] },
    { id: 'w-kamo', title: '鸭川沿岸 夜间散步', category: 'sight', location: '四条大桥 → 三条大桥', note: '已安排到第3天；夜间体验可按天气调整', geo: { lat: 35.0064, lng: 135.772 }, scheduledActivityIds: ['a24'] },
  ],
  expenses: [],
}
