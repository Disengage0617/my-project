const api = require("../../services/api.js");

Page({
  data: {
    entries: [
      { key: "store", name: "门店配置", desc: "名称、营业时间、预约规则", status: "待检查", action: "getStoreDetail" },
      { key: "table", name: "桌台配置", desc: "编号、区域、桌型、状态", status: "待检查", action: "manageTables:list" },
      { key: "price", name: "价格配置", desc: "桌型时段价、助教价格", status: "待检查", action: "getPriceRules" },
      { key: "assistant", name: "助教配置", desc: "资料、标签、状态、价格", status: "待检查", action: "getAssistants" },
      { key: "campaign", name: "活动配置", desc: "活动发布、名额、审核规则", status: "待检查", action: "getCampaigns" },
      { key: "customer", name: "客户列表", desc: "预约记录、手机号、标签", status: "待检查", action: "getCustomers" },
      { key: "registration", name: "报名名单", desc: "活动报名和审核", status: "待检查", action: "getCampaignRegistrations" }
    ],
    loading: false,
    actioningKey: "",
    uploadingAssistantPhoto: false,
    errorMessage: "",
    resultMessage: ""
  },

  onLoad() {
    this.refreshStatus();
  },

  refreshStatus() {
    this.setData({ loading: true, errorMessage: "", resultMessage: "" });
    Promise.all([
      api.call("getStoreDetail", { storeId: getApp().globalData.storeId }),
      api.call("manageTables", { storeId: getApp().globalData.storeId, action: "list" }),
      api.call("getPriceRules", { storeId: getApp().globalData.storeId }),
      api.call("getAssistants", { storeId: getApp().globalData.storeId }),
      api.call("getCampaigns", { storeId: getApp().globalData.storeId }),
      api.call("getCustomers", { storeId: getApp().globalData.storeId }),
      api.call("getCampaignRegistrations", { storeId: getApp().globalData.storeId })
    ]).then((results) => {
      const counts = [
        results[0] ? 1 : 0,
        (results[1].items || results[1].list || []).length,
        (results[2].rules || results[2].items || []).length,
        (results[3].list || results[3].items || []).length,
        (results[4].list || results[4].items || []).length,
        results[5].total || (results[5].items || []).length,
        results[6].total || (results[6].items || []).length
      ];
      this.setData({
        entries: this.data.entries.map((item, index) => ({
          ...item,
          status: counts[index] ? `已接入 ${counts[index]}` : "暂无数据"
        })),
        loading: false
      });
    }).catch((error) => {
      const message = error.message || "配置状态加载失败";
      this.setData({ loading: false, errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    });
  },

  runEntry(e) {
    const key = e.currentTarget.dataset.key;
    const entry = this.data.entries.find((item) => item.key === key);
    if (!entry || this.data.actioningKey) return;
    this.setData({ actioningKey: key, errorMessage: "", resultMessage: "" });
    const request = buildCheckRequest(entry.key);
    api.call(request.action, request.payload).then((res) => {
      const label = getResultLabel(entry, res);
      this.setData({
        entries: this.data.entries.map((item) => item.key === key ? { ...item, status: label } : item),
        resultMessage: `${entry.name}只读检查已联通`
      });
      wx.showToast({ title: "接口已联通", icon: "success" });
    }).catch((error) => {
      const message = error.message || `${entry.name}操作失败`;
      this.setData({ errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    }).finally(() => {
      this.setData({ actioningKey: "" });
    });
  },

  uploadAssistantPhoto() {
    if (this.data.uploadingAssistantPhoto) return;
    const storeId = getApp().globalData.storeId;
    this.setData({ uploadingAssistantPhoto: true, errorMessage: "", resultMessage: "" });
    api.call("getAssistants", { storeId }).then((res) => {
      const assistant = (res.list || res.items || [])[0];
      if (!assistant) throw new Error("暂无助教资料，请先创建助教");
      return chooseOneImage().then((tempFilePath) => ({ assistant, tempFilePath }));
    }).then(({ assistant, tempFilePath }) => {
      if (!wx.cloud || typeof wx.cloud.uploadFile !== "function") {
        throw new Error("当前环境未启用云存储上传");
      }
      const assistantId = assistant.id || assistant._id;
      const ext = getFileExt(tempFilePath);
      return uploadCloudFile({
        cloudPath: `assistant-photos/${storeId}/${assistantId}-${Date.now()}.${ext}`,
        filePath: tempFilePath
      }).then((uploadRes) => ({ assistant, assistantId, fileID: uploadRes.fileID }));
    }).then(({ assistant, assistantId, fileID }) => {
      return api.call("manageAssistants", {
        storeId,
        assistantId,
        action: "upsert",
        payload: {
          ...assistant,
          avatar_url: fileID,
          photo_url: fileID,
          thumb_url: fileID
        }
      });
    }).then(() => {
      this.setData({ resultMessage: "助教照片已上传并保存" });
      wx.showToast({ title: "照片已保存", icon: "success" });
      this.refreshStatus();
    }).catch((error) => {
      const message = error.message || "助教照片上传失败";
      this.setData({ errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    }).finally(() => {
      this.setData({ uploadingAssistantPhoto: false });
    });
  }
});

function chooseOneImage() {
  if (typeof wx.chooseMedia === "function") {
    return new Promise((resolve, reject) => {
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        success: (res) => resolve(res.tempFiles[0].tempFilePath),
        fail: reject
      });
    });
  }
  return new Promise((resolve, reject) => {
    wx.chooseImage({
      count: 1,
      sourceType: ["album", "camera"],
      success: (res) => resolve(res.tempFilePaths[0]),
      fail: reject
    });
  });
}

function uploadCloudFile({ cloudPath, filePath }) {
  return new Promise((resolve, reject) => {
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: resolve,
      fail: reject
    });
  });
}

function getFileExt(path) {
  const match = String(path || "").match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return match ? match[1].toLowerCase() : "jpg";
}

function buildCheckRequest(key) {
  const storeId = getApp().globalData.storeId;
  const requestMap = {
    store: { action: "getStoreDetail", payload: { storeId } },
    table: { action: "manageTables", payload: { storeId, action: "list" } },
    price: { action: "getPriceRules", payload: { storeId } },
    assistant: { action: "getAssistants", payload: { storeId } },
    campaign: { action: "getCampaigns", payload: { storeId } },
    customer: { action: "getCustomers", payload: { storeId } },
    registration: { action: "getCampaignRegistrations", payload: { storeId } }
  };
  return requestMap[key] || { action: "getStoreDetail", payload: { storeId } };
}

function getResultLabel(entry, res) {
  const count = res.total || (res.items || res.list || res.rules || []).length || (res ? 1 : 0);
  return `已接入 ${count}`;
}
