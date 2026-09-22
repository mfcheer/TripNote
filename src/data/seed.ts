import type { Trip } from '../types'

// 示例旅程：东北大环线（示例）
export const seedTrip: Trip = {
  id: 'trip-northeast-loop',
  name: '东北大环线（示例）',
  searchRegion: '东北',
  daysCount: 10,
  totalBudget: 13200,
  days: [
    { id: 'd1', label: '第1天', date: '2026-09-25', place: '哈尔滨' },
    { id: 'd2', label: '第2天', date: '2026-09-26', place: '哈尔滨' },
    { id: 'd3', label: '第3天', date: '2026-09-27', place: '伊春' },
    { id: 'd4', label: '第4天', date: '2026-09-28', place: '汤旺河' },
    { id: 'd5', label: '第5天', date: '2026-09-29', place: '加格达奇' },
    { id: 'd6', label: '第6天', date: '2026-09-30', place: '漠河 · 北极村' },
    { id: 'd7', label: '第7天', date: '2026-10-01', place: '哈尔滨' },
    { id: 'd8', label: '第8天', date: '2026-10-02', place: '二道白河' },
    { id: 'd9', label: '第9天', date: '2026-10-03', place: '长白山' },
    { id: 'd10', label: '第10天', date: '2026-10-04', place: '吉林市' },
  ],
  activities: [
    { id: 'a1', dayId: 'd1', time: '10:30', title: '抵达哈尔滨太平机场', category: 'traffic', location: '哈尔滨太平国际机场', note: '乘机场巴士前往市区', costs: [{ id: 'c1', title: '机场巴士', amount: 20 }], duration: '车程约50分钟', geo: { lat: 45.6234, lng: 126.2503 } },
    { id: 'a2', dayId: 'd1', time: '14:00', title: '中央大街 · 圣索菲亚教堂', category: 'sight', location: '哈尔滨市道里区', note: '由南向北慢逛，留意俄式建筑细节', costs: [{ id: 'c2', title: '展馆门票', amount: 20 }], duration: '3小时', geo: { lat: 45.773, lng: 126.619 } },
    { id: 'a3', dayId: 'd1', time: '19:00', title: '老厨家锅包肉', category: 'food', location: '中央大街附近', costs: [{ id: 'c3', title: '晚餐', amount: 110 }], duration: '1.5小时', geo: { lat: 45.7697, lng: 126.6181 } },
    { id: 'a4', dayId: 'd1', time: '21:00', title: '入住道里区酒店', category: 'stay', location: '哈尔滨市道里区', note: '连住两晚，步行可达中央大街', costs: [{ id: 'c4', title: '住宿 2 晚', amount: 760 }], geo: { lat: 45.769, lng: 126.615 } },

    { id: 'a5', dayId: 'd2', time: '08:30', title: '松花江畔晨走', category: 'sight', location: '斯大林公园', costs: [], duration: '1小时', geo: { lat: 45.7801, lng: 126.6052 } },
    { id: 'a6', dayId: 'd2', time: '10:30', title: '哈尔滨大剧院', category: 'sight', location: '松北区文化中心岛', costs: [{ id: 'c5', title: '展览 / 导览', amount: 80 }], duration: '2小时', geo: { lat: 45.8044, lng: 126.5331 } },
    { id: 'a7', dayId: 'd2', time: '15:00', title: '中华巴洛克历史文化街区', category: 'sight', location: '哈尔滨市道外区', costs: [], duration: '2小时', geo: { lat: 45.7868, lng: 126.6353 } },
    { id: 'a8', dayId: 'd2', time: '18:30', title: '铁锅炖晚餐', category: 'food', location: '道外区', costs: [{ id: 'c6', title: '晚餐', amount: 95 }], duration: '1.5小时', geo: { lat: 45.7842, lng: 126.6331 } },

    { id: 'a9', dayId: 'd3', time: '08:00', title: '自驾前往伊春', category: 'traffic', location: '哈尔滨 → 伊春', note: '约 330 km；服务区补给，建议两人轮换驾驶', costs: [{ id: 'c7', title: '租车 / 油费', amount: 420 }], duration: '自驾约4.5小时', geo: { lat: 47.7276, lng: 128.8993 }, travelMode: 'drive' },
    { id: 'a10', dayId: 'd3', time: '14:30', title: '伊春林都木雕园', category: 'sight', location: '伊春市伊美区', costs: [], duration: '1.5小时', geo: { lat: 47.7245, lng: 128.903 } },
    { id: 'a11', dayId: 'd3', time: '17:30', title: '入住伊春林都酒店', category: 'stay', location: '伊春市伊美区', costs: [{ id: 'c8', title: '住宿', amount: 360 }], geo: { lat: 47.7208, lng: 128.9005 } },

    { id: 'a12', dayId: 'd4', time: '08:00', title: '汤旺河林海奇石景区', category: 'sight', location: '伊春市汤旺县', note: '小兴安岭森林徒步；防滑鞋和雨具必带', costs: [{ id: 'c9', title: '门票', amount: 90 }], duration: '4小时', geo: { lat: 48.454, lng: 129.574 }, sourceWishId: 'w-tangwanghe' },
    { id: 'a13', dayId: 'd4', time: '14:00', title: '嘉荫界江观景台', category: 'sight', location: '伊春市嘉荫县', note: '看黑龙江与对岸山线，日落前抵达', costs: [], duration: '2小时', geo: { lat: 48.891, lng: 130.397 } },
    { id: 'a14', dayId: 'd4', time: '19:30', title: '入住汤旺河民宿', category: 'stay', location: '汤旺县', costs: [{ id: 'c10', title: '住宿', amount: 320 }], geo: { lat: 48.455, lng: 129.57 } },

    { id: 'a15', dayId: 'd5', time: '08:00', title: '前往加格达奇', category: 'traffic', location: '汤旺河 → 加格达奇', note: '长距离自驾日，提前加满油并下载离线地图', costs: [{ id: 'c11', title: '油费 / 过路费', amount: 480 }], duration: '自驾约6.5小时', geo: { lat: 50.411, lng: 124.117 }, travelMode: 'drive' },
    { id: 'a16', dayId: 'd5', time: '16:30', title: '大兴安岭资源馆', category: 'sight', location: '加格达奇区', costs: [], duration: '1.5小时', geo: { lat: 50.414, lng: 124.128 } },
    { id: 'a17', dayId: 'd5', time: '19:00', title: '入住加格达奇酒店', category: 'stay', location: '加格达奇区', costs: [{ id: 'c12', title: '住宿', amount: 340 }], geo: { lat: 50.406, lng: 124.12 } },

    { id: 'a18', dayId: 'd6', time: '07:30', title: '自驾前往漠河', category: 'traffic', location: '加格达奇 → 漠河', note: '大兴安岭腹地长距离行驶，天黑前到达北极村', costs: [{ id: 'c13', title: '油费 / 过路费', amount: 560 }], duration: '自驾约7小时', geo: { lat: 52.972, lng: 122.536 }, travelMode: 'drive' },
    { id: 'a19', dayId: 'd6', time: '16:30', title: '北极村 · 北极沙洲', category: 'sight', location: '漠河市北极村', costs: [{ id: 'c14', title: '景区门票', amount: 68 }], duration: '2小时', geo: { lat: 53.482, lng: 122.347 }, sourceWishId: 'w-beiji' },
    { id: 'a20', dayId: 'd6', time: '19:30', title: '入住北极村木屋', category: 'stay', location: '漠河市北极村', costs: [{ id: 'c15', title: '住宿', amount: 520 }], geo: { lat: 53.478, lng: 122.35 } },

    { id: 'a21', dayId: 'd7', time: '08:30', title: '漠河机场 → 哈尔滨', category: 'traffic', location: '漠河古莲机场 → 哈尔滨太平机场', note: '还车后乘机返回哈尔滨', costs: [{ id: 'c16', title: '机票', amount: 980 }], duration: '飞行约2小时', geo: { lat: 45.6234, lng: 126.2503 }, travelMode: 'flight' },
    { id: 'a22', dayId: 'd7', time: '15:00', title: '果戈里大街咖啡休整', category: 'food', location: '哈尔滨市南岗区', costs: [{ id: 'c17', title: '下午茶', amount: 55 }], duration: '1.5小时', geo: { lat: 45.7568, lng: 126.6536 } },
    { id: 'a23', dayId: 'd7', time: '18:00', title: '入住哈尔滨站附近酒店', category: 'stay', location: '哈尔滨市南岗区', costs: [{ id: 'c18', title: '住宿', amount: 360 }], geo: { lat: 45.759, lng: 126.632 } },

    { id: 'a24', dayId: 'd8', time: '08:00', title: '飞往长白山机场', category: 'traffic', location: '哈尔滨 → 长白山机场', costs: [{ id: 'c19', title: '机票', amount: 680 }], duration: '飞行约1.5小时', geo: { lat: 42.066, lng: 127.602 }, travelMode: 'flight' },
    { id: 'a25', dayId: 'd8', time: '11:30', title: '接驳至二道白河', category: 'traffic', location: '长白山机场 → 二道白河镇', costs: [{ id: 'c20', title: '拼车', amount: 120 }], duration: '车程约1.5小时', geo: { lat: 42.431, lng: 128.119 }, travelMode: 'charter' },
    { id: 'a26', dayId: 'd8', time: '15:00', title: '美人松空中廊桥公园', category: 'sight', location: '安图县二道白河镇', costs: [], duration: '1.5小时', geo: { lat: 42.428, lng: 128.118 } },
    { id: 'a27', dayId: 'd8', time: '19:00', title: '入住二道白河温泉酒店', category: 'stay', location: '安图县二道白河镇', costs: [{ id: 'c21', title: '住宿', amount: 560 }], geo: { lat: 42.427, lng: 128.115 } },

    { id: 'a28', dayId: 'd9', time: '07:00', title: '长白山北坡集散中心', category: 'traffic', location: '长白山北景区', note: '提前预约并关注天气，天池开放以景区通知为准', costs: [{ id: 'c22', title: '门票 / 环保车', amount: 305 }], duration: '车程约1小时', geo: { lat: 42.184, lng: 128.109 } },
    { id: 'a29', dayId: 'd9', time: '09:30', title: '长白山天池', category: 'sight', location: '长白山主峰', note: '天气窗口期优先上主峰；风大注意保暖', costs: [], duration: '2小时', geo: { lat: 42.019, lng: 128.057 }, sourceWishId: 'w-tianchi' },
    { id: 'a30', dayId: 'd9', time: '13:00', title: '长白瀑布 · 聚龙温泉群', category: 'sight', location: '长白山北景区', costs: [], duration: '2小时', geo: { lat: 42.192, lng: 128.116 }, sourceWishId: 'w-waterfall' },
    { id: 'a31', dayId: 'd9', time: '18:30', title: '铁锅炖林蛙晚餐', category: 'food', location: '二道白河镇', costs: [{ id: 'c23', title: '晚餐', amount: 130 }], duration: '1.5小时', geo: { lat: 42.43, lng: 128.117 } },

    { id: 'a32', dayId: 'd10', time: '08:00', title: '前往吉林市', category: 'traffic', location: '二道白河 → 吉林市', note: '约 430 km；可按实际情况改为包车 / 高铁组合', costs: [{ id: 'c24', title: '包车 / 油费', amount: 520 }], duration: '自驾约5.5小时', geo: { lat: 43.843, lng: 126.55 }, travelMode: 'drive' },
    { id: 'a33', dayId: 'd10', time: '15:00', title: '松花江畔 · 临江门大桥', category: 'sight', location: '吉林市船营区', costs: [], duration: '1小时', geo: { lat: 43.843, lng: 126.545 } },
    { id: 'a34', dayId: 'd10', time: '17:00', title: '吉林北山公园', category: 'sight', location: '吉林市船营区', costs: [], duration: '1.5小时', geo: { lat: 43.86, lng: 126.55 }, sourceWishId: 'w-beishan' },
    { id: 'a35', dayId: 'd10', time: '19:30', title: '乌拉满族火锅', category: 'food', location: '吉林市船营区', costs: [{ id: 'c25', title: '晚餐', amount: 120 }], duration: '1.5小时', geo: { lat: 43.846, lng: 126.56 } },
  ],
  wishPlaces: [
    { id: 'w-tangwanghe', title: '汤旺河林海奇石景区', category: 'sight', location: '伊春市汤旺县', note: '已安排第4天；小兴安岭森林徒步代表点', geo: { lat: 48.454, lng: 129.574 }, scheduledActivityIds: ['a12'] },
    { id: 'w-wuying', title: '五营国家森林公园', category: 'sight', location: '伊春市丰林县', note: '雨天可替换为伊春市区博物馆；建议预留半天', geo: { lat: 48.109, lng: 129.255 } },
    { id: 'w-beiji', title: '北极村 · 北极沙洲', category: 'sight', location: '漠河市北极村', note: '已安排第6天；适合日落前抵达', geo: { lat: 53.482, lng: 122.347 }, scheduledActivityIds: ['a19'] },
    { id: 'w-longjiang', title: '龙江第一湾', category: 'sight', location: '漠河市北红村附近', note: '漠河多留一天时的备选', geo: { lat: 53.269, lng: 123.197 } },
    { id: 'w-tianchi', title: '长白山天池', category: 'sight', location: '长白山北景区', note: '已安排第9天；建议作为天气优先事项', geo: { lat: 42.019, lng: 128.057 }, scheduledActivityIds: ['a29'] },
    { id: 'w-magic', title: '魔界风景区', category: 'sight', location: '安图县二道白河镇红丰村', note: '清晨雾凇摄影备选，需根据天气调整', geo: { lat: 42.339, lng: 128.196 } },
    { id: 'w-beishan', title: '吉林北山公园', category: 'sight', location: '吉林市船营区', note: '已安排第10天；可与松花江夜景连走', geo: { lat: 43.86, lng: 126.55 }, scheduledActivityIds: ['a34'] },
    { id: 'w-waterfall', title: '长白瀑布', category: 'sight', location: '长白山北景区', note: '与天池同日安排，需为天气和换乘留出余量', geo: { lat: 42.192, lng: 128.116 }, scheduledActivityIds: ['a30'] },
  ],
  expenses: [],
}
