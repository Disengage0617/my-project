const api = require("../../services/api.js");

Page({
  data: {
    campaignId: "",
    profile: {
      nickName: "微信用户",
      phone: "",
      phoneCode: ""
    },
    phoneText: "待授权",
    phoneTip: "请授权或填写手机号后提交报名。",
    submitText: "提交报名",
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

  inputPhone(e) {
    const phone = String(e.detail.value || "").replace(/\D/g, "").slice(0, 11);
    this.setData({
      "profile.phone": phone,
      phoneText: phone || "待授权",
      phoneTip: phone ? "手机号已填写，可提交报名。" : "请授权或填写手机号后提交报名。"
    });
  },

  getPhoneNumber(e) {
    const detail = e.detail || {};
    if (detail.errMsg && detail.errMsg.indexOf("ok") === -1) {
      this.setData({
        errorMessage: "未完成手机号授权，请授权或填写手机号后报名。",
        phoneTip: "未完成手机号授权，请重试或手动填写手机号。"
      });
      wx.showToast({ title: "请先授权手机号", icon: "none" });
      return;
    }

    const phoneCode = detail.code || "";
    const phone = detail.phoneNumber || detail.purePhoneNumber || this.data.profile.phone;
    this.setData({
      "profile.phone": phone || "",
      "profile.phoneCode": phoneCode,
      phoneText: phone ? phone : "已授权，待服务端换取",
      phoneTip: phone ? "手机号已授权，可提交报名。" : "已取得手机号授权凭证，当前后端尚未开放换号能力，请手动填写手机号完成联调。",
      errorMessage: ""
    });
    wx.showToast({ title: phone ? "手机号已授权" : "已获取授权凭证", icon: "success" });
  },

  submit() {
    if (this.data.submitting) return;
    if (!this.data.campaignId) {
      wx.showToast({ title: "缺少活动信息", icon: "none" });
      return;
    }
    if (!this.data.profile.nickName) {
      this.showSubmitError("请先授权微信昵称");
      return;
    }
    if (!this.data.profile.phone) {
      this.showSubmitError("请先授权或填写手机号");
      return;
    }

    this.setData({ submitting: true, errorMessage: "", submitText: "提交中..." });
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
      this.setData({ submitting: false, submitText: "提交报名" });
    });
  },

  showSubmitError(message) {
    this.setData({ errorMessage: message });
    wx.showToast({ title: message, icon: "none" });
  }
});
