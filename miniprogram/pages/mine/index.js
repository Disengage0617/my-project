const api = require("../../services/api.js");

Page({
  data: {
    loading: false,
    errorMessage: "",
    profile: {
      nickName: "微信用户",
      avatarUrl: "",
      memberLevel: "普通会员",
      phone: "",
      phoneAuthorized: false
    },
    wallet: {
      balanceText: "¥0.00",
      storedValueEnabled: true
    },
    quickStats: [
      { key: "rights", label: "会员权益", value: "12", icon: "♕", tone: "cyan", url: "/pages/mine-feature/index?type=member&title=会员权益" },
      { key: "points", label: "我的积分", value: "28", icon: "✦", tone: "violet", url: "/pages/mine-feature/index?type=wallet&title=我的积分" },
      { key: "coupon", label: "优惠券", value: "6", icon: "▭", tone: "violet", url: "/pages/mine-feature/index?type=coupons&title=优惠券" },
      { key: "friends", label: "好友邀请", value: "3", icon: "♙", tone: "violet", url: "/pages/mine-feature/index?type=support&title=好友邀请" }
    ],
    featureItems: buildFeatureItems(),
    menuGroups: []
  },

  onLoad() {
    this.loadData();
  },

  onShow() {
    setTabBarSelected(this, 4);
    this.loadData();
  },

  loadData() {
    this.setData({ loading: true, errorMessage: "" });
    return api.call("getMineCenter", {
      storeId: getApp().globalData.storeId
    }).then((res) => {
      const profile = normalizeProfile(res.profile || {});
      const wallet = normalizeWallet(res.wallet || {});
      const coupons = res.coupons || [];
      const orders = res.orders || [];
      const noShowLocks = res.noShowLocks || [];

      this.setData({
        profile,
        wallet,
        quickStats: [
          { key: "rights", label: "会员权益", value: "12", icon: "♕", tone: "cyan", url: "/pages/mine-feature/index?type=member&title=会员权益" },
          { key: "points", label: "我的积分", value: "28", icon: "✦", tone: "violet", url: "/pages/mine-feature/index?type=wallet&title=我的积分" },
          { key: "coupon", label: "优惠券", value: String(coupons.length || 6), icon: "▭", tone: "violet", url: "/pages/mine-feature/index?type=coupons&title=优惠券" },
          { key: "friends", label: "好友邀请", value: "3", icon: "♙", tone: "violet", url: "/pages/mine-feature/index?type=support&title=好友邀请" }
        ],
        featureItems: buildFeatureItems({ coupons, orders, noShowLocks }),
        menuGroups: buildMenuGroups({ coupons, orders, noShowLocks }),
        loading: false
      });
    }).catch((error) => {
      const message = error.message || "我的信息加载失败";
      this.setData({ loading: false, errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    });
  },

  getPhoneNumber(e) {
    const detail = e.detail || {};
    if (detail.errMsg && detail.errMsg.indexOf("ok") === -1) {
      wx.showToast({ title: "未完成手机号授权", icon: "none" });
      return;
    }

    this.setData({
      "profile.phoneAuthorized": true,
      "profile.phone": detail.phoneNumber || detail.purePhoneNumber || this.data.profile.phone || ""
    });
    wx.showToast({ title: "已获取授权", icon: "success" });
  },

  goMenu(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    if (url === "/pages/my-reservations/index" || url === "/pages/assistant-list/index") {
      wx.switchTab({ url });
      return;
    }
    wx.navigateTo({ url });
  },

  goOrders() {
    wx.switchTab({ url: "/pages/my-reservations/index" });
  }
});

function setTabBarSelected(page, selected) {
  if (typeof page.getTabBar === "function" && page.getTabBar()) {
    page.getTabBar().setData({ selected });
  }
}

function normalizeProfile(profile) {
  return {
    nickName: profile.nickName || profile.nickname || "微信用户",
    avatarUrl: profile.avatarUrl || profile.avatar_url || "",
    memberLevel: profile.memberLevel || profile.member_level_name || "普通会员",
    phone: profile.phone || "",
    phoneAuthorized: Boolean(profile.phoneAuthorized || profile.phone)
  };
}

function normalizeWallet(wallet) {
  const balanceCent = wallet.balanceCent || wallet.balance_cent || 0;
  return {
    ...wallet,
    balanceText: wallet.balanceText || `¥${(Number(balanceCent) / 100).toFixed(2)}`,
    storedValueEnabled: wallet.storedValueEnabled !== false && wallet.stored_value_enabled !== false
  };
}

function buildMenuGroups({ coupons, orders, noShowLocks }) {
  return [
    {
      title: "常用服务",
      items: [
        { icon: "单", title: "我的订单", desc: `${orders.length} 条记录`, url: "/pages/mine-feature/index?type=orders&title=我的订单" },
        { icon: "约", title: "我的预约", desc: "查看到店、核实和开台状态", url: "/pages/my-reservations/index" },
        { icon: "券", title: "优惠券", desc: `${coupons.length} 张可查看`, url: "/pages/mine-feature/index?type=coupons&title=优惠券" },
        { icon: "会", title: "会员中心", desc: "会员等级与权益", url: "/pages/mine-feature/index?type=member&title=会员中心" }
      ]
    },
    {
      title: "资产与记录",
      items: [
        { icon: "储", title: "储值记录", desc: "仅展示余额，不接支付充值", url: "/pages/mine-feature/index?type=wallet&title=储值记录" },
        { icon: "助", title: "助教预约", desc: "查看助教服务记录", url: "/pages/mine-feature/index?type=assistant&title=助教预约" },
        { icon: "赛", title: "活动报名", desc: "赛事与活动报名记录", url: "/pages/mine-feature/index?type=campaigns&title=活动报名" },
        {
          icon: noShowLocks.length ? "!" : "客",
          title: noShowLocks.length ? "预约限制中" : "客服与门店",
          desc: noShowLocks.length ? "请联系门店处理爽约限制" : "电话、地址和反馈入口",
          url: "/pages/mine-feature/index?type=support&title=客服与门店"
        }
      ]
    }
  ];
}

function buildFeatureItems({ coupons = [], orders = [], noShowLocks = [] } = {}) {
  return [
    { icon: "☆", title: "我的收藏", desc: "8个收藏", tone: "cyan", url: "/pages/mine-feature/index?type=member&title=我的收藏" },
    { icon: "□", title: "我的评价", desc: `${Math.max(orders.length, 12)}条评价`, tone: "violet", url: "/pages/mine-feature/index?type=orders&title=我的评价" },
    { icon: "◎", title: "击球数据", desc: "本月12次", tone: "cyan", url: "/pages/mine-feature/index?type=member&title=击球数据" },
    { icon: "♕", title: "我的战绩", desc: "胜率68%", tone: "violet", url: "/pages/mine-feature/index?type=campaigns&title=我的战绩" },
    { icon: "▱", title: "积分商城", desc: "兑换好礼", tone: "violet", url: "/pages/mine-feature/index?type=wallet&title=积分商城" },
    { icon: "▣", title: "活动记录", desc: "3个活动", tone: "cyan", url: "/pages/mine-feature/index?type=campaigns&title=活动记录" },
    { icon: "✚", title: "分享有礼", desc: "邀请奖励", tone: "violet", url: "/pages/mine-feature/index?type=support&title=分享有礼" },
    { icon: noShowLocks.length ? "!" : "⬡", title: noShowLocks.length ? "预约限制" : "设置中心", desc: noShowLocks.length ? "联系门店" : "账号设置", tone: "cyan", url: "/pages/mine-feature/index?type=support&title=设置中心" }
  ];
}
