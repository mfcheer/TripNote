import type { Trip } from '../types'

const harbinAirport = { lat: 45.6234, lng: 126.2503 }
const hengdaoRailway = { lat: 44.8165, lng: 129.0626 }
const jingpoWaterfall = { lat: 44.0546, lng: 128.9421 }
const yanjiWestMarket = { lat: 42.904, lng: 129.5009 }
const yanjiMarket = { lat: 42.9199, lng: 129.4952 }
const tianchi = { lat: 42.019, lng: 128.057 }
const changbaiWaterfall = { lat: 42.0352, lng: 128.0522 }
const longwan = { lat: 42.367, lng: 126.433 }

// 预算为两人自驾示例。未指定商家的住宿、餐饮使用片区点位。
export const seedTrip: Trip = {
  id: 'trip-northeast-loop',
  name: '东北大环线（示例）',
  searchRegion: '东北',
  daysCount: 10,
  totalBudget: 12000,
  expenses: [],
  days: [
    { id: 'd1', label: '第1天', date: '2026-09-25', place: '哈尔滨' },
    { id: 'd2', label: '第2天', date: '2026-09-26', place: '横道河子' },
    { id: 'd3', label: '第3天', date: '2026-09-27', place: '镜泊湖' },
    { id: 'd4', label: '第4天', date: '2026-09-28', place: '延吉' },
    { id: 'd5', label: '第5天', date: '2026-09-29', place: '二道白河' },
    { id: 'd6', label: '第6天', date: '2026-09-30', place: '长白山北坡' },
    { id: 'd7', label: '第7天', date: '2026-10-01', place: '辉南 · 三角龙湾' },
    { id: 'd8', label: '第8天', date: '2026-10-02', place: '吉林市' },
    { id: 'd9', label: '第9天', date: '2026-10-03', place: '长春' },
    { id: 'd10', label: '第10天', date: '2026-10-04', place: '哈尔滨' },
  ],
  activities: [
    { id: 'a1', dayId: 'd1', time: '09:30', title: '抵达哈尔滨太平国际机场', category: 'traffic', location: '哈尔滨太平国际机场', note: '取车检查车况后前往市区，今天沿松花江南岸游览。各项费用为两人示例估算，不含往返哈尔滨的机票。', costs: [{ id: 'c1', title: '租车首日 / 交通', amount: 380 }], duration: '50分钟', durationMinutes: 50, geo: harbinAirport, travelMode: 'drive' },
    { id: 'a2', dayId: 'd1', time: '12:00', title: '圣索菲亚教堂 · 中央大街', category: 'sight', location: '哈尔滨市道里区', note: '从机场自驾到道里，步行游览教堂广场和中央大街。', costs: [{ id: 'c2', title: '展馆门票', amount: 20 }], duration: '2.5小时', durationMinutes: 150, geo: { lat: 45.7682, lng: 126.6213 }, travelMode: 'drive' },
    { id: 'a3', dayId: 'd1', time: '15:00', title: '中华巴洛克历史文化街区', category: 'sight', location: '哈尔滨市道外区', note: '顺着松花江南岸向东逛百年巴洛克老街。', costs: [], duration: '2小时', durationMinutes: 120, geo: { lat: 45.7868, lng: 126.6353 }, travelMode: 'drive' },
    { id: 'a4', dayId: 'd1', time: '18:00', title: '老厨家锅包肉', category: 'food', location: '哈尔滨市道里区西七道街', costs: [{ id: 'c3', title: '晚餐', amount: 160 }], duration: '1.5小时', durationMinutes: 90, geo: { lat: 45.7697, lng: 126.6181 }, travelMode: 'drive' },
    { id: 'a5', dayId: 'd1', time: '20:00', title: '入住道里区酒店', category: 'stay', location: '哈尔滨市道里区', note: '选择带停车位的酒店，次日向东出城。', costs: [{ id: 'c4', title: '住宿', amount: 520 }], duration: '1晚', durationMinutes: 600, geo: { lat: 45.771, lng: 126.616 }, travelMode: 'walk' },

    { id: 'a6', dayId: 'd2', time: '08:30', title: '自驾前往横道河子', category: 'traffic', location: '哈尔滨 → 横道河子', note: '沿绥满高速向东南，途中可在服务区补给。', costs: [{ id: 'c5', title: '油费 / 过路费', amount: 360 }], duration: '自驾约3.5小时', durationMinutes: 210, geo: { lat: 44.8126, lng: 129.0663 }, travelMode: 'drive' },
    { id: 'a7', dayId: 'd2', time: '13:00', title: '中东铁路机车库 · 俄罗斯老街', category: 'sight', location: '海林市横道河子镇', note: '集中步行看扇形机车库、铁路民居和金秋白桦林。', costs: [{ id: 'c6', title: '机车库参观', amount: 60 }], duration: '2小时', durationMinutes: 120, geo: hengdaoRailway, travelMode: 'walk', sourceWishId: 'w-hengdao' },
    { id: 'a8', dayId: 'd2', time: '15:30', title: '横道河子东北虎林园', category: 'sight', location: '横道河子镇东侧', note: '从机车库向东到虎林园，游览后在镇上住宿。', costs: [{ id: 'c7', title: '门票 / 观光车', amount: 160 }], duration: '1.5小时', durationMinutes: 90, geo: { lat: 44.791, lng: 129.1056 }, travelMode: 'drive' },
    { id: 'a9', dayId: 'd2', time: '18:00', title: '入住横道河子俄式木屋民宿', category: 'stay', location: '海林市横道河子镇', costs: [{ id: 'c8', title: '住宿', amount: 420 }], duration: '1晚', durationMinutes: 600, geo: { lat: 44.8079, lng: 129.0652 }, travelMode: 'drive' },

    { id: 'a10', dayId: 'd3', time: '09:00', title: '自驾前往镜泊湖', category: 'traffic', location: '横道河子 → 镜泊湖', note: '经牡丹江方向转鹤大高速南下，导航到镜泊湖北门停车场。', costs: [{ id: 'c9', title: '油费 / 过路费', amount: 200 }], duration: '自驾约2小时', durationMinutes: 120, geo: { lat: 44.072, lng: 128.952 }, travelMode: 'drive' },
    { id: 'a11', dayId: 'd3', time: '12:00', title: '吊水楼瀑布 · 火山熔岩台地', category: 'sight', location: '牡丹江镜泊湖景区', note: '从北门乘园内车，沿熔岩台地步道赏瀑，水量随天气变化。', costs: [{ id: 'c10', title: '门票 / 观光车', amount: 240 }], duration: '3.5小时', durationMinutes: 210, geo: jingpoWaterfall, travelMode: 'charter', sourceWishId: 'w-jingpo' },
    { id: 'a12', dayId: 'd3', time: '17:30', title: '镜泊湖胖头鱼铁锅炖', category: 'food', location: '镜泊湖北门周边', note: '按人数点鱼，下单前确认重量和单价。', costs: [{ id: 'c11', title: '晚餐', amount: 200 }], duration: '1.5小时', durationMinutes: 90, geo: { lat: 44.0695, lng: 128.951 }, travelMode: 'drive' },
    { id: 'a13', dayId: 'd3', time: '19:30', title: '入住镜泊湖北门民宿', category: 'stay', location: '镜泊湖北门周边', note: '住景区外围，次日直接转向延吉。', costs: [{ id: 'c12', title: '住宿', amount: 440 }], duration: '1晚', durationMinutes: 600, geo: { lat: 44.071, lng: 128.9535 }, travelMode: 'walk' },

    { id: 'a14', dayId: 'd4', time: '08:30', title: '自驾前往延吉', category: 'traffic', location: '镜泊湖 → 延吉南部', note: '跨省进入延边，先到城南的民俗园片区，再进市中心。', costs: [{ id: 'c13', title: '油费 / 过路费', amount: 320 }], duration: '自驾约3.5小时', durationMinutes: 210, geo: { lat: 42.878, lng: 129.490 }, travelMode: 'drive' },
    { id: 'a15', dayId: 'd4', time: '13:30', title: '中国朝鲜族民俗园', category: 'sight', location: '延吉市南侧帽儿山脚', note: '下午逛朝鲜族传统建筑，若预约服饰拍照可预留换装时间。', costs: [{ id: 'c14', title: '门票', amount: 60 }], duration: '2小时', durationMinutes: 120, geo: { lat: 42.875, lng: 129.4909 }, travelMode: 'walk' },
    { id: 'a16', dayId: 'd4', time: '16:00', title: '延吉西市场朝鲜族特产采购', category: 'shop', location: '延吉市参花街819号', note: '采购泡菜、米酒、打糕等特色伴手礼。水上市场早市可作为备选。', costs: [{ id: 'c15', title: '特产 / 伴手礼', amount: 160 }], duration: '1.5小时', durationMinutes: 90, geo: yanjiWestMarket, travelMode: 'drive', sourceWishId: 'w-ximarket' },
    { id: 'a17', dayId: 'd4', time: '18:00', title: '延边大学弹幕墙 · 朝鲜族烤肉', category: 'food', location: '延吉市公园路', costs: [{ id: 'c16', title: '烤肉 / 冷面', amount: 240 }], duration: '2小时', durationMinutes: 120, geo: { lat: 42.905, lng: 129.4849 }, travelMode: 'drive' },
    { id: 'a18', dayId: 'd4', time: '20:30', title: '入住延吉市区酒店', category: 'stay', location: '延吉市延大周边', costs: [{ id: 'c17', title: '住宿', amount: 480 }], duration: '1晚', durationMinutes: 600, geo: { lat: 42.911, lng: 129.487 }, travelMode: 'walk' },

    { id: 'a19', dayId: 'd5', time: '08:30', title: '经龙井、和龙自驾前往二道白河', category: 'traffic', location: '延吉 → 二道白河', note: '导航中设置龙井、和龙为途经点，从延吉向西南出发，走内陆公路赏秋。', costs: [{ id: 'c18', title: '油费 / 过路费', amount: 260 }], duration: '自驾约3小时', durationMinutes: 180, geo: { lat: 42.4204, lng: 128.1096 }, travelMode: 'drive' },
    { id: 'a20', dayId: 'd5', time: '14:00', title: '美人松空中廊桥公园', category: 'sight', location: '安图县二道白河镇', note: '沿栈道穿行红松林，天气好时可在廊桥上远眺。', costs: [], duration: '2小时', durationMinutes: 120, geo: { lat: 42.428, lng: 128.118 }, travelMode: 'walk' },
    { id: 'a21', dayId: 'd5', time: '17:30', title: '二道白河朝鲜族冷面晚餐', category: 'food', location: '安图县二道白河镇', costs: [{ id: 'c19', title: '晚餐', amount: 140 }], duration: '1.5小时', durationMinutes: 90, geo: { lat: 42.429, lng: 128.116 }, travelMode: 'walk' },
    { id: 'a22', dayId: 'd5', time: '19:30', title: '入住二道白河温泉酒店', category: 'stay', location: '安图县二道白河镇', note: '连住两晚，次日轻装进长白山北景区。', costs: [{ id: 'c20', title: '温泉住宿 2 晚', amount: 1160 }], duration: '2晚', durationMinutes: 600, geo: { lat: 42.427, lng: 128.115 }, travelMode: 'walk' },

    { id: 'a23', dayId: 'd6', time: '07:30', title: '长白山北坡集散中心换乘', category: 'traffic', location: '池北区二道白河大街南端', note: '提前预约池北区集散中心的入园时段，在镇南换乘接驳车，上主峰再转倒站车。', costs: [{ id: 'c21', title: '门票 / 环保车 / 倒站车', amount: 610 }], duration: '30分钟', durationMinutes: 30, geo: { lat: 42.397, lng: 128.127 }, travelMode: 'charter' },
    { id: 'a24', dayId: 'd6', time: '10:15', title: '长白山天池', category: 'sight', location: '长白山主峰', note: '天气允许时优先上主峰，山顶风大，注意防风保暖。', costs: [], duration: '2小时', durationMinutes: 120, geo: tianchi, travelMode: 'charter', sourceWishId: 'w-tianchi' },
    { id: 'a25', dayId: 'd6', time: '13:00', title: '长白瀑布 · 聚龙温泉 · 绿渊潭', category: 'sight', location: '长白山北景区', note: '按景区接驳安排游览瀑布、温泉群和绿渊潭，傍晚返回二道白河。', costs: [{ id: 'c22', title: '温泉鸡蛋等简餐', amount: 40 }], duration: '2.5小时', durationMinutes: 150, geo: changbaiWaterfall, travelMode: 'charter', sourceWishId: 'w-waterfall' },
    { id: 'a26', dayId: 'd6', time: '18:30', title: '长白山珍铁锅炖', category: 'food', location: '二道白河镇', costs: [{ id: 'c23', title: '晚餐', amount: 190 }], duration: '1.5小时', durationMinutes: 90, geo: { lat: 42.43, lng: 128.117 }, travelMode: 'charter' },

    { id: 'a27', dayId: 'd7', time: '08:30', title: '自驾前往辉南龙湾群', category: 'traffic', location: '二道白河 → 辉南金川镇', note: '从二道白河向西，经抚松、靖宇方向前往龙湾群，国庆首日为堵车预留时间。', costs: [{ id: 'c24', title: '油费 / 过路费', amount: 280 }], duration: '自驾约3小时', durationMinutes: 180, geo: { lat: 42.369, lng: 126.43 }, travelMode: 'drive' },
    { id: 'a28', dayId: 'd7', time: '13:00', title: '三角龙湾火山口湖赏秋', category: 'sight', location: '辉南县金川镇龙湾景区', note: '沿火山口湖步道看红枫彩林，游船视天气和运营安排选择。', costs: [{ id: 'c25', title: '门票 / 船票', amount: 140 }], duration: '3小时', durationMinutes: 180, geo: longwan, travelMode: 'walk', sourceWishId: 'w-longwan' },
    { id: 'a29', dayId: 'd7', time: '17:30', title: '龙湾山野炖菜晚餐', category: 'food', location: '辉南县金川镇', costs: [{ id: 'c26', title: '晚餐', amount: 180 }], duration: '1.5小时', durationMinutes: 90, geo: { lat: 42.356, lng: 126.382 }, travelMode: 'drive' },
    { id: 'a30', dayId: 'd7', time: '19:30', title: '入住辉南金川镇民宿', category: 'stay', location: '辉南县金川镇', costs: [{ id: 'c27', title: '住宿', amount: 400 }], duration: '1晚', durationMinutes: 600, geo: { lat: 42.352, lng: 126.375 }, travelMode: 'walk' },

    { id: 'a31', dayId: 'd8', time: '08:30', title: '自驾前往吉林市', category: 'traffic', location: '辉南 → 吉林市', note: '沿环线西侧经辉南、磐石方向北上，抵达松花江畔老城。', costs: [{ id: 'c28', title: '油费 / 过路费', amount: 280 }], duration: '自驾约2.5小时', durationMinutes: 150, geo: { lat: 43.843, lng: 126.545 }, travelMode: 'drive' },
    { id: 'a32', dayId: 'd8', time: '13:30', title: '吉林北山公园 · 松花江畔', category: 'sight', location: '吉林市船营区', note: '登揽月亭俯瞰江城，随后沿同岸步道散步。', costs: [], duration: '2.5小时', durationMinutes: 150, geo: { lat: 43.86, lng: 126.55 }, travelMode: 'walk' },
    { id: 'a33', dayId: 'd8', time: '17:30', title: '乌拉满族火锅', category: 'food', location: '吉林市船营区', costs: [{ id: 'c29', title: '晚餐', amount: 200 }], duration: '1.5小时', durationMinutes: 90, geo: { lat: 43.846, lng: 126.56 }, travelMode: 'walk' },
    { id: 'a34', dayId: 'd8', time: '19:30', title: '入住吉林市松花江畔酒店', category: 'stay', location: '吉林市船营区', costs: [{ id: 'c30', title: '住宿', amount: 460 }], duration: '1晚', durationMinutes: 600, geo: { lat: 43.841, lng: 126.552 }, travelMode: 'walk' },

    { id: 'a35', dayId: 'd9', time: '09:00', title: '自驾前往长春', category: 'traffic', location: '吉林市 → 长春', note: '沿珲乌高速向西，先到长春东南侧的净月潭。', costs: [{ id: 'c31', title: '油费 / 过路费', amount: 200 }], duration: '自驾约1.5小时', durationMinutes: 90, geo: { lat: 43.8011, lng: 125.4443 }, travelMode: 'drive' },
    { id: 'a36', dayId: 'd9', time: '11:00', title: '净月潭国家森林公园', category: 'sight', location: '长春市南关区净月大街', note: '选近岸步道或一段观光车路线，下午继续向城区北部走。', costs: [{ id: 'c32', title: '门票 / 观光车', amount: 100 }], duration: '2小时', durationMinutes: 120, geo: { lat: 43.7821, lng: 125.4604 }, travelMode: 'drive' },
    { id: 'a38', dayId: 'd9', time: '14:00', title: '桂林路小吃街午餐', category: 'food', location: '长春市朝阳区桂林路', costs: [{ id: 'c34', title: '餐饮 / 小吃', amount: 160 }], duration: '1小时', durationMinutes: 60, geo: { lat: 43.8635, lng: 125.3175 }, travelMode: 'drive' },
    { id: 'a37', dayId: 'd9', time: '15:30', title: '伪满皇宫博物院', category: 'sight', location: '长春市宽城区光复北路5号', note: '从桂林路向城区北侧走，提前确认预约和当日停止入馆时间。', costs: [{ id: 'c33', title: '门票', amount: 140 }], duration: '2小时', durationMinutes: 120, geo: { lat: 43.9036, lng: 125.3422 }, travelMode: 'drive' },
    { id: 'a39', dayId: 'd9', time: '18:30', title: '入住长春站北侧酒店', category: 'stay', location: '长春市宽城区', note: '晚餐就近安排，次日便于向哈尔滨方向出城。', costs: [{ id: 'c35', title: '住宿', amount: 480 }], duration: '1晚', durationMinutes: 600, geo: { lat: 43.9082, lng: 125.3178 }, travelMode: 'drive' },

    { id: 'a40', dayId: 'd10', time: '09:00', title: '自驾返回哈尔滨', category: 'traffic', location: '长春 → 哈尔滨', note: '沿京哈高速北返，先到南岗区采购，再向西去机场。', costs: [{ id: 'c36', title: '油费 / 过路费', amount: 340 }], duration: '自驾约3小时', durationMinutes: 180, geo: { lat: 45.7568, lng: 126.6438 }, travelMode: 'drive' },
    { id: 'a41', dayId: 'd10', time: '13:00', title: '果戈里大街 · 秋林俄式伴手礼采购', category: 'shop', location: '哈尔滨市南岗区果戈里大街', note: '采购红肠、大列巴等伴手礼，按航班时间控制停留。', costs: [{ id: 'c37', title: '伴手礼', amount: 240 }], duration: '1.5小时', durationMinutes: 90, geo: { lat: 45.7582, lng: 126.6438 }, travelMode: 'walk' },
    { id: 'a42', dayId: 'd10', time: '16:30', title: '哈尔滨太平国际机场还车返程', category: 'traffic', location: '哈尔滨太平国际机场', note: '50分钟为估算车程，另留补油、还车验车、值机和安检时间，返程选晚班机。', costs: [{ id: 'c38', title: '还车补油 / 机场高速', amount: 200 }], duration: '50分钟', durationMinutes: 50, geo: harbinAirport, travelMode: 'drive' },
  ],
  wishPlaces: [
    { id: 'w-hengdao', title: '中东铁路机车库 · 俄罗斯老街', category: 'sight', location: '海林市横道河子镇', note: '已安排第2天；百年铁路小镇代表点。', geo: hengdaoRailway, scheduledActivityIds: ['a7'] },
    { id: 'w-jingpo', title: '吊水楼瀑布 · 火山熔岩台地', category: 'sight', location: '牡丹江镜泊湖景区', note: '已安排第3天；从北门进入景区，沿火山台地步道赏瀑。', geo: jingpoWaterfall, scheduledActivityIds: ['a11'] },
    { id: 'w-ximarket', title: '延吉西市场朝鲜族特产采购', category: 'shop', location: '延吉市参花街819号', note: '已安排第4天下午，可集中挑选朝鲜族特产。', geo: yanjiWestMarket, scheduledActivityIds: ['a16'] },
    { id: 'w-shuishang', title: '延吉水上市场早市', category: 'shop', location: '延吉市参花街2599号', note: '延吉清晨备选，可在参花街新址尝打糕、米肠。', geo: yanjiMarket },
    { id: 'w-tianchi', title: '长白山天池', category: 'sight', location: '长白山北景区', note: '已安排第6天；根据风力和能见度调整游览顺序。', geo: tianchi, scheduledActivityIds: ['a24'] },
    { id: 'w-waterfall', title: '长白瀑布 · 聚龙温泉', category: 'sight', location: '长白山北景区', note: '已安排第6天；与天池同日游览。', geo: changbaiWaterfall, scheduledActivityIds: ['a25'] },
    { id: 'w-longwan', title: '三角龙湾火山口湖', category: 'sight', location: '辉南县金川镇龙湾景区', note: '已安排第7天；沿湖赏秋，游船视天气选择。', geo: longwan, scheduledActivityIds: ['a28'] },
    { id: 'w-magic', title: '魔界风景区', category: 'sight', location: '安图县二道白河镇红丰村', note: '二道白河清晨摄影备选，可根据天气看晨雾和倒影。', geo: { lat: 42.339, lng: 128.196 } },
    { id: 'w-tram54', title: '54路有轨电车秋景（红旗街）', category: 'sight', location: '长春市朝阳区红旗街', note: '长春时间充裕时可替换桂林路停留，留出博物院入馆时间。', geo: { lat: 43.8673, lng: 125.2917 } },
  ],
}
