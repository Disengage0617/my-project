const mock = require("../utils/mock.js");
const { RESERVATION_STATUS } = require("../utils/constants.js");

function call(name, payload = {}) {
  if (typeof wx === "undefined" || !wx.cloud || !wx.cloud.callFunction) {
    return Promise.resolve().then(() => mockCall(name, payload));
  }

  return wx.cloud.callFunction({
    name: "api",
    data: { action: name, payload }
  }).then((res) => {
    const result = res.result || {};
    if (result.ok === false) {
      if (shouldFallbackToMock(name, result.code)) {
        console.warn(`[api] ${name} fallback to mock: ${result.code}`);
        return mockCall(name, payload);
      }
      throw buildApiError(result);
    }
    return result.data || result;
  });
}

function shouldFallbackToMock(name, code) {
  return code === "ACTION_NOT_FOUND" && READONLY_MOCK_FALLBACK_ACTIONS.indexOf(name) >= 0;
}

function buildApiError(result) {
  const code = result.code || "API_ERROR";
  const message = ERROR_MESSAGES[code] || result.message || result.error || "接口调用失败";
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

const ERROR_MESSAGES = {
  TABLE_REQUIRED: "请先选择桌台",
  INVALID_START_TIME: "预约开始时间无效",
  INVALID_END_TIME: "预约结束时间无效",
  INVALID_TIME: "预约时间无效，请重新选择",
  INVALID_TIME_RANGE: "预约时间范围无效，请重新选择",
  INVALID_PARAMS: "提交信息不完整或格式不正确，请检查后重试",
  INVALID_ACTION: "当前操作暂不支持",
  RESERVATION_TOO_EARLY: "预约时间太近，请至少提前 30 分钟",
  RESERVATION_DURATION_INVALID: "预约时长不符合门店规则",
  RESERVATION_CONFLICT: "该桌台时段已被预约，请更换桌台或时间",
  TABLE_TIME_CONFLICT: "该桌台时段已被预约，请更换桌台或时间",
  TABLE_HAS_ACTIVE_RESERVATION: "该桌台存在有效预约或使用中记录，不能停用",
  ASSISTANT_TIME_CONFLICT: "该助教时段已被预约，请更换助教或时间",
  ASSISTANT_CONFLICT: "该助教时段已被预约，请更换助教或时间",
  NO_SHOW_LOCKED: "当前账号存在爽约限制，暂时不能预约",
  NO_SHOW_BANNED: "当前账号存在爽约限制，暂时不能预约",
  UNAUTHORIZED: "请先登录后再操作",
  FORBIDDEN: "当前账号无权执行该操作",
  STAFF_DISABLED: "员工账号未启用",
  STAFF_NOT_FOUND: "当前账号不是本店员工",
  STORE_NOT_FOUND: "门店不存在或未配置",
  STORE_DISABLED: "门店当前不可用",
  RESOURCE_NOT_FOUND: "记录不存在或已被删除",
  RESOURCE_DISABLED: "资源已停用",
  RESOURCE_UNAVAILABLE: "当前资源不可预约或不可操作",
  RESOURCE_STORE_MISMATCH: "资源不属于当前门店",
  LOCK_BUSY: "当前操作人数较多，请稍后重试",
  INVALID_STATUS: "当前预约状态不支持该操作",
  STATE_TRANSITION_INVALID: "当前状态不支持该流转",
  INVALID_TABLE_STATUS: "桌台状态无效",
  INVALID_ASSISTANT_STATUS: "助教状态无效",
  NOT_FOUND: "记录不存在或已被删除",
  ID_REQUIRED: "缺少记录 ID",
  PHONE_REQUIRED: "请先授权或填写手机号",
  NICKNAME_REQUIRED: "请先授权微信昵称",
  CAMPAIGN_FULL: "活动名额已满",
  DUPLICATE_REGISTRATION: "你已报名该活动，请勿重复提交",
  REASON_REQUIRED: "请填写操作原因",
  NO_AVAILABLE_TABLE: "当前没有可用桌台"
};

const READONLY_MOCK_FALLBACK_ACTIONS = [
  "getMineCenter"
];

function mockCall(name, payload) {
  const tableId = payload.tableId || payload.table_id || (payload.payload && (payload.payload._id || payload.payload.table_id));
  const assistantId = payload.assistantId || payload.assistant_id || (payload.payload && payload.payload._id);
  const campaignId = payload.campaignId || payload.campaign_id || (payload.payload && payload.payload._id);
  const noShowRecordId = payload.noShowRecordId || payload.no_show_record_id;
  const handlers = {
    getStoreOverview: () => mock.getOverview(),
    getStoreDetail: () => mock.store,
    getPriceRules: () => ({ rules: mock.priceRules, items: mock.priceRules }),
    loginByWechat: () => ({
      user: {
        _id: "user_mock_001",
        openid: payload.openid || "mock-openid",
        nickName: payload.nickName || payload.nickname || "微信用户",
        phone: payload.phone || ""
      },
      token: "mock-session-token"
    }),
    authorizePhone: () => ({
      phone: payload.phone || payload.phoneNumber || payload.purePhoneNumber || "13800000000",
      phone_authorized_at: new Date().toISOString()
    }),
    getCurrentRole: () => ({
      role: "manager",
      permissions: ["reservation.write", "table.write", "campaign.write"],
      staff_user: { _id: "staff_mock_001", display_name: "Demo Manager" }
    }),
    getCurrentUser: () => ({ openid: "mock-openid", role: "manager", enabled: true }),
    getDebugContext: () => ({ openid: "mock-openid", appid: "mock-appid", env: "mock-env" }),
    bootstrapMvp: () => ({ storeId: "store_demo_001", managerOpenid: "mock-openid", role: "manager", tables: 3 }),
    validateMvpBootstrap: () => ({ ok: true, passedCount: 11, totalCount: 11, checks: [] }),
    runMvpFlowSmokeTest: () => ({ ok: true, reservationId: "reservation_demo_001", passedCount: 7, totalCount: 7, steps: [] }),
    runMvpGuardSmokeTest: () => ({ ok: true, passedCount: 8, totalCount: 8, steps: [] }),
    getAvailableTables: () => {
      const tableType = payload.tableType || payload.table_type || "";
      const list = mock.tables.filter((item) => {
        if (!tableType) return true;
        return normalizeTableTypeKey(item.typeKey || item.table_type || item.type) === normalizeTableTypeKey(tableType);
      });
      return { list, items: list, tables: list, total: list.length };
    },
    getPageConfig: () => ({ config: mock.pageConfigs.home }),
    getAssistants: () => ({ list: mock.assistants, items: mock.assistants, total: mock.assistants.length }),
    getAssistantDetail: () => mock.assistants.find((item) => item.id === assistantId || item._id === assistantId) || mock.assistants[0],
    getCampaigns: () => ({ list: mock.campaigns }),
    getCampaignDetail: () => mock.campaigns.find((item) => item.id === campaignId || item._id === campaignId) || mock.campaigns[0],
    getCampaignRegistrations: () => {
      const status = payload.status || "";
      const page = Math.max(1, Number(payload.page) || 1);
      const pageSize = Math.max(1, Number(payload.pageSize || payload.page_size) || 20);
      const filtered = mock.campaignRegistrations.filter((item) => {
        const campaignMatched = !campaignId || item.campaignId === campaignId || item.campaign_id === campaignId;
        const statusMatched = !status || item.status === status;
        return campaignMatched && statusMatched;
      });
      const items = paginate(filtered, page, pageSize);
      return { items, total: filtered.length, page, page_size: pageSize };
    },
    getCustomers: () => paginateResult(mock.customers, payload),
    getCustomerProfile: () => mock.customers.find((item) => item.userId === payload.userId || item.user_id === payload.user_id) || mock.customers[0],
    getMineCenter: () => ({
      profile: mock.mineProfile,
      wallet: mock.wallet,
      coupons: mock.coupons,
      orders: mock.orders,
      reservations: mock.reservations,
      assistantReservations: mock.assistantReservations,
      campaignRegistrations: mock.campaignRegistrations,
      noShowLocks: mock.noShowLocks
    }),
    getNoShowRecords: () => paginateResult(mock.noShowLocks, payload),
    getMyReservations: () => {
      const status = payload.status || "";
      const page = Math.max(1, Number(payload.page) || 1);
      const pageSize = Math.max(1, Number(payload.pageSize || payload.page_size) || 20);
      const filtered = mock.reservations.filter((item) => !status || item.status === status);
      const list = paginate(filtered, page, pageSize);
      return { list, items: list, total: filtered.length, page, page_size: pageSize };
    },
    getReservationDetail: () => {
      const reservationId = payload.reservationId || payload.reservation_id;
      return mock.reservations.find((item) => item.id === reservationId || item._id === reservationId) || mock.reservations[0];
    },
    getTodayReservations: () => ({ items: mock.reservations, total: mock.reservations.length }),
    getStaffWorkbench: () => ({
      todayReservations: mock.reservations,
      waitingReviewCount: mock.reservations.filter((item) => item.status === RESERVATION_STATUS.WAITING_REVIEW).length
    }),
    manageStore: () => ({ item: { ...mock.store, ...(payload.payload || {}) } }),
    manageTables: () => payload.action === "list"
      ? ({ items: mock.tables })
      : ({ item: { ...(mock.tables.find((item) => item.id === tableId || item._id === tableId) || mock.tables[0]), ...(payload.payload || {}) } }),
    managePriceRules: () => ({ item: { ...(mock.priceRules[0] || {}), ...(payload.payload || {}) } }),
    manageAssistants: () => {
      const current = mock.assistants.find((item) => item.id === assistantId || item._id === assistantId) || mock.assistants[0];
      return { assistant: { ...current, ...(payload.payload || {}) } };
    },
    manageCampaigns: () => ({
      campaign: { ...(mock.campaigns.find((item) => item.id === campaignId || item._id === campaignId) || mock.campaigns[0]), ...(payload.payload || {}) }
    }),
    reviewCampaignRegistration: () => {
      const registrationId = payload.registrationId || payload.registration_id;
      const action = payload.action || "approve";
      if (action === "reject" && !payload.reason) throw buildApiError({ ok: false, code: "REASON_REQUIRED" });
      const current = mock.campaignRegistrations.find((item) => item.id === registrationId || item._id === registrationId) || mock.campaignRegistrations[0];
      return {
        registration: {
          ...current,
          status: action === "reject" ? "rejected" : "approved",
          reviewed_at: new Date().toISOString()
        }
      };
    },
    updateTableStatus: () => ({
      table: { ...(mock.tables.find((item) => item.id === tableId || item._id === tableId) || mock.tables[0]), status: payload.toStatus || payload.to_status }
    }),
    createReservation: () => createMockReservation(payload),
    submitArrival: () => updateMockReservationStatus(payload.reservationId || payload.reservation_id, RESERVATION_STATUS.WAITING_REVIEW),
    confirmArrival: () => updateMockReservationStatus(payload.reservationId || payload.reservation_id, RESERVATION_STATUS.ARRIVED),
    markNoShow: () => ({
      ...updateMockReservationStatus(payload.reservationId || payload.reservation_id, RESERVATION_STATUS.NO_SHOW),
      noShowLockDays: 3
    }),
    openTable: () => updateMockReservationStatus(payload.reservationId || payload.reservation_id, RESERVATION_STATUS.IN_SERVICE),
    closeTable: () => updateMockReservationStatus(payload.reservationId || payload.reservation_id, RESERVATION_STATUS.COMPLETED),
    liftNoShowBan: () => ({ noShowRecordId, status: "已解除" }),
    createAssistantReservation: () => ({ assistantReservationId: `AR${Date.now()}`, status: "待确认" }),
    confirmAssistantReservation: () => ({ assistantReservationId: payload.assistantReservationId, status: "已确认" }),
    updateAssistantStatus: () => ({ assistant: { ...(mock.assistants.find((item) => item.id === assistantId || item._id === assistantId) || mock.assistants[0]), status: payload.toStatus || payload.to_status } }),
    createCampaignRegistration: () => {
      const profile = payload.profile || {};
      if (!(profile.nickName || profile.nickname)) throw buildApiError({ ok: false, code: "NICKNAME_REQUIRED" });
      if (!profile.phone) throw buildApiError({ ok: false, code: "PHONE_REQUIRED" });
      return { registrationId: `CR${Date.now()}`, status: "报名成功" };
    }
  };

  return handlers[name] ? handlers[name]() : { ok: true, action: name, payload };
}

function paginateResult(list, payload = {}) {
  const page = Math.max(1, Number(payload.page) || 1);
  const pageSize = Math.max(1, Number(payload.pageSize || payload.page_size) || 20);
  return { items: paginate(list, page, pageSize), total: list.length, page, page_size: pageSize };
}

function paginate(list, page, pageSize) {
  const start = (page - 1) * pageSize;
  return list.slice(start, start + pageSize);
}

function createMockReservation(payload) {
  const id = `R${Date.now()}_${mock.reservations.length + 1}`;
  const tableId = payload.tableId || payload.table_id || "";
  const assistantId = payload.assistantId || payload.assistant_id || "";
  const table = mock.tables.find((item) => item.id === tableId || item._id === tableId || item.table_id === tableId) || {};
  const assistant = mock.assistants.find((item) => item.id === assistantId || item._id === assistantId) || {};
  const startAt = payload.startTime || payload.start_time || "";
  const endAt = payload.endTime || payload.end_time || "";
  const estimatedAmount = payload.estimatedAmount || payload.estimated_amount || 0;
  const reservation = {
    id,
    _id: id,
    reservation_id: id,
    storeId: payload.storeId || payload.store_id || mock.store.id,
    store_id: payload.store_id || payload.storeId || mock.store.id,
    tableId,
    table_id: tableId,
    tableCode: table.code || table.table_no || payload.tableCode || payload.table_code || tableId,
    table_code: table.code || table.table_no || payload.tableCode || payload.table_code || tableId,
    tableType: table.table_type_name || table.type || payload.tableType || payload.table_type_name || "",
    table_type_name: table.table_type_name || table.type || payload.tableType || payload.table_type_name || "",
    table_type: table.table_type || payload.tableType || payload.table_type || "",
    table: {
      id: table.id || table._id || tableId,
      _id: table._id || table.id || tableId,
      code: table.code || table.table_no || "",
      table_no: table.table_no || table.code || "",
      table_type: table.table_type || "",
      table_type_name: table.table_type_name || table.type || ""
    },
    assistantId,
    assistant_id: assistantId,
    assistantName: assistant.name || "",
    assistant_name: assistant.name || "",
    assistantText: assistantId ? `助教 ${assistant.name || assistantId}` : "未选择助教",
    userName: "微信用户",
    start_time: startAt,
    end_time: endAt,
    startTime: formatMockTime(startAt),
    endTime: formatMockTime(endAt),
    durationHours: payload.durationHours || payload.duration_hours || 2,
    duration_hours: payload.duration_hours || payload.durationHours || 2,
    peopleCount: payload.peopleCount || payload.people_count || 1,
    people_count: payload.people_count || payload.peopleCount || 1,
    remark: payload.remark || "",
    estimatedAmount,
    estimated_amount: estimatedAmount,
    status: RESERVATION_STATUS.WAITING_ARRIVAL,
    created_at: new Date().toISOString()
  };
  mock.reservations.unshift(reservation);
  return reservation;
}

function updateMockReservationStatus(reservationId, status) {
  const reservation = findMockReservation(reservationId);
  if (!reservation) {
    throw buildApiError({ ok: false, code: "RESOURCE_NOT_FOUND" });
  }
  reservation.status = status;
  reservation.updated_at = new Date().toISOString();
  return {
    ...reservation,
    reservationId: reservation.id,
    reservation_id: reservation.id,
    status
  };
}

function findMockReservation(reservationId) {
  return mock.reservations.find((item) => (
    item.id === reservationId ||
    item._id === reservationId ||
    item.reservation_id === reservationId
  ));
}

function formatMockTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function normalizeTableTypeKey(value) {
  const text = String(value || "").trim();
  const codeMatch = text.match(/^([A-E])\d{2}$/i);
  if (codeMatch) {
    const prefixMap = { A: "standard", B: "silver", C: "duya", D: "gold", E: "rose_gold" };
    return prefixMap[codeMatch[1].toUpperCase()] || text;
  }
  const map = {
    standard: "standard",
    normal: "standard",
    "普台": "standard",
    silver: "silver",
    "乔氏银腿": "silver",
    "银腿": "silver",
    duya: "duya",
    "独牙": "duya",
    gold: "gold",
    "乔氏金腿": "gold",
    "金腿": "gold",
    rose_gold: "rose_gold",
    roseGold: "rose_gold",
    "乔氏玫瑰金": "rose_gold",
    "玫瑰金": "rose_gold"
  };
  return map[text] || text;
}

module.exports = { call };
