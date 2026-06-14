const api = require("../../services/api");

Page({
  data: {
    reservationId: "",
    reservation: null,
    loading: false,
    actioning: "",
    actionStatus: "",
    actionError: false
  },

  onLoad(options = {}) {
    this.setData({
      reservationId: options.id || this.data.reservationId
    });
    this.loadData();
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    this.setData({ loading: true });
    return api.call("getStaffWorkbench", {
      storeId: getApp().globalData.storeId
    }).then((res) => {
      const list = (res.todayReservations || []).map(normalizeReservation);
      const reservation = list.find((item) => item.id === this.data.reservationId) || list[0] || null;
      this.setData({
        reservation,
        reservationId: reservation ? reservation.id : this.data.reservationId,
        loading: false
      });
    }).catch((error) => {
      this.setData({
        loading: false,
        actionStatus: getErrorMessage(error, "刷新到店核实列表失败"),
        actionError: true
      });
    });
  },

  runAction(action, successTitle, failTitle) {
    if (!this.data.reservationId || this.data.actioning) return Promise.resolve();

    this.setData({ actioning: action, actionStatus: "处理中...", actionError: false });
    return api.call(action, {
      storeId: getApp().globalData.storeId,
      reservationId: this.data.reservationId
    }).then((res = {}) => {
      const status = res.status ? `，当前状态：${res.status}` : "";
      this.setData({ actionStatus: `${successTitle}${status}`, actionError: false });
      wx.showToast({ title: successTitle, icon: "success" });
      return this.loadData();
    }).catch((error) => {
      const message = getErrorMessage(error, failTitle);
      this.setData({ actionStatus: message, actionError: true });
      wx.showToast({ title: message, icon: "none" });
    }).finally(() => {
      this.setData({ actioning: "" });
    });
  },

  confirmArrival() {
    this.runAction("confirmArrival", "已确认到店", "确认失败");
  },

  markNoShow() {
    this.runAction("markNoShow", "已标记未到", "标记失败");
  },

  openTable() {
    this.runAction("openTable", "已开台", "开台失败");
  },

  closeTable() {
    this.runAction("closeTable", "已关台", "关台失败");
  }
});

function normalizeReservation(item) {
  return {
    ...item,
    id: item.id || item._id,
    userName: item.userName || item.user_name || item.nick_name || item.openid || "预约用户",
    tableCode: item.tableCode || item.table_code || item.table_id || "",
    tableType: item.tableType || item.table_type_name || item.table_type || "",
    status: item.status || "",
    startTime: item.startTime || formatTime(item.start_time),
    endTime: item.endTime || formatTime(item.end_time),
    assistantText: item.assistantText || (item.assistant_id ? item.assistant_name || item.assistant_id : "未选择")
  };
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
