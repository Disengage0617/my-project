const api = require("../../services/api");

Page({
  data: {
    assistants: [],
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
    api.call("getAssistants", { storeId: getApp().globalData.storeId }).then((res) => {
      this.setData({
        assistants: (res.list || []).map(normalizeAssistant),
        loading: false
      });
    }).catch((error) => {
      const message = error.message || "助教列表加载失败";
      this.setData({ loading: false, errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    });
  },

  goBooking(e) {
    wx.navigateTo({ url: `/pages/assistant-booking/index?id=${e.currentTarget.dataset.id}` });
  }
});

function normalizeAssistant(item) {
  return {
    ...item,
    id: item.id || item._id,
    name: item.name || item.assistant_name || "助教",
    tagsText: item.tagsText || item.tags_text || (item.tags || []).join("、"),
    intro: item.intro || "到店后由员工确认服务安排。",
    price: item.price || (item.service_price_cent ? Math.round(item.service_price_cent / 100) : ""),
    status: item.status || ""
  };
}
