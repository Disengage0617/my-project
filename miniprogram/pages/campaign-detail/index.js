const api = require("../../services/api.js");

Page({
  data: {
    campaignId: "",
    campaign: null,
    loading: false,
    errorMessage: ""
  },

  onLoad(options = {}) {
    this.setData({ campaignId: options.id || "" });
    this.loadData();
  },

  loadData() {
    this.setData({ loading: true, errorMessage: "" });
    api.call("getCampaignDetail", {
      storeId: getApp().globalData.storeId,
      campaignId: this.data.campaignId
    }).then((campaign) => {
      this.setData({ campaign: normalizeCampaign(campaign), loading: false });
    }).catch((error) => {
      const message = error.message || "活动详情加载失败";
      this.setData({ loading: false, errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    });
  },

  goRegister() {
    const id = this.data.campaign && this.data.campaign.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/campaign-registration/index?id=${id}` });
  }
});

function normalizeCampaign(item = {}) {
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
    statusText: item.statusText || item.status || "进行中",
    rule: item.rule || "由商家编写活动规则，一期不做在线支付和核销。"
  };
}
