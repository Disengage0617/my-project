const { RESERVATION_STATUS, ASSISTANT_STATUS } = require("./constants.js");

const store = {
  id: "store_demo_001",
  name: "星火台球俱乐部",
  businessHours: "24小时营业",
  reservationLeadMinutes: 30,
  noShowLockDays: 3,
  tableCount: 40,
  phone: "0791-88888888",
  address: "南昌市红谷滩区示范路 88 号"
};

const tables = buildTables();

const assistants = [
  {
    id: "assistant_demo_001",
    name: "Kane",
    level: "职业教练",
    tagsText: "精准提升、定位控球",
    intro: "擅长准度提升和线路规划，适合想快速建立稳定出杆的玩家。",
    status: ASSISTANT_STATUS.FREE,
    price: 268,
    rating: "5.0",
    bookingCount: 1289,
    avatar_url: "/assets/generated/assistant-thumb.jpg",
    photo_url: "/assets/generated/assistant-thumb.jpg",
    thumb_url: "/assets/generated/assistant-thumb.jpg"
  },
  {
    id: "assistant_demo_002",
    name: "Vivi",
    level: "职业教练",
    tagsText: "杆法运用、进攻技巧",
    intro: "擅长杆法和进攻节奏，适合提升连续得分能力。",
    status: ASSISTANT_STATUS.SERVING,
    price: 238,
    rating: "4.9",
    bookingCount: 956,
    avatar_url: "/assets/generated/assistant-coach-card.jpg",
    photo_url: "/assets/generated/assistant-coach-card.jpg",
    thumb_url: "/assets/generated/assistant-coach-card.jpg"
  },
  {
    id: "assistant_demo_003",
    name: "Leo",
    level: "职业教练",
    tagsText: "防守反击、心理策略",
    intro: "擅长攻防转换和比赛策略，适合备赛和进阶玩家。",
    status: ASSISTANT_STATUS.FREE,
    price: 208,
    rating: "4.8",
    bookingCount: 789,
    avatar_url: "/assets/generated/assistant-thumb.jpg",
    photo_url: "/assets/generated/assistant-thumb.jpg",
    thumb_url: "/assets/generated/assistant-thumb.jpg"
  },
  {
    id: "assistant_demo_004",
    name: "Mika",
    level: "职业教练",
    tagsText: "母球控制、组合球",
    intro: "擅长母球控制和组合球处理，适合想打得更细的玩家。",
    status: ASSISTANT_STATUS.FREE,
    price: 198,
    rating: "4.8",
    bookingCount: 612,
    avatar_url: "/assets/generated/assistant-coach-card.jpg",
    photo_url: "/assets/generated/assistant-coach-card.jpg",
    thumb_url: "/assets/generated/assistant-coach-card.jpg"
  }
];

const campaigns = [
  {
    id: "campaign_demo_001",
    title: "周末新手交流赛",
    quota: 32,
    registeredCount: 12,
    needReview: false,
    statusText: "直接报名",
    timeText: "本周六 19:30",
    rule: "面向新手和轻度玩家，现场按水平分组。"
  },
  {
    id: "campaign_demo_002",
    title: "会员练习日",
    quota: 16,
    registeredCount: 16,
    needReview: true,
    statusText: "需审核",
    timeText: "每周三 20:00",
    rule: "会员优先，报名后由门店确认名额。"
  }
];

const priceRules = [
  { id: "price_rule_demo_001", targetType: "table", targetName: "普台", timeRange: "全天", price: 38, enabled: true },
  { id: "price_rule_demo_002", targetType: "table", targetName: "乔氏银腿", timeRange: "全天", price: 48, enabled: true },
  { id: "price_rule_demo_003", targetType: "table", targetName: "独牙", timeRange: "全天", price: 58, enabled: true },
  { id: "price_rule_demo_004", targetType: "table", targetName: "乔氏金腿", timeRange: "全天", price: 78, enabled: true },
  { id: "price_rule_demo_005", targetType: "table", targetName: "乔氏玫瑰金", timeRange: "全天", price: 98, enabled: true },
  { id: "price_rule_demo_006", targetType: "assistant", targetName: "助教服务", timeRange: "全天", price: 80, enabled: true }
];

const reservations = [
  {
    id: "reservation_demo_001",
    tableId: "table_demo_A01",
    tableCode: "A01",
    tableType: "普台",
    userName: "陈先生",
    startTime: "20:00",
    endTime: "22:00",
    status: RESERVATION_STATUS.WAITING_ARRIVAL,
    estimatedAmount: 76,
    assistantId: "assistant_demo_001",
    assistantName: "小周",
    assistantText: "助教 小周"
  },
  {
    id: "reservation_demo_002",
    tableId: "table_demo_A02",
    tableCode: "A02",
    tableType: "普台",
    userName: "李女士",
    startTime: "22:30",
    endTime: "23:30",
    status: RESERVATION_STATUS.WAITING_REVIEW,
    estimatedAmount: 38,
    assistantId: "",
    assistantName: "",
    assistantText: ""
  }
];

const campaignRegistrations = [
  {
    id: "campaign_registration_demo_001",
    campaignId: "campaign_demo_001",
    campaignTitle: "周末新手交流赛",
    nickname: "陈先生",
    phone: "13800000001",
    participantCount: 1,
    status: "报名成功",
    createdAtText: "今天 12:20"
  }
];

const assistantReservations = [
  {
    id: "assistant_reservation_demo_001",
    assistantId: "assistant_demo_001",
    assistantName: "小周",
    userName: "陈先生",
    startTime: "20:00",
    endTime: "21:00",
    status: "待确认"
  }
];

const mineProfile = {
  nickName: "微信用户",
  avatarUrl: "",
  memberLevel: "普通会员",
  phone: "",
  phoneAuthorized: false,
  reservationCount: 3,
  noShowCount: 0
};

const wallet = {
  balanceCent: 0,
  balanceText: "¥0.00",
  storedValueEnabled: true,
  lastUpdatedText: "后台配置后同步"
};

const coupons = [
  { id: "coupon_demo_001", title: "新人练球券", desc: "普台满 2 小时可用", status: "可用", amountText: "20 元", expireText: "7 天后到期" }
];

const orders = [
  { id: "order_demo_001", title: "桌台预约", amountText: "到店结算", status: "待到店", timeText: "今天 19:40" },
  { id: "order_demo_002", title: "助教预约", amountText: "¥80.00", status: "待确认", timeText: "今天 20:00" }
];

const customers = [
  {
    id: "customer_demo_001",
    userId: "user_demo_001",
    nickname: "陈先生",
    phone: "13800000001",
    reservationCount: 3,
    campaignCount: 1,
    noShowCount: 0,
    lastVisitText: "今天"
  }
];

const noShowLocks = [];

const pageConfigs = {
  home: {
    page_key: "home",
    status: "published",
    theme: {
      primary_color: "#18d6a3",
      accent_color: "#e6c15d",
      background_style: "dark-neon"
    },
    modules: [
      {
        id: "hero",
        type: "hero",
        enabled: true,
        sort_order: 1,
        title: "星火台球俱乐部",
        subtitle: "24小时营业，到店后员工核实开台",
        image_url: "/assets/generated/billiards-bg-option-1.png",
        cta_text: "立即预约桌台",
        link: "/pages/reservation/index"
      },
      {
        id: "activities",
        type: "activity_entry",
        enabled: true,
        sort_order: 2,
        title: "店内活动",
        subtitle: "赛事、练习局和会员活动",
        image_url: "/assets/generated/billiards-bg-option-2.png",
        link: "/pages/campaign-list/index"
      }
    ]
  }
};

function buildTables() {
  return [
    ...buildTableGroup({ prefix: "A", count: 12, area: "普台区", type: "普台", typeKey: "standard", price: 38 }),
    ...buildTableGroup({ prefix: "B", count: 10, area: "银腿区", type: "乔氏银腿", typeKey: "silver", price: 48 }),
    ...buildTableGroup({ prefix: "C", count: 8, area: "独牙区", type: "独牙", typeKey: "duya", price: 58 }),
    ...buildTableGroup({ prefix: "D", count: 6, area: "金腿区", type: "乔氏金腿", typeKey: "gold", price: 78 }),
    ...buildTableGroup({ prefix: "E", count: 4, area: "玫瑰金区", type: "乔氏玫瑰金", typeKey: "rose_gold", price: 98 })
  ];
}

function buildTableGroup({ prefix, count, area, type, typeKey, price }) {
  return Array.from({ length: count }, (_, index) => {
    const code = `${prefix}${String(index + 1).padStart(2, "0")}`;
    return {
      id: `table_demo_${code}`,
      _id: `table_demo_${code}`,
      code,
      table_no: code,
      area,
      area_name: area,
      type,
      table_type_name: type,
      typeKey,
      table_type: typeKey,
      status: "idle",
      available: true,
      enabled: true,
      price,
      price_cent: price * 100
    };
  });
}

function getOverview() {
  return {
    store,
    freeTableCount: tables.filter((item) => item.status === "idle").length,
    freeAssistantCount: assistants.filter((item) => item.status === ASSISTANT_STATUS.FREE).length,
    campaigns: campaigns.slice(0, 2)
  };
}

module.exports = {
  store,
  tables,
  assistants,
  campaigns,
  priceRules,
  pageConfigs,
  mineProfile,
  wallet,
  coupons,
  orders,
  reservations,
  campaignRegistrations,
  assistantReservations,
  customers,
  noShowLocks,
  getOverview
};
