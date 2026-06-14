const mock = require("../../utils/mock");

Page({
  data: {
    locks: mock.noShowLocks || []
  },

  lift(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      locks: this.data.locks.map((item) => item.id === id ? { ...item, status: "已解除" } : item)
    });
    wx.showToast({ title: "已记录解除", icon: "success" });
  }
});
