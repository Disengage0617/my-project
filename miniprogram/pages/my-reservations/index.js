const api = require("../../services/api.js");
const { RESERVATION_STATUS } = require("../../utils/constants");

const FILTER_TABS = [
  { key: "all", label: "全部" },
  { key: RESERVATION_STATUS.WAITING_ARRIVAL, label: "待到店" },
  { key: RESERVATION_STATUS.WAITING_REVIEW, label: "待核实" },
  { key: RESERVATION_STATUS.IN_SERVICE, label: "进行中" },
  { key: "history", label: "历史" }
];

Page({
  data: {
    tabs: FILTER_TABS,
    activeTab: "all",
    reservations: [],
    allReservations: [],
    loading: false,
    actioningId: "",
    errorMessage: ""
  },

  onLoad() {
    this.loadData();
  },

  onShow() {
    setTabBarSelected(this, 2);
    this.loadData();
  },

  loadData() {
    this.setData({ loading: true, errorMessage: "" });
    const status = getRequestStatus(this.data.activeTab);
    return api.call("getMyReservations", {
      storeId: getApp().globalData.storeId,
      store_id: getApp().globalData.storeId,
      status,
      page: 1,
      pageSize: 20,
      page_size: 20
    }).then((res) => {
      const allReservations = getList(res).map(normalizeReservation);
      this.setData({
        allReservations,
        reservations: filterReservations(allReservations, this.data.activeTab),
        loading: false
      });
    }).catch((error) => {
      const message = getErrorMessage(error, "预约记录加载失败");
      this.setData({ loading: false, errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    });
  },

  switchTab(e) {
    const key = e.currentTarget.dataset.key || "all";
    if (key === this.data.activeTab) return;
    this.setData({
      activeTab: key,
      reservations: filterReservations(this.data.allReservations, key)
    }, () => this.loadData());
  },

  goDetail(e) {
    const reservationId = e.currentTarget.dataset.id;
    if (!reservationId) return;
    wx.navigateTo({ url: `/pages/reservation-detail/index?id=${reservationId}` });
  },

  submitArrival(e) {
    const reservationId = e.currentTarget.dataset.id;
    if (!reservationId || this.data.actioningId) return;

    this.setData({ actioningId: reservationId, errorMessage: "" });
    api.call("submitArrival", {
      storeId: getApp().globalData.storeId,
      store_id: getApp().globalData.storeId,
      reservationId,
      reservation_id: reservationId
    }).then(() => {
      wx.showToast({ title: "已提交到店", icon: "success" });
      return this.loadData();
    }).catch((error) => {
      const message = getErrorMessage(error, "提交失败");
      this.setData({ errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    }).finally(() => {
      this.setData({ actioningId: "" });
    });
  }
});

function getRequestStatus(activeTab) {
  return activeTab === "all" || activeTab === "history" ? "" : activeTab;
}

function setTabBarSelected(page, selected) {
  if (typeof page.getTabBar === "function" && page.getTabBar()) {
    page.getTabBar().setData({ selected });
  }
}

function getList(res) {
  return res.list || res.items || res.reservations || [];
}

function filterReservations(list, activeTab) {
  if (activeTab === "all") return list;
  if (activeTab === "history") {
    return list.filter((item) => [
      RESERVATION_STATUS.COMPLETED,
      RESERVATION_STATUS.CANCELED,
      RESERVATION_STATUS.NO_SHOW,
      RESERVATION_STATUS.RELEASED
    ].indexOf(item.status) >= 0);
  }
  return list.filter((item) => item.status === activeTab);
}

function normalizeReservation(item) {
  const table = item.table || {};
  const tableCode = normalizeTableCode(item.tableCode || item.table_code || item.table_no || table.table_no || table.code || item.table_id || item.tableId || "");
  const tableType = normalizeTableType(item.tableType || item.table_type_name || item.table_type || table.table_type_name || table.table_type || item.type || "");
  const status = item.status || "";
  const id = item.id || item._id || item.reservation_id || "";
  const estimatedAmount = item.estimatedAmount || item.estimated_amount || item.estimated_amount_cent && Math.round(item.estimated_amount_cent / 100);

  return {
    ...item,
    id,
    tableCode,
    tableType,
    tableTitle: [tableType, tableCode].filter(Boolean).join(" ") || "预约桌台",
    reservationCode: formatReservationCode(id),
    status,
    statusText: normalizeStatus(status),
    statusDesc: normalizeStatusDesc(status),
    primaryActionText: getPrimaryActionText(status),
    canSubmitArrival: status === RESERVATION_STATUS.WAITING_ARRIVAL,
    startTime: item.startTime || formatTime(item.start_time),
    endTime: item.endTime || formatTime(item.end_time),
    amountText: estimatedAmount ? `预计 ¥${estimatedAmount}` : "到店结算",
    assistantText: item.assistantText || (item.assistant_id ? `助教 ${item.assistant_name || item.assistant_id}` : "未选择助教")
  };
}

function normalizeTableCode(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/(?:^|_)table_([A-Z]+\d+)$/i) || text.match(/([A-Z]+\d+)$/i);
  return match ? match[1].toUpperCase() : text;
}

function normalizeTableType(value) {
  const text = String(value || "").trim();
  const typeMap = {
    standard: "普台",
    normal: "普台",
    silver: "乔氏银腿",
    duya: "独牙",
    gold: "乔氏金腿",
    rose_gold: "乔氏玫瑰金",
    vip: "VIP 包间",
    pro: "专业台"
  };
  return typeMap[text] || text;
}

function normalizeStatus(status) {
  const statusMap = {
    [RESERVATION_STATUS.PENDING_CONFIRM]: "待确认",
    [RESERVATION_STATUS.WAITING_ARRIVAL]: "待到店",
    [RESERVATION_STATUS.WAITING_REVIEW]: "待核实",
    [RESERVATION_STATUS.ARRIVED]: "已到店",
    [RESERVATION_STATUS.IN_SERVICE]: "进行中",
    [RESERVATION_STATUS.COMPLETED]: "已完成",
    [RESERVATION_STATUS.CANCELED]: "已取消",
    [RESERVATION_STATUS.NO_SHOW]: "未到店",
    [RESERVATION_STATUS.RELEASED]: "已释放"
  };
  return statusMap[status] || status || "待处理";
}

function normalizeStatusDesc(status) {
  const descMap = {
    [RESERVATION_STATUS.PENDING_CONFIRM]: "等待门店确认预约。",
    [RESERVATION_STATUS.WAITING_ARRIVAL]: "到店后点击“我已到店”，员工会在工作台核实。",
    [RESERVATION_STATUS.WAITING_REVIEW]: "已提交到店，等待员工核实。",
    [RESERVATION_STATUS.ARRIVED]: "员工已核实，可等待开台。",
    [RESERVATION_STATUS.IN_SERVICE]: "桌台使用中，关台由员工处理。",
    [RESERVATION_STATUS.COMPLETED]: "本次预约已完成。",
    [RESERVATION_STATUS.CANCELED]: "本次预约已取消。",
    [RESERVATION_STATUS.NO_SHOW]: "已标记未到店，可能触发 3 天预约限制。",
    [RESERVATION_STATUS.RELEASED]: "预约已释放，可重新选择时段。"
  };
  return descMap[status] || "查看详情确认当前状态。";
}

function getPrimaryActionText(status) {
  const actionMap = {
    [RESERVATION_STATUS.PENDING_CONFIRM]: "等待确认",
    [RESERVATION_STATUS.WAITING_ARRIVAL]: "我已到店",
    [RESERVATION_STATUS.WAITING_REVIEW]: "等待核实",
    [RESERVATION_STATUS.ARRIVED]: "等待开台",
    [RESERVATION_STATUS.IN_SERVICE]: "使用中",
    [RESERVATION_STATUS.COMPLETED]: "已完成",
    [RESERVATION_STATUS.CANCELED]: "已取消",
    [RESERVATION_STATUS.NO_SHOW]: "查看限制",
    [RESERVATION_STATUS.RELEASED]: "已释放"
  };
  return actionMap[status] || "查看详情";
}

function formatReservationCode(id) {
  const text = String(id || "").trim();
  if (!text) return "";
  return `预约尾号 ${text.slice(-6)}`;
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function getErrorMessage(error, fallback) {
  return error && error.message ? error.message : fallback;
}
