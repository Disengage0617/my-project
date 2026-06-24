const api = require("../../services/api.js");

Page({
  data: {
    type: "orders",
    title: "我的订单",
    items: [],
    loading: false,
    emptyText: "暂无记录"
  },

  onLoad(options = {}) {
    const type = options.type || "orders";
    const title = options.title || getTitle(type);
    this.setData({ type, title });
    wx.setNavigationBarTitle({ title });
    this.loadData();
  },

  loadData() {
    this.setData({ loading: true });
    api.call("getMineCenter", {
      storeId: getApp().globalData.storeId
    }).then((res) => {
      const items = getItems(this.data.type, res);
      this.setData({
        items,
        emptyText: getEmptyText(this.data.type),
        loading: false
      });
    }).catch((error) => {
      this.setData({
        items: [],
        emptyText: error.message || "加载失败",
        loading: false
      });
    });
  }
});

function getTitle(type) {
  const map = {
    orders: "我的订单",
    coupons: "优惠券",
    member: "会员中心",
    wallet: "储值记录",
    assistant: "助教预约",
    campaigns: "活动报名",
    support: "客服与门店"
  };
  return map[type] || "我的";
}

function getEmptyText(type) {
  const map = {
    orders: "暂无订单，预约到店后会生成记录。",
    coupons: "暂无优惠券，后续可由商家后台配置发放。",
    member: "会员权益由商家后台配置后展示。",
    wallet: "暂无储值记录，当前版本仅展示后台配置余额，不接支付。",
    assistant: "暂无助教预约记录。",
    campaigns: "暂无活动报名记录。",
    support: "可联系门店客服处理预约、改期、储值或优惠券问题。"
  };
  return map[type] || "暂无记录";
}

function getItems(type, data) {
  const itemMap = {
    orders: (data.orders || []).map((item) => ({
      title: item.title || item._id || "订单",
      desc: item.timeText || item.created_at || "到店后由员工确认",
      tag: item.status || "待处理",
      value: item.amountText || item.amount_text || ""
    })),
    coupons: (data.coupons || []).map((item) => ({
      title: item.title || "优惠券",
      desc: item.desc || item.expireText || "商家后台配置后可用",
      tag: item.status || "可用",
      value: item.amountText || item.amount_text || ""
    })),
    member: [{
      title: data.profile && data.profile.memberLevel ? data.profile.memberLevel : "普通会员",
      desc: "会员价、储值权益和活动资格由商家后台配置。",
      tag: "预留",
      value: ""
    }],
    wallet: [{
      title: "储值余额",
      desc: "第一期只展示后台配置金额，不接支付充值。",
      tag: data.wallet && data.wallet.storedValueEnabled === false ? "未开启" : "已预留",
      value: data.wallet ? data.wallet.balanceText : "¥0.00"
    }],
    assistant: (data.assistantReservations || []).map((item) => ({
      title: item.assistantName || item.assistant_name || "助教预约",
      desc: `${item.startTime || item.start_time || ""}-${item.endTime || item.end_time || ""}`,
      tag: item.status || "待确认",
      value: ""
    })),
    campaigns: (data.campaignRegistrations || []).map((item) => ({
      title: item.campaignTitle || item.campaign_title || "活动报名",
      desc: item.createdAtText || item.created_at || "报名记录",
      tag: item.status || "已提交",
      value: item.participantCount ? `${item.participantCount} 人` : ""
    })),
    support: [{
      title: "门店客服",
      desc: "如需取消、改期、储值或优惠券处理，请联系门店员工。",
      tag: "服务中",
      value: ""
    }]
  };
  return itemMap[type] || [];
}
