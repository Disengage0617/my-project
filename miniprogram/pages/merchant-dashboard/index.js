const api = require("../../services/api");

Page({
  data: {
    overview: getDefaultOverview(),
    entries: [
      { name: "门店配置", status: "已完成" },
      { name: "桌台配置", status: "待完善" },
      { name: "价格配置", status: "待完善" },
      { name: "助教配置", status: "待完善" },
      { name: "活动配置", status: "待完善" }
    ],
    errorMessage: ""
  },

  onLoad() {
    api.call("getStoreOverview", { storeId: getApp().globalData.storeId }).then((overview) => {
      this.setData({ overview, errorMessage: "" });
    }).catch((error) => {
      this.setData({ errorMessage: error.message || "商家概览加载失败" });
    });
  }
});

function getDefaultOverview() {
  return {
    store: { tableCount: 0 },
    freeTableCount: 0,
    freeAssistantCount: 0
  };
}
