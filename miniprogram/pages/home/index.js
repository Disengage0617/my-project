const api = require("../../services/api.js");

Page({
  data: {
    overview: getDefaultOverview(),
    pageConfig: getDefaultPageConfig(),
    homeModules: getDefaultHomeModules(),
    heroModule: getDefaultHomeModules().hero,
    heroSlides: getDefaultHeroSlides(),
    activeHeroSlide: getDefaultHeroSlides()[0],
    activeHeroIndex: 0,
    tableZones: buildTableZones(getDefaultOverview()),
    activeZoneKey: "standard",
    activityModule: getDefaultHomeModules().activities,
    coachModule: getDefaultHomeModules().coach,
    eventModule: getDefaultHomeModules().event_feature,
    errorMessage: ""
  },

  onLoad() {
    this.loadOverview();
  },

  onShow() {
    setTabBarSelected(this, 0);
    this.loadOverview();
  },

  loadOverview() {
    const storeId = getApp().globalData.storeId;
    return Promise.all([
      api.call("getStoreOverview", { storeId }),
      api.call("getPageConfig", { storeId, pageKey: "home" }).catch(() => ({ config: getDefaultPageConfig() }))
    ]).then(([overview, configRes]) => {
      const pageConfig = normalizePageConfig(configRes.config || configRes);
      const homeModules = buildHomeModules(pageConfig.modules);
      const heroSlides = buildHeroSlides(homeModules.hero);
      this.setData({
        overview,
        pageConfig,
        homeModules,
        heroModule: homeModules.hero,
        heroSlides,
        activeHeroSlide: heroSlides[this.data.activeHeroIndex] || heroSlides[0],
        tableZones: buildTableZones(overview),
        activityModule: homeModules.activities,
        coachModule: homeModules.coach,
        eventModule: homeModules.event_feature,
        errorMessage: ""
      });
    }).catch((error) => {
      const message = getErrorMessage(error, "门店概览加载失败");
      this.setData({ errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    });
  },

  goReservation() {
    getApp().globalData.pendingReservationTableType = "";
    wx.switchTab({ url: "/pages/reservation/index" });
  },

  heroSwiperChange(event) {
    const current = event.detail && typeof event.detail.current === "number" ? event.detail.current : 0;
    this.setData({
      activeHeroIndex: current,
      activeHeroSlide: this.data.heroSlides[current] || this.data.heroSlides[0]
    });
  },

  selectZone(event) {
    const zoneKey = event.currentTarget.dataset.zoneKey;
    getApp().globalData.pendingReservationTableType = zoneKey || "";
    this.setData({ activeZoneKey: zoneKey });
    wx.switchTab({ url: "/pages/reservation/index" });
  },

  goPrice() {
    wx.navigateTo({ url: "/pages/store-price/index" });
  },

  goAssistants() {
    wx.switchTab({ url: "/pages/assistant-list/index" });
  },

  goCampaigns() {
    wx.navigateTo({ url: "/pages/campaign-list/index" });
  },

  goMyReservations() {
    wx.switchTab({ url: "/pages/my-reservations/index" });
  }
});

function getErrorMessage(error, fallback) {
  return error && error.message ? error.message : fallback;
}

function setTabBarSelected(page, selected) {
  if (typeof page.getTabBar === "function" && page.getTabBar()) {
    page.getTabBar().setData({ selected });
  }
}

function getDefaultOverview() {
  return {
    store: {
      name: "W 台球 · 昆明路店",
      businessHours: "24小时营业",
      tableCount: 40,
      reservationLeadMinutes: 30,
      noShowLockDays: 3
    },
    freeTableCount: 18,
    freeAssistantCount: 6
  };
}

function normalizePageConfig(config) {
  config = config || {};
  const fallback = getDefaultPageConfig();
  const modules = Array.isArray(config.modules) ? config.modules : fallback.modules;
  return {
    ...fallback,
    ...config,
    theme: { ...fallback.theme, ...(config.theme || {}) },
    modules: modules
      .map((item, index) => ({ enabled: true, sort_order: index + 1, ...item }))
      .filter((item) => item.enabled !== false)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  };
}

function buildHomeModules(modules) {
  const defaults = getDefaultHomeModules();
  return modules.reduce((acc, item) => {
    if (item.id && acc[item.id]) acc[item.id] = { ...acc[item.id], ...item };
    if (item.type && acc[item.type]) acc[item.type] = { ...acc[item.type], ...item };
    return acc;
  }, defaults);
}

function buildHeroSlides(heroModule) {
  return [
    {
      key: "table",
      title: heroModule.title || "W POOL",
      subtitle: heroModule.subtitle || "精准一杆，掌控全场",
      kicker: "CYBER CLUB",
      image_url: "/assets/generated/home-cyber-hero-table.png"
    },
    {
      key: "map",
      title: "实时桌台态势",
      subtitle: "A-E 五区桌台状态 30 秒刷新",
      kicker: "LIVE CONTROL ROOM",
      image_url: "/assets/generated/home-cyber-zone-map.png"
    }
  ];
}

function getDefaultHeroSlides() {
  return buildHeroSlides(getDefaultHomeModules().hero);
}

function buildTableZones(overview) {
  const freeTotal = Math.max(0, Number(overview.freeTableCount) || 18);
  const defaults = [
    { key: "standard", letter: "A", name: "普台区", range: "A01-A12", total: 12, fallbackFree: 6, tone: "cyan" },
    { key: "silver", letter: "B", name: "银腿区", range: "B01-B10", total: 10, fallbackFree: 4, tone: "blue" },
    { key: "duya", letter: "C", name: "独牙区", range: "C01-C08", total: 8, fallbackFree: 3, tone: "green" },
    { key: "gold", letter: "D", name: "金腿区", range: "D01-D06", total: 6, fallbackFree: 3, tone: "gold" },
    { key: "rose_gold", letter: "E", name: "玫瑰金区", range: "E01-E04", total: 4, fallbackFree: 2, tone: "rose" }
  ];
  const fallbackTotal = defaults.reduce((sum, item) => sum + item.fallbackFree, 0);
  return defaults.map((item) => {
    const scaled = fallbackTotal > 0 ? Math.round((item.fallbackFree / fallbackTotal) * freeTotal) : item.fallbackFree;
    return {
      ...item,
      free: Math.min(item.total, Math.max(0, scaled))
    };
  });
}

function getDefaultHomeModules() {
  return {
    hero: {
      id: "hero",
      type: "hero",
      enabled: true,
      title: "W 台球俱乐部",
      subtitle: "24小时营业，到店后员工核实开台",
      image_url: "/assets/generated/home-cyber-hero-table.png",
      cta_text: "立即预约桌台"
    },
    activities: {
      id: "activities",
      type: "activity_entry",
      enabled: true,
      title: "店内活动",
      subtitle: "赛事、练习局和会员活动",
      image_url: "/assets/generated/billiards-bg-option-2.png"
    },
    coach: {
      id: "coach",
      type: "assistant_entry",
      enabled: true,
      title: "助理教练",
      subtitle: "查看状态与价格",
      image_url: "/assets/generated/assistant-coach-card.jpg"
    },
    event_feature: {
      id: "event_feature",
      type: "event_feature",
      enabled: true,
      title: "暗夜霓虹排位赛",
      subtitle: "今晚开放报名，名额 0 / 32",
      image_url: "/assets/generated/billiards-bg-option-4.png",
      tag: "筹备中"
    }
  };
}

function getDefaultPageConfig() {
  return {
    page_key: "home",
    theme: {
      primary_color: "#18d6a3",
      accent_color: "#e6c15d"
    },
    modules: Object.values(getDefaultHomeModules())
  };
}
