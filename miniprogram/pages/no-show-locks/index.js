const api = require("../../services/api.js");

Page({
  data: {
    locks: [],
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
    api.call("getNoShowRecords", {
      storeId: getApp().globalData.storeId,
      status: "active"
    }).then((res) => {
      this.setData({
        locks: (res.items || res.list || []).map(normalizeLock),
        loading: false
      });
    }).catch((error) => {
      const message = error.message || "爽约限制加载失败";
      this.setData({ loading: false, errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    });
  },

  lift(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || this.data.actioningId) return;
    this.setData({ actioningId: id, errorMessage: "" });
    api.call("liftNoShowBan", {
      storeId: getApp().globalData.storeId,
      noShowRecordId: id,
      reason: "前台确认解除"
    }).then((res) => {
      const status = formatLockStatus(res.status || "lifted");
      this.setData({
        locks: this.data.locks.map((item) => item.id === id ? { ...item, status } : item)
      });
      wx.showToast({ title: "已解除限制", icon: "success" });
    }).catch((error) => {
      const message = error.message || "解除失败";
      this.setData({ errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    }).finally(() => {
      this.setData({ actioningId: "" });
    });
  }
});

function normalizeLock(item = {}) {
  return {
    ...item,
    id: item.id || item._id || item.noShowRecordId || item.no_show_record_id,
    userName: item.userName || item.nickname || item.user_id || item.openid || "用户",
    reservationId: item.reservationId || item.reservation_id || "",
    reason: item.reason || item.no_show_reason || "预约未到店",
    status: formatLockStatus(item.status),
    lockUntilText: item.lockUntilText || item.lock_until_text || formatLockUntil(item.lock_until)
  };
}

function formatLockStatus(status) {
  const map = {
    active: "限制中",
    lifted: "已解除",
    expired: "已过期"
  };
  return map[status] || status || "限制中";
}

function formatLockUntil(value) {
  if (!value) return "限制中";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}
