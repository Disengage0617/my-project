const api = require("../../services/api");

Page({
  data: {
    overview: getDefaultOverview(),
    errorMessage: ""
  },

  onLoad() {
    this.loadOverview();
  },

  onShow() {
    this.loadOverview();
  },

  loadOverview() {
    return api.call("getStoreOverview", {
      storeId: getApp().globalData.storeId
    }).then((overview) => {
      this.setData({ overview, errorMessage: "" });
    }).catch((error) => {
      const message = getErrorMessage(error, "门店概览加载失败");
      this.setData({ errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    });
  },

  goReservation() {
    wx.switchTab({ url: "/pages/reservation/index" });
  },

  goPrice() {
    wx.navigateTo({ url: "/pages/store-price/index" });
  },

  goAssistants() {
    wx.navigateTo({ url: "/pages/assistant-list/index" });
  },

  goCampaigns() {
    wx.navigateTo({ url: "/pages/campaign-list/index" });
  }
});

function getErrorMessage(error, fallback) {
  return error && error.message ? error.message : fallback;
}

function getDefaultOverview() {
  return {
    store: {
      name: "",
      businessHours: "",
      tableCount: 0,
      reservationLeadMinutes: 30,
      noShowLockDays: 3
    },
    freeTableCount: 0,
    freeAssistantCount: 0
  };
}
