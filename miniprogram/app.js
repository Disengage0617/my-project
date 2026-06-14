App({
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: "cloud1-d2gp2ayiwab8f8a94",
        traceUser: true
      });
    }
  },

  globalData: {
    storeId: "store_demo_001",
    role: "customer"
  }
});
