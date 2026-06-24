const api = require("../../services/api.js");
const { RESERVATION_STATUS } = require("../../utils/constants");

Page({
  data: {
    reservationId: "",
    reservation: null,
    loading: false,
    actioning: false,
    errorMessage: "",
    statusFlow: [
      { key: RESERVATION_STATUS.WAITING_ARRIVAL, label: "待到店" },
      { key: RESERVATION_STATUS.WAITING_REVIEW, label: "待核实" },
      { key: RESERVATION_STATUS.ARRIVED, label: "已到店" },
      { key: RESERVATION_STATUS.IN_SERVICE, label: "进行中" },
      { key: RESERVATION_STATUS.COMPLETED, label: "已完成" }
    ]
  },

  onLoad(options = {}) {
    this.setData({ reservationId: options.id || "" });
    this.loadData();
  },

  loadData() {
    this.setData({ loading: true, errorMessage: "" });
    api.call("getReservationDetail", {
      storeId: getApp().globalData.storeId,
      store_id: getApp().globalData.storeId,
      reservationId: this.data.reservationId,
      reservation_id: this.data.reservationId
    }).then((res) => {
      this.setData({ reservation: normalizeReservation(res), loading: false });
    }).catch((error) => {
      const message = error.message || "预约详情加载失败";
      this.setData({ loading: false, errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    });
  },

  submitArrival() {
    const reservationId = this.data.reservationId;
    if (!reservationId || this.data.actioning) return;
    this.setData({ actioning: true, errorMessage: "" });
    api.call("submitArrival", {
      storeId: getApp().globalData.storeId,
      store_id: getApp().globalData.storeId,
      reservationId,
      reservation_id: reservationId
    }).then(() => {
      wx.showToast({ title: "已提交到店", icon: "success" });
      return this.loadData();
    }).catch((error) => {
      const message = error.message || "提交失败";
      this.setData({ errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    }).finally(() => {
      this.setData({ actioning: false });
    });
  }
});

function normalizeReservation(item) {
  const table = item.table || {};
  const status = item.status || "";
  return {
    ...item,
    id: item.id || item._id,
    tableCode: item.tableCode || item.table_code || table.table_no || table.code || item.table_id || "",
    tableType: item.tableType || item.table_type_name || table.table_type_name || item.table_type || "",
    status,
    statusText: normalizeStatus(status),
    canSubmitArrival: status === RESERVATION_STATUS.WAITING_ARRIVAL,
    startTime: item.startTime || formatTime(item.start_time),
    endTime: item.endTime || formatTime(item.end_time),
    assistantText: item.assistantText || (item.assistant_id ? `助教 ${item.assistant_name || item.assistant_id}` : "未选择")
  };
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

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}
