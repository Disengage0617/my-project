const { RESERVATION_STATUS, TABLE_STATUS, ASSISTANT_STATUS } = require("./constants");

const store = {
  id: "store_demo_001",
  name: "星火台球俱乐部",
  businessHours: "24小时营业",
  reservationLeadMinutes: 30,
  noShowLockDays: 3,
  tableCount: 3
};

const tables = [
  { id: "table_demo_001", code: "A01", area: "大厅区", type: "普台", status: TABLE_STATUS.FREE, price: 38 },
  { id: "table_demo_002", code: "A02", area: "大厅区", type: "普台", status: TABLE_STATUS.FREE, price: 38 },
  { id: "table_demo_003", code: "B01", area: "银腿区", type: "乔氏银腿", status: TABLE_STATUS.RESERVED, price: 48 }
];

const assistants = [
  { id: "assistant_demo_001", name: "小周", tagsText: "走位、入门陪练", intro: "适合新手找准站姿和出杆节奏。", status: ASSISTANT_STATUS.FREE, price: 80 },
  { id: "assistant_demo_002", name: "阿林", tagsText: "进阶、比赛陪练", intro: "适合练习走位、控球和连续得分。", status: ASSISTANT_STATUS.SERVING, price: 120 },
  { id: "assistant_demo_003", name: "小雅", tagsText: "规则讲解、女性陪练", intro: "适合轻松体验和规则入门。", status: ASSISTANT_STATUS.FREE, price: 100 }
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
    rule: "面向新手和轻度玩家，现场按水平分组，不收报名费。"
  },
  {
    id: "campaign_demo_002",
    title: "玫瑰金区会员练习夜",
    quota: 16,
    registeredCount: 16,
    needReview: true,
    statusText: "需审核",
    timeText: "每周三 20:00",
    rule: "会员优先，报名后由门店确认名额。"
  }
];

const reservations = [
  {
    id: "reservation_demo_001",
    tableId: "table_demo_001",
    tableCode: "A01",
    tableType: "普台",
    userName: "陈先生",
    startTime: "20:00",
    endTime: "22:00",
    status: RESERVATION_STATUS.WAITING_REVIEW,
    assistantId: "assistant_demo_001",
    assistantName: "小周",
    assistantText: "助教 小周"
  },
  {
    id: "reservation_demo_002",
    tableId: "table_demo_002",
    tableCode: "A02",
    tableType: "普台",
    userName: "李女士",
    startTime: "22:30",
    endTime: "23:30",
    status: RESERVATION_STATUS.WAITING_ARRIVAL,
    assistantId: "",
    assistantName: "",
    assistantText: ""
  }
];

const noShowLocks = [
  {
    id: "lock_demo_001",
    userName: "王先生",
    reservationId: "reservation_demo_003",
    reason: "预约未到店",
    status: "限制中",
    lockUntilText: "3 天后"
  }
];

function getOverview() {
  return {
    store,
    freeTableCount: tables.filter((item) => item.status === TABLE_STATUS.FREE).length,
    freeAssistantCount: assistants.filter((item) => item.status === ASSISTANT_STATUS.FREE).length,
    campaigns: campaigns.slice(0, 2)
  };
}

module.exports = {
  store,
  tables,
  assistants,
  campaigns,
  reservations,
  noShowLocks,
  getOverview
};
