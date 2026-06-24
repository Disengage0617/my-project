Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: "/pages/home/index",
        text: "首页",
        iconPath: "/assets/tabbar/home.png",
        selectedIconPath: "/assets/tabbar/home-active.png"
      },
      {
        pagePath: "/pages/reservation/index",
        text: "预约",
        iconPath: "/assets/tabbar/reservation.png",
        selectedIconPath: "/assets/tabbar/reservation-active.png"
      },
      {
        pagePath: "/pages/my-reservations/index",
        text: "订单",
        iconPath: "/assets/tabbar/orders.png",
        selectedIconPath: "/assets/tabbar/orders-active.png"
      },
      {
        pagePath: "/pages/assistant-list/index",
        text: "助教",
        iconPath: "/assets/tabbar/coach.png",
        selectedIconPath: "/assets/tabbar/coach-active.png"
      },
      {
        pagePath: "/pages/mine/index",
        text: "我的",
        iconPath: "/assets/tabbar/mine.png",
        selectedIconPath: "/assets/tabbar/mine-active.png"
      }
    ]
  },

  lifetimes: {
    attached() {
      this.updateSelectedByRoute();
    }
  },

  pageLifetimes: {
    show() {
      this.updateSelectedByRoute();
    }
  },

  methods: {
    updateSelectedByRoute() {
      const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
      const current = pages[pages.length - 1];
      const route = current && current.route ? `/${current.route}` : "";
      const selected = this.data.list.findIndex((item) => item.pagePath === route);
      if (selected >= 0 && selected !== this.data.selected) {
        this.setData({ selected });
      }
    },

    switchTab(event) {
      const index = Number(event.currentTarget.dataset.index || 0);
      const item = this.data.list[index];
      if (!item) return;
      this.setData({ selected: index });
      wx.switchTab({
        url: item.pagePath,
        fail: () => this.updateSelectedByRoute()
      });
    }
  }
});
