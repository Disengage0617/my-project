const api = require("../../services/api.js");

Page({
  data: {
    todayReservations: [],
    waitingReviewCount: 0,
    loading: false,
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
    return api.call("getStaffWorkbench", {
      storeId: getApp().globalData.storeId
    }).then((res) => {
      this.setData({
        todayReservations: (res.todayReservations || []).map(normalizeReservation),
        waitingReviewCount: res.waitingReviewCount || 0,
        loading: false
      });
    }).catch((error) => {
      const message = getErrorMessage(error, "工作台加载失败");
      this.setData({ loading: false, errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    });
  },

  goArrivalReview(e) {
    const id = e.currentTarget.dataset.id || "";
    const url = id ? `/pages/arrival-review/index?id=${id}` : "/pages/arrival-review/index";
    wx.navigateTo({ url });
  },

  goTableGrid() {
    wx.navigateTo({ url: "/pages/table-grid/index" });
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
