const api = require("../../services/api");

Page({
  data: {
    reservations: [],
    loading: false,
    actioningId: "",
    errorMessage: ""
  },

  onLoad() {
    this.loadData();
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    this.setData({ loading: true, errorMessage: "" });
    return api.call("getMyReservations", {
      storeId: getApp().globalData.storeId
    }).then((res) => {
      this.setData({
        reservations: (res.list || []).map(normalizeReservation),
        loading: false
      });
    }).catch((error) => {
      const message = getErrorMessage(error, "预约记录加载失败");
      this.setData({ loading: false, errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    });
  },

  submitArrival(e) {
    const reservationId = e.currentTarget.dataset.id;
    if (!reservationId || this.data.actioningId) return;

    this.setData({ actioningId: reservationId, errorMessage: "" });
    api.call("submitArrival", {
      storeId: getApp().globalData.storeId,
      reservationId
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

function normalizeReservation(item) {
  return {
    ...item,
    id: item.id || item._id,
    tableCode: item.tableCode || item.table_code || item.table_id || "",
    tableType: item.tableType || item.table_type_name || item.table_type || "",
    status: item.status || "",
    startTime: item.startTime || formatTime(item.start_time),
    endTime: item.endTime || formatTime(item.end_time),
    assistantText: item.assistantText || (item.assistant_id ? `助教 ${item.assistant_name || item.assistant_id}` : "")
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
