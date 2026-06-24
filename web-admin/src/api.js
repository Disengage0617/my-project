const STORE_ID = "store_demo_001";

const state = {
  env: {
    mode: "mock",
    storeId: STORE_ID,
    envId: "",
    operator: "Demo Manager"
  },
  store: {
    _id: STORE_ID,
    name: "星火台球俱乐部",
    address: "示例市示例区私域运营街 001 号",
    phone: "18800000001",
    business_hours: "24小时营业",
    table_count: 40,
    reservation_lead_minutes: 30,
    no_show_lock_days: 3,
    booking_rule: {
      min_advance_minutes: 30,
      hold_minutes: 15,
      min_duration_minutes: 60,
      max_duration_minutes: 240,
      no_show_ban_days: 3
    },
    status: "active"
  },
  tables: [
    { _id: "store_demo_001_table_A01", table_no: "A01", table_type: "standard", table_type_name: "普台", area_name: "普台区", status: "idle", enabled: true, price_cent: 3800 },
    { _id: "store_demo_001_table_A02", table_no: "A02", table_type: "standard", table_type_name: "普台", area_name: "普台区", status: "idle", enabled: true, price_cent: 3800 },
    { _id: "store_demo_001_table_B01", table_no: "B01", table_type: "silver", table_type_name: "乔氏银腿", area_name: "银腿区", status: "reserved", enabled: true, price_cent: 4800 },
    { _id: "store_demo_001_table_C01", table_no: "C01", table_type: "duya", table_type_name: "独牙", area_name: "独牙区", status: "in_use", enabled: true, price_cent: 5800 }
  ],
  priceRules: [
    { _id: "price_day", name: "日间标准", target_type: "table", table_type: "standard", table_type_name: "普台", start_time_of_day: "08:00", end_time_of_day: "18:00", price_cent: 3800, unit: "hour", enabled: true },
    { _id: "price_night", name: "晚间黄金", target_type: "table", table_type: "standard", table_type_name: "普台", start_time_of_day: "18:00", end_time_of_day: "24:00", price_cent: 5800, unit: "hour", enabled: true },
    { _id: "assistant_base", name: "助教基础价", target_type: "assistant", table_type_name: "助教服务", price_cent: 8000, unit: "hour", enabled: true }
  ],
  assistants: [
    { _id: "assistant_001", name: "小乔", level: "初级", tags: ["新手教学", "陪练"], intro: "适合新手入门。", service_price_cent: 8000, status: "idle", enabled: true, avatar_url: "/assets/generated/assistant-thumb.jpg" },
    { _id: "assistant_002", name: "小雅", level: "中级", tags: ["控球训练", "连续得分"], intro: "适合提升控球稳定性。", service_price_cent: 12800, status: "idle", enabled: true, avatar_url: "/assets/generated/billiards-bg-option-5-coach.png" },
    { _id: "assistant_003", name: "Mia", level: "高级", tags: ["清台训练", "会员局"], intro: "适合高阶陪练。", service_price_cent: 22800, status: "resting", enabled: true, avatar_url: "/assets/generated/assistant-coach-card.jpg" }
  ],
  campaigns: [
    { _id: "campaign_new_user", title: "新人首练 2 小时特惠", campaign_type: "new_user", start_time: "2026-06-14T10:00:00+08:00", end_time: "2026-07-14T23:59:00+08:00", quota_limited: true, quota_total: 100, quota_used: 12, need_review: false, status: "published", cover_url: "/assets/generated/billiards-bg-option-2.png", content: "新用户首次到店体验价。", rules: "每个手机号限参与 1 次。" },
    { _id: "campaign_weekend_match", title: "周末 8 人让局赛", campaign_type: "match", start_time: "2026-06-20T19:30:00+08:00", end_time: "2026-06-20T23:00:00+08:00", quota_limited: true, quota_total: 8, quota_used: 3, need_review: true, status: "published", cover_url: "/assets/generated/billiards-bg-option-4.png", content: "按水平让局的小型交流赛。", rules: "报名后需员工审核。" }
  ],
  reservations: [
    { _id: "reservation_001", table_id: "store_demo_001_table_A01", tableCode: "A01", tableType: "普台", start_time: "2026-06-14T19:40:00+08:00", end_time: "2026-06-14T20:40:00+08:00", nickname: "陈先生", phone: "13800000001", status: "pending_arrival" },
    { _id: "reservation_002", table_id: "store_demo_001_table_B01", tableCode: "B01", tableType: "乔氏银腿", start_time: "2026-06-14T20:00:00+08:00", end_time: "2026-06-14T22:00:00+08:00", nickname: "李女士", phone: "13800000002", status: "pending_verify" }
  ],
  customers: [
    { _id: "customer_001", nickname: "陈先生", phone: "13800000001", reservation_count: 3, completed_count: 2, campaign_count: 1, no_show_count: 0, last_arrival_at: "2026-06-13" },
    { _id: "customer_002", nickname: "李女士", phone: "13800000002", reservation_count: 5, completed_count: 5, campaign_count: 2, no_show_count: 0, last_arrival_at: "2026-06-12" }
  ],
  registrations: [
    { _id: "registration_001", campaign_id: "campaign_weekend_match", nickname: "陈先生", phone: "13800000001", participant_count: 1, status: "pending_review", created_at: "2026-06-14T12:20:00+08:00" }
  ],
  noShowRecords: [
    { _id: "lock_001", nickname: "王先生", phone: "13800000003", reason: "预约未到店", status: "active", locked_until: "2026-06-17T22:00:00+08:00" }
  ],
  assets: [
    { _id: "asset_hero", name: "首页 Hero", type: "hero", url: "/assets/generated/billiards-bg-option-1.png", status: "active" },
    { _id: "asset_activity", name: "店内活动", type: "campaign", url: "/assets/generated/billiards-bg-option-2.png", status: "active" },
    { _id: "asset_event", name: "赛事封面", type: "campaign", url: "/assets/generated/billiards-bg-option-4.png", status: "active" },
    { _id: "asset_coach", name: "助教封面", type: "assistant", url: "/assets/generated/assistant-coach-card.jpg", status: "active" }
  ],
  pageConfig: {
    page_key: "home",
    status: "published",
    theme: { primary_color: "#18d6a3", accent_color: "#e6c15d", background_style: "dark-neon" },
    modules: [
      { id: "hero", type: "hero", enabled: true, sort_order: 1, title: "星火台球俱乐部", subtitle: "24小时营业 · 到店后员工核实开台", image_url: "/assets/generated/billiards-bg-option-1.png", cta_text: "立即预约桌台" },
      { id: "activities", type: "activity_entry", enabled: true, sort_order: 2, title: "店内活动", subtitle: "赛事、练习局和会员活动", image_url: "/assets/generated/billiards-bg-option-2.png" },
      { id: "coach", type: "assistant_entry", enabled: true, sort_order: 3, title: "助理教练", subtitle: "查看状态与价格", image_url: "/assets/generated/assistant-coach-card.jpg" },
      { id: "event_feature", type: "event_feature", enabled: true, sort_order: 4, title: "暗夜霓虹排位赛", subtitle: "今晚开放报名 · 名额 3 / 8", image_url: "/assets/generated/billiards-bg-option-4.png", tag: "报名中" }
    ]
  },
  auditLogs: []
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function addAudit(action, targetType, targetId, after) {
  state.auditLogs.unshift({
    _id: `audit_${Date.now()}`,
    action,
    target_type: targetType,
    target_id: targetId,
    operator_role: "manager",
    after,
    created_at: new Date().toISOString()
  });
}

function upsert(list, id, payload) {
  const index = list.findIndex((item) => item._id === id);
  const next = { ...(index >= 0 ? list[index] : {}), ...payload, _id: id };
  if (index >= 0) list[index] = next;
  else list.unshift(next);
  return next;
}

export async function call(action, payload = {}) {
  await new Promise((resolve) => setTimeout(resolve, 120));
  const storeId = payload.storeId || state.env.storeId;
  const handlers = {
    getAdminDashboard: () => {
      const waiting = state.reservations.filter((item) => item.status === "pending_verify").length;
      const enabledAssistants = state.assistants.filter((item) => item.enabled);
      const assistantOnClockStatuses = ["in_service", "working", "busy", "on_clock", "serving"];
      const assistantOnClockCount = enabledAssistants.filter((item) => assistantOnClockStatuses.includes(item.status)).length;
      return {
        overview: {
          store: state.store,
          freeTableCount: state.tables.filter((item) => item.status === "idle" && item.enabled).length,
          freeAssistantCount: state.assistants.filter((item) => item.status === "idle" && item.enabled).length
        },
        metrics: {
          reservation_count: state.reservations.length,
          waiting_review_count: waiting,
          customer_count: state.customers.length,
          campaign_registration_count: state.registrations.length,
          no_show_active_count: state.noShowRecords.filter((item) => item.status === "active").length,
          free_table_count: state.tables.filter((item) => item.status === "idle" && item.enabled).length,
          free_assistant_count: state.assistants.filter((item) => item.status === "idle" && item.enabled).length,
          assistant_on_clock_count: assistantOnClockCount,
          assistant_not_on_clock_count: Math.max(enabledAssistants.length - assistantOnClockCount, 0)
        },
        recentReservations: state.reservations.slice(0, 8),
        recentAuditLogs: state.auditLogs.slice(0, 8)
      };
    },
    getStoreDetail: () => clone(state.store),
    manageStore: () => {
      state.store = { ...state.store, ...(payload.payload || {}) };
      addAudit("manageStore", "store", storeId, state.store);
      return { item: clone(state.store) };
    },
    manageTables: () => {
      if (payload.action === "list") return { items: clone(state.tables) };
      const id = payload.tableId || payload.table_id || payload.payload?._id || `table_${Date.now()}`;
      const item = upsert(state.tables, id, payload.payload || {});
      addAudit(`manageTables:${payload.action || "upsert"}`, "billiard_table", id, item);
      return { item: clone(item) };
    },
    getPriceRules: () => ({ rules: clone(state.priceRules), items: clone(state.priceRules) }),
    managePriceRules: () => {
      const id = payload.priceRuleId || payload.price_rule_id || payload.payload?._id || `price_${Date.now()}`;
      const item = upsert(state.priceRules, id, payload.payload || {});
      addAudit(`managePriceRules:${payload.action || "upsert"}`, "price_rule", id, item);
      return { item: clone(item) };
    },
    getAssistants: () => ({ list: clone(state.assistants), items: clone(state.assistants) }),
    manageAssistants: () => {
      const id = payload.assistantId || payload.assistant_id || payload.payload?._id || `assistant_${Date.now()}`;
      const item = upsert(state.assistants, id, payload.payload || {});
      addAudit(`manageAssistants:${payload.action || "upsert"}`, "assistant", id, item);
      return { assistant: clone(item), item: clone(item) };
    },
    getCampaigns: () => ({ list: clone(state.campaigns), items: clone(state.campaigns), total: state.campaigns.length }),
    manageCampaigns: () => {
      const id = payload.campaignId || payload.campaign_id || payload.payload?._id || `campaign_${Date.now()}`;
      const item = upsert(state.campaigns, id, { ...(payload.payload || {}), status: payload.action === "publish" ? "published" : payload.action === "offline" ? "offline" : payload.payload?.status || "draft" });
      addAudit(`manageCampaigns:${payload.action || "upsert"}`, "campaign", id, item);
      return { campaign: clone(item), item: clone(item) };
    },
    getAdminReservations: () => ({ items: clone(state.reservations), total: state.reservations.length }),
    getCustomers: () => ({ items: clone(state.customers), total: state.customers.length }),
    getCampaignRegistrations: () => ({ items: clone(state.registrations), total: state.registrations.length }),
    getNoShowRecords: () => ({ items: clone(state.noShowRecords), total: state.noShowRecords.length }),
    getAuditLogs: () => ({ items: clone(state.auditLogs), total: state.auditLogs.length }),
    getAssets: () => ({ items: clone(state.assets), total: state.assets.length }),
    manageAssets: () => {
      const id = payload.assetId || payload.asset_id || payload.payload?._id || `asset_${Date.now()}`;
      if (payload.action === "delete") {
        const index = state.assets.findIndex((item) => item._id === id);
        const deleted = index >= 0 ? state.assets.splice(index, 1)[0] : null;
        addAudit("manageAssets:delete", "asset", id, deleted);
        return { ok: true, asset: deleted ? clone(deleted) : null };
      }
      const item = upsert(state.assets, id, { status: "active", ...(payload.payload || {}) });
      addAudit(`manageAssets:${payload.action || "upsert"}`, "asset", id, item);
      return { asset: clone(item), item: clone(item) };
    },
    getPageConfig: () => ({ config: clone(state.pageConfig) }),
    managePageConfig: () => {
      state.pageConfig = { ...state.pageConfig, ...(payload.payload || {}), status: payload.action === "saveDraft" ? "draft" : "published" };
      addAudit(`managePageConfig:${payload.action || "publish"}`, "page_config", "home", state.pageConfig);
      return { config: clone(state.pageConfig) };
    }
  };
  if (!handlers[action]) return { ok: true };
  return handlers[action]();
}

export function getRuntimeConfig() {
  return clone(state.env);
}

export function updateRuntimeConfig(patch) {
  state.env = { ...state.env, ...patch };
  return getRuntimeConfig();
}
