const api = require("../../services/api");

Page({
  data: {
    tables: [],
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
    api.call("getAvailableTables", { storeId: getApp().globalData.storeId }).then((res) => {
      this.setData({ tables: res.list || [], loading: false });
    }).catch((error) => {
      const message = error.message || "桌台状态加载失败";
      this.setData({ loading: false, errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    });
  }
});
