const api = require("../../services/api");

Page({
  data: {
    tables: [],
    assistants: [],
    selectedTableId: "",
    selectedAssistantId: "",
    startTime: "",
    durationHours: 2,
    peopleCount: 2,
    remark: "",
    ruleConfirmed: true,
    loading: false,
    submiting: false,
    errorMessage: ""
  },

  onLoad() {
    this.setData({ startTime: getDefaultStartTimeText() });
    this.loadOptions();
  },

  loadOptions() {
    this.setData({ loading: true, errorMessage: "" });
    Promise.all([
      api.call("getAvailableTables", { storeId: getApp().globalData.storeId }),
      api.call("getAssistants", { storeId: getApp().globalData.storeId })
    ]).then(([tableRes, assistantRes]) => {
      const tables = (tableRes.list || []).map(normalizeTable);
      const assistants = (assistantRes.list || []).map(normalizeAssistant);
      this.setData({
        tables,
        assistants,
        selectedTableId: this.data.selectedTableId || (tables[0] && tables[0].id) || "",
        loading: false
      });
    }).catch((error) => {
      const message = getErrorMessage(error, "可预约资源加载失败");
      this.setData({ loading: false, errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    });
  },

  selectTable(e) {
    this.setData({ selectedTableId: e.currentTarget.dataset.id });
  },

  selectAssistant(e) {
    this.setData({ selectedAssistantId: e.currentTarget.dataset.id });
  },

  changeDuration(e) {
    const delta = Number(e.currentTarget.dataset.delta || 0);
    const durationHours = Math.min(4, Math.max(1, this.data.durationHours + delta));
    this.setData({ durationHours });
  },

  changePeople(e) {
    const delta = Number(e.currentTarget.dataset.delta || 0);
    const peopleCount = Math.min(8, Math.max(1, this.data.peopleCount + delta));
    this.setData({ peopleCount });
  },

  toggleRule() {
    this.setData({ ruleConfirmed: !this.data.ruleConfirmed });
  },

  submitReservation() {
    if (this.data.submiting) return;
    if (!this.data.selectedTableId) {
      wx.showToast({ title: "请先选择桌台", icon: "none" });
      return;
    }
    if (!this.data.ruleConfirmed) {
      wx.showToast({ title: "请先确认预约规则", icon: "none" });
      return;
    }

    const startAt = buildStartAt(this.data.startTime);
    const endAt = new Date(startAt.getTime() + this.data.durationHours * 60 * 60 * 1000);
    const payload = {
      storeId: getApp().globalData.storeId,
      tableId: this.data.selectedTableId,
      assistantId: this.data.selectedAssistantId,
      startTime: startAt.toISOString(),
      endTime: endAt.toISOString(),
      durationHours: this.data.durationHours,
      peopleCount: this.data.peopleCount,
      remark: this.data.remark
    };

    this.setData({ submiting: true, errorMessage: "" });
    api.call("createReservation", payload).then(() => {
      wx.showToast({ title: "预约已提交", icon: "success" });
      wx.switchTab({ url: "/pages/my-reservations/index" });
    }).catch((error) => {
      const message = getErrorMessage(error, "预约失败");
      this.setData({ errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    }).finally(() => {
      this.setData({ submiting: false });
    });
  }
});

function getDefaultStartTimeText() {
  const date = new Date(Date.now() + 40 * 60 * 1000);
  const minutes = date.getMinutes() < 30 ? 30 : 0;
  if (minutes === 0) {
    date.setHours(date.getHours() + 1);
  }
  date.setMinutes(minutes, 0, 0);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildStartAt(timeText) {
  const [hour, minute] = (timeText || getDefaultStartTimeText()).split(":").map(Number);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);

  const minStart = Date.now() + 30 * 60 * 1000;
  if (date.getTime() < minStart) {
    date.setDate(date.getDate() + 1);
  }
  return date;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function normalizeTable(item) {
  return {
    ...item,
    id: item.id || item._id,
    code: item.code || item.table_no || "",
    area: item.area || item.area_name || "",
    type: item.type || item.table_type_name || "",
    status: item.status || "",
    price: item.price || (item.price_cent ? Math.round(item.price_cent / 100) : "")
  };
}

function normalizeAssistant(item) {
  return {
    ...item,
    id: item.id || item._id,
    name: item.name || item.assistant_name || "助教",
    status: item.status || "",
    tagsText: item.tagsText || item.tags_text || (item.tags || []).join("、"),
    price: item.price || (item.service_price_cent ? Math.round(item.service_price_cent / 100) : "")
  };
}

function getErrorMessage(error, fallback) {
  return error && error.message ? error.message : fallback;
}
