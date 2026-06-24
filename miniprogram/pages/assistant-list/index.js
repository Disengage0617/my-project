const api = require("../../services/api.js");
const mock = require("../../utils/mock");

const COACH_TABS = [
  { key: "popular", label: "人气推荐" },
  { key: "certified", label: "职业认证" },
  { key: "skill", label: "擅长打法" },
  { key: "available", label: "可约时间" }
];

Page({
  data: {
    tabs: COACH_TABS,
    activeTab: "popular",
    assistants: [],
    filteredAssistants: [],
    loading: false,
    errorMessage: ""
  },

  onLoad() {
    this.loadData();
  },

  onShow() {
    setTabBarSelected(this, 3);
    this.loadData();
  },

  loadData() {
    this.setData({ loading: true, errorMessage: "" });
    api.call("getAssistants", { storeId: getApp().globalData.storeId }).then((res) => {
      const assistants = mergeAssistantFallbacks(res.list || res.items || []).map(normalizeAssistant);
      this.setData({
        assistants,
        filteredAssistants: filterAssistants(assistants, this.data.activeTab),
        loading: false
      });
    }).catch((error) => {
      const message = error.message || "助教列表加载失败";
      this.setData({ loading: false, errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    });
  },

  switchCoachTab(e) {
    const key = e.currentTarget.dataset.key || "popular";
    if (key === this.data.activeTab) return;
    this.setData({
      activeTab: key,
      filteredAssistants: filterAssistants(this.data.assistants, key)
    });
  },

  goBooking(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) {
      wx.showToast({ title: "助教信息缺失", icon: "none" });
      return;
    }
    wx.navigateTo({
      url: `/pages/assistant-booking/index?id=${encodeURIComponent(id)}`,
      fail: () => wx.showToast({ title: "助教预约页打开失败", icon: "none" })
    });
  }
});

function setTabBarSelected(page, selected) {
  if (typeof page.getTabBar === "function" && page.getTabBar()) {
    page.getTabBar().setData({ selected });
  }
}

function filterAssistants(list, tabKey) {
  const source = Array.isArray(list) ? list.slice() : [];
  if (tabKey === "certified") {
    return source.filter((item) => item.level || item.certified || item.certifiedText);
  }
  if (tabKey === "skill") {
    return source.filter((item) => item.tagsText || item.intro);
  }
  if (tabKey === "available") {
    return source.filter((item) => isAvailableStatus(item.status));
  }
  return source.sort((a, b) => Number(b.bookingCount || 0) - Number(a.bookingCount || 0));
}

function isAvailableStatus(status) {
  const text = String(status || "").trim();
  return ["free", "available", "空闲"].indexOf(text) >= 0;
}

function normalizeAssistant(item) {
  const photoUrl = item.photoUrl || item.photo_url || item.avatar_url || item.thumb_url || "/assets/generated/assistant-thumb.jpg";
  const price = item.price || item.price_yuan || (item.service_price_cent ? Math.round(item.service_price_cent / 100) : "");
  const bookingCount = item.bookingCount || item.booking_count || item.reserve_count || 0;
  return {
    ...item,
    id: item.id || item._id,
    name: item.name || item.assistant_name || "助教",
    level: item.level || item.level_name || "",
    tagsText: item.tagsText || item.tags_text || (item.tags || []).join("、"),
    intro: item.intro || "到店后由员工确认服务安排。",
    price,
    rating: item.rating || item.score || "4.8",
    bookingCount,
    bookingText: `${bookingCount || 0} 次预约`,
    status: item.status || "",
    photoUrl
  };
}

function mergeAssistantFallbacks(list) {
  const source = Array.isArray(list) ? list : [];
  const merged = source.slice();
  const usedIds = new Set(source.map((item) => item.id || item._id));
  const fallback = mock.assistants || [];
  for (const item of fallback) {
    const id = item.id || item._id;
    if (merged.length >= 8) break;
    if (!usedIds.has(id)) {
      merged.push(item);
      usedIds.add(id);
    }
  }
  return merged;
}
