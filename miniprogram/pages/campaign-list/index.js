const api = require("../../services/api");

Page({
  data: {
    campaigns: [],
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
    api.call("getCampaigns", { storeId: getApp().globalData.storeId }).then((res) => {
      this.setData({
        campaigns: (res.list || []).map(normalizeCampaign),
        loading: false
      });
    }).catch((error) => {
      const message = error.message || "活动列表加载失败";
      this.setData({ loading: false, errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    });
  },

  goDetail(e) {
    wx.navigateTo({ url: `/pages/campaign-detail/index?id=${e.currentTarget.dataset.id}` });
  }
});

function normalizeCampaign(item) {
  const quota = item.quota || 0;
  const registeredCount = item.registeredCount || item.registered_count || 0;
  return {
    ...item,
    id: item.id || item._id,
    title: item.title || "门店活动",
    timeText: item.timeText || item.time_text || "时间待定",
    quota,
    registeredCount,
    leftCount: quota ? Math.max(0, quota - registeredCount) : "不限",
    statusText: item.statusText || item.status || "进行中"
  };
}
