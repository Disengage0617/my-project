const api = require("../../services/api");

Page({
  data: {
    assistantId: "",
    assistant: null,
    startTime: "",
    durationHours: 1,
    submitting: false,
    errorMessage: ""
  },

  onLoad(options = {}) {
    this.setData({
      assistantId: options.id || "",
      startTime: getDefaultStartTimeText()
    });
    this.loadAssistant();
  },

  loadAssistant() {
    api.call("getAssistants", { storeId: getApp().globalData.storeId }).then((res) => {
      const list = (res.list || []).map(normalizeAssistant);
      const assistant = list.find((item) => item.id === this.data.assistantId) || list[0] || null;
      this.setData({
        assistant,
        assistantId: assistant ? assistant.id : this.data.assistantId
      });
    }).catch((error) => {
      this.setData({ errorMessage: error.message || "助教信息加载失败" });
    });
  },

  changeDuration(e) {
    const delta = Number(e.currentTarget.dataset.delta || 0);
    const durationHours = Math.min(3, Math.max(1, this.data.durationHours + delta));
    this.setData({ durationHours });
  },

  submit() {
    if (this.data.submitting) return;
    if (!this.data.assistantId) {
      wx.showToast({ title: "请先选择助教", icon: "none" });
      return;
    }

    const startAt = buildStartAt(this.data.startTime);
    const endAt = new Date(startAt.getTime() + this.data.durationHours * 60 * 60 * 1000);
    this.setData({ submitting: true, errorMessage: "" });
    api.call("createAssistantReservation", {
      storeId: getApp().globalData.storeId,
      assistantId: this.data.assistantId,
      startTime: startAt.toISOString(),
      endTime: endAt.toISOString()
    }).then((res) => {
      wx.showToast({ title: res.status || "已提交", icon: "success" });
    }).catch((error) => {
      const message = error.message || "提交失败";
      this.setData({ errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    }).finally(() => {
      this.setData({ submitting: false });
    });
  }
});

function getDefaultStartTimeText() {
  const date = new Date(Date.now() + 40 * 60 * 1000);
  const minutes = date.getMinutes() < 30 ? 30 : 0;
  if (minutes === 0) date.setHours(date.getHours() + 1);
  date.setMinutes(minutes, 0, 0);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildStartAt(timeText) {
  const [hour, minute] = (timeText || getDefaultStartTimeText()).split(":").map(Number);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  if (date.getTime() < Date.now() + 30 * 60 * 1000) {
    date.setDate(date.getDate() + 1);
  }
  return date;
}

function normalizeAssistant(item) {
  return {
    ...item,
    id: item.id || item._id,
    name: item.name || item.assistant_name || "助教",
    tagsText: item.tagsText || item.tags_text || (item.tags || []).join("、"),
    intro: item.intro || "到店后由员工确认服务安排。",
    price: item.price || (item.service_price_cent ? Math.round(item.service_price_cent / 100) : ""),
    status: item.status || ""
  };
}

function pad(value) {
  return String(value).padStart(2, "0");
}
