const api = require("../../services/api.js");

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
    const storeId = getApp().globalData.storeId;
    Promise.all([
      api.call("getStoreOverview", { storeId }),
      api.call("getCustomers", { storeId }),
      api.call("getCampaignRegistrations", { storeId }),
      api.call("getNoShowRecords", { storeId })
    ]).then(([overview, customers, registrations, noShows]) => {
      this.setData({
        overview,
        entries: [
          { name: "门店配置", status: "已接入" },
          { name: "客户沉淀", status: `${customers.total || 0} 人` },
          { name: "活动报名", status: `${registrations.total || 0} 条` },
          { name: "爽约限制", status: `${noShows.total || 0} 条` },
          { name: "桌台状态", status: "已接入" }
        ],
        errorMessage: ""
      });
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
