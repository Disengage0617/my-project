const cloud = require("wx-server-sdk");

const env = process.env.WX_CLOUD_ENV || process.env.TCB_ENV || cloud.DYNAMIC_CURRENT_ENV;
cloud.init({ env });

const db = cloud.database();

const STORE_ID = "store_demo_001";
const NOW = new Date().toISOString();

const TABLE_GROUPS = [
  { prefix: "A", count: 12, area: "普台区", type: "普台", tableType: "standard", tableTypeName: "普台" },
  { prefix: "B", count: 10, area: "银腿区", type: "乔氏银腿", tableType: "silver", tableTypeName: "乔氏银腿" },
  { prefix: "C", count: 8, area: "独牙区", type: "独牙", tableType: "duya", tableTypeName: "独牙" },
  { prefix: "D", count: 6, area: "金腿区", type: "乔氏金腿", tableType: "gold", tableTypeName: "乔氏金腿" },
  { prefix: "E", count: 4, area: "玫瑰金区", type: "乔氏玫瑰金", tableType: "rose_gold", tableTypeName: "乔氏玫瑰金" }
];

const TABLE_TYPE_PRICES = {
  standard: { offPeak: 2800, day: 3800, night: 5800 },
  silver: { offPeak: 3800, day: 4800, night: 6800 },
  duya: { offPeak: 4800, day: 5800, night: 8800 },
  gold: { offPeak: 5800, day: 7800, night: 10800 },
  rose_gold: { offPeak: 6800, day: 9800, night: 12800 }
};

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function withMeta(data) {
  return {
    ...data,
    created_at: data.created_at || NOW,
    updated_at: NOW,
    seeded_by: "cloudfunctions/api/scripts/seed.js"
  };
}

async function setDoc(collectionName, id, data) {
  const { _id, ...docData } = data;
  await db.collection(collectionName).doc(id).set({ data: withMeta(docData) });
  return id;
}

function buildTables() {
  const tables = [];
  let sortOrder = 1;

  for (const group of TABLE_GROUPS) {
    for (let index = 1; index <= group.count; index += 1) {
      const code = `${group.prefix}${String(index).padStart(2, "0")}`;
      tables.push({
        _id: `${STORE_ID}_table_${code}`,
        store_id: STORE_ID,
        code,
        area: group.area,
        type: group.type,
        status: "空闲",
        enabled: true,
        table_no: code,
        table_type: group.tableType,
        table_type_name: group.tableTypeName,
        area_name: group.area,
        sort_order: sortOrder,
        remark: "MVP 初始化桌台"
      });
      sortOrder += 1;
    }
  }

  return tables;
}

function buildPriceRules() {
  const segments = [
    { key: "off_peak", label: "凌晨优惠", start: "00:00", end: "08:00", priceKey: "offPeak" },
    { key: "day", label: "日间标准", start: "08:00", end: "18:00", priceKey: "day" },
    { key: "night", label: "晚间黄金", start: "18:00", end: "24:00", priceKey: "night" }
  ];

  return segments.map((segment, index) => ({
    _id: `${STORE_ID}_price_${segment.key}`,
    store_id: STORE_ID,
    name: segment.label,
    target_type: "table",
    table_type: "all",
    table_type_name: "全部桌型",
    start_time_of_day: segment.start,
    end_time_of_day: segment.end,
    unit: "hour",
    member_level: "normal",
    enabled: true,
    sort_order: index + 1,
    prices_by_table_type: Object.fromEntries(
      Object.entries(TABLE_TYPE_PRICES).map(([tableType, prices]) => [tableType, prices[segment.priceKey]])
    ),
    price_cent: TABLE_TYPE_PRICES.standard[segment.priceKey],
    remark: "price_cent 为普台价格，完整桌型价格见 prices_by_table_type"
  }));
}

function buildAssistants() {
  return [
    {
      _id: `${STORE_ID}_assistant_001`,
      store_id: STORE_ID,
      name: "小乔",
      avatar_url: "",
      tags: ["新手教学", "姿势纠正", "陪练"],
      intro: "适合新手入门、基础杆法和规则讲解。",
      service_price_cent: 8800,
      service_unit: "hour",
      status: "空闲",
      status_code: "idle",
      enabled: true,
      sort: 1,
      sort_order: 1
    },
    {
      _id: `${STORE_ID}_assistant_002`,
      store_id: STORE_ID,
      name: "阿宁",
      avatar_url: "",
      tags: ["进阶陪练", "走位训练", "比赛节奏"],
      intro: "适合有基础玩家提升准度、走位和比赛策略。",
      service_price_cent: 10800,
      service_unit: "hour",
      status: "空闲",
      status_code: "idle",
      enabled: true,
      sort: 2,
      sort_order: 2
    }
  ];
}

function buildCampaigns() {
  return [
    {
      _id: `${STORE_ID}_campaign_new_user`,
      store_id: STORE_ID,
      title: "新人首练 2 小时特惠",
      cover_url: "",
      campaign_type: "new_user",
      start_time: NOW,
      end_time: addDays(30),
      content: "新用户首次到店可享 2 小时普台体验价，适合朋友组局和入门体验。",
      rules: "每个手机号限参与 1 次；需提前预约；不可与其他优惠同享。",
      quota_limited: true,
      quota_total: 100,
      quota_used: 0,
      quota: 100,
      registered_count: 0,
      need_review: false,
      member_only: false,
      status: "已发布",
      status_code: "published",
      sort_order: 1
    },
    {
      _id: `${STORE_ID}_campaign_weekend_match`,
      store_id: STORE_ID,
      title: "周末 8 人让局赛",
      cover_url: "",
      campaign_type: "match",
      start_time: addDays(3),
      end_time: addDays(10),
      content: "周末小型交流赛，按水平让局，冠军赠送储值卡和助教陪练券。",
      rules: "限 8 人报名；报名后需员工审核；迟到 15 分钟视为放弃资格。",
      quota_limited: true,
      quota_total: 8,
      quota_used: 0,
      quota: 8,
      registered_count: 0,
      need_review: true,
      member_only: false,
      status: "已发布",
      status_code: "published",
      sort_order: 2
    }
  ];
}

async function seed() {
  const tables = buildTables();
  const priceRules = buildPriceRules();
  const assistants = buildAssistants();
  const campaigns = buildCampaigns();

  await setDoc("store", STORE_ID, {
    _id: STORE_ID,
    name: "星火台球俱乐部",
    address: "示例市示例区私域运营街 001 号",
    phone: "18800000001",
    business_hours: "24小时营业",
    business_hours_config: { mode: "24h" },
    table_count: tables.length,
    reservation_lead_minutes: 30,
    no_show_lock_days: 3,
    booking_rule: {
      min_advance_minutes: 30,
      hold_minutes: 15,
      min_duration_minutes: 60,
      max_duration_minutes: 240,
      slot_step_minutes: 30,
      no_show_ban_days: 3,
      allow_user_cancel: false
    },
    status: "active"
  });

  for (const table of tables) {
    await setDoc("billiard_table", table._id, table);
  }

  for (const rule of priceRules) {
    await setDoc("price_rule", rule._id, rule);
  }

  for (const assistant of assistants) {
    await setDoc("assistant", assistant._id, assistant);
  }

  for (const campaign of campaigns) {
    await setDoc("campaign", campaign._id, campaign);
  }

  return {
    store: STORE_ID,
    tables: tables.length,
    priceRules: priceRules.length,
    assistants: assistants.length,
    campaigns: campaigns.length
  };
}

seed()
  .then((summary) => {
    console.log("Seed completed:", JSON.stringify(summary, null, 2));
  })
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  });
