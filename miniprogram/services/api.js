const mock = require("../utils/mock");
const { RESERVATION_STATUS } = require("../utils/constants");

function call(name, payload = {}) {
  if (typeof wx === "undefined" || !wx.cloud || !wx.cloud.callFunction) {
    return Promise.resolve(mockCall(name, payload));
  }

  return wx.cloud.callFunction({
    name: "api",
    data: { action: name, payload }
  }).then((res) => {
    const result = res.result || {};
    if (result.ok === false) {
      throw buildApiError(result);
    }
    return result.data || result;
  });
}

function buildApiError(result) {
  const code = result.code || "API_ERROR";
  const message = ERROR_MESSAGES[code] || result.message || result.error || "接口调用失败";
  const error = new Error(`${code}：${message}`);
  error.code = code;
  return error;
}

const ERROR_MESSAGES = {
  TABLE_REQUIRED: "请先选择桌台",
  INVALID_START_TIME: "预约开始时间无效",
  INVALID_END_TIME: "预约结束时间无效",
  RESERVATION_TOO_EARLY: "预约时间太近，请至少提前 30 分钟",
  TABLE_TIME_CONFLICT: "该桌台时段已被预约，请更换桌台或时间",
  ASSISTANT_TIME_CONFLICT: "该助教时段已被预约，请更换助教或时间",
  NO_SHOW_LOCKED: "当前账号存在爽约限制，暂时不能预约",
  FORBIDDEN: "当前账号无权执行该操作",
  STAFF_DISABLED: "员工账号未启用",
  STAFF_NOT_FOUND: "当前账号不是本店员工",
  INVALID_STATUS: "当前预约状态不支持该操作",
  NOT_FOUND: "记录不存在或已被删除"
};

function mockCall(name, payload) {
  const handlers = {
    getStoreOverview: () => mock.getOverview(),
    getDebugContext: () => ({ openid: "mock-openid", appid: "mock-appid", env: "mock-env" }),
    bootstrapMvp: () => ({ storeId: "store_demo_001", managerOpenid: "mock-openid", role: "manager", tables: 3 }),
    validateMvpBootstrap: () => ({
      ok: true,
      passedCount: 11,
      totalCount: 11,
      checks: [
        { name: "store", passed: true, detail: "门店已初始化" },
        { name: "manager permission", passed: true, detail: "当前用户为 manager" },
        { name: "available tables", passed: true, detail: "3 张桌台可用" }
      ]
    }),
    runMvpFlowSmokeTest: () => ({
      ok: true,
      reservationId: "reservation_demo_001",
      tableId: "table_demo_001",
      passedCount: 7,
      totalCount: 7,
      steps: [
        { name: "createReservation", passed: true, status: RESERVATION_STATUS.WAITING_ARRIVAL },
        { name: "submitArrival", passed: true, status: RESERVATION_STATUS.WAITING_REVIEW },
        { name: "confirmArrival", passed: true, status: RESERVATION_STATUS.ARRIVED },
        { name: "openTable", passed: true, status: RESERVATION_STATUS.IN_SERVICE },
        { name: "closeTable", passed: true, status: RESERVATION_STATUS.COMPLETED },
        { name: "finalReservationStatus", passed: true, status: RESERVATION_STATUS.COMPLETED },
        { name: "finalTableStatus", passed: true, status: "空闲" }
      ]
    }),
    runMvpGuardSmokeTest: () => ({
      ok: true,
      passedCount: 8,
      totalCount: 8,
      steps: [
        { name: "baseReservation", passed: true, detail: RESERVATION_STATUS.WAITING_ARRIVAL },
        { name: "overlapRejected", passed: true, detail: "TABLE_TIME_CONFLICT" },
        { name: "earlyReservationRejected", passed: true, detail: "RESERVATION_TOO_EARLY" },
        { name: "noShowSourceReservation", passed: true, detail: RESERVATION_STATUS.WAITING_ARRIVAL },
        { name: "markNoShow", passed: true, detail: RESERVATION_STATUS.NO_SHOW },
        { name: "noShowLockRejected", passed: true, detail: "NO_SHOW_LOCKED" },
        { name: "noShowRecordCreated", passed: true, detail: "mock_no_show" },
        { name: "liftNoShowBan", passed: true, detail: "已解除" }
      ]
    }),
    getAvailableTables: () => ({ list: mock.tables }),
    getAssistants: () => ({ list: mock.assistants }),
    getCampaigns: () => ({ list: mock.campaigns }),
    getCampaignDetail: () => mock.campaigns.find((item) => item.id === payload.campaignId) || mock.campaigns[0],
    getMyReservations: () => ({ list: mock.reservations }),
    getStaffWorkbench: () => ({
      todayReservations: mock.reservations,
      waitingReviewCount: mock.reservations.filter((item) => item.status === RESERVATION_STATUS.WAITING_REVIEW).length
    }),
    createReservation: () => ({
      id: `R${Date.now()}`,
      status: RESERVATION_STATUS.WAITING_ARRIVAL,
      ...payload
    }),
    submitArrival: () => ({ reservationId: payload.reservationId, status: RESERVATION_STATUS.WAITING_REVIEW }),
    confirmArrival: () => ({ reservationId: payload.reservationId, status: RESERVATION_STATUS.ARRIVED }),
    markNoShow: () => ({ reservationId: payload.reservationId, status: RESERVATION_STATUS.NO_SHOW, noShowLockDays: 3 }),
    openTable: () => ({ reservationId: payload.reservationId, status: RESERVATION_STATUS.IN_SERVICE }),
    closeTable: () => ({ reservationId: payload.reservationId, status: RESERVATION_STATUS.COMPLETED }),
    liftNoShowBan: () => ({ ok: true, status: "已解除" }),
    createAssistantReservation: () => ({ assistantReservationId: `AR${Date.now()}`, status: "待确认" }),
    createCampaignRegistration: () => ({ registrationId: `CR${Date.now()}`, status: "报名成功" })
  };

  return handlers[name] ? handlers[name]() : { ok: true, action: name, payload };
}

module.exports = { call };
