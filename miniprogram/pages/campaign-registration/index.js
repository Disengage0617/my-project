const api = require("../../services/api");

Page({
  data: {
    campaignId: "",
    profile: {
      nickName: "微信用户",
      phone: ""
    },
    participantCount: 1,
    submitting: false,
    errorMessage: ""
  },

  onLoad(options = {}) {
    this.setData({ campaignId: options.id || "" });
  },

  changeCount(e) {
    const delta = Number(e.currentTarget.dataset.delta || 0);
    const participantCount = Math.min(4, Math.max(1, this.data.participantCount + delta));
    this.setData({ participantCount });
  },

  submit() {
    if (this.data.submitting) return;
    if (!this.data.campaignId) {
      wx.showToast({ title: "缺少活动信息", icon: "none" });
      return;
    }

    this.setData({ submitting: true, errorMessage: "" });
    api.call("createCampaignRegistration", {
      storeId: getApp().globalData.storeId,
      campaignId: this.data.campaignId,
      participantCount: this.data.participantCount,
      profile: this.data.profile
    }).then((res) => {
      wx.showToast({ title: res.status || "报名成功", icon: "success" });
    }).catch((error) => {
      const message = error.message || "报名失败";
      this.setData({ errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    }).finally(() => {
      this.setData({ submitting: false });
    });
  }
});
