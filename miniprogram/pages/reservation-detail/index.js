const api = require("../../services/api");

Page({
  data: {
    reservationId: "",
    reservation: null,
    loading: false,
    errorMessage: "",
    statusFlow: ["待到店", "待核实", "已到店", "进行中", "已完成"]
  },

  onLoad(options = {}) {
    this.setData({ reservationId: options.id || "" });
    this.loadData();
  },

  loadData() {
    this.setData({ loading: true, errorMessage: "" });
    api.call("getMyReservations", { storeId: getApp().globalData.storeId }).then((res) => {
      const list = (res.list || []).map(normalizeReservation);
      const reservation = list.find((item) => item.id === this.data.reservationId) || list[0] || null;
      this.setData({ reservation, loading: false });
    }).catch((error) => {
      const message = error.message || "预约详情加载失败";
      this.setData({ loading: false, errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    });
  }
});

function normalizeReservation(item) {
  return {
    ...item,
    id: item.id || item._id,
    tableCode: item.tableCode || item.table_code || item.table_id || "",
    tableType: item.tableType || item.table_type_name || item.table_type || "",
    status: item.status || "",
    startTime: item.startTime || formatTime(item.start_time),
    endTime: item.endTime || formatTime(item.end_time),
    assistantText: item.assistantText || (item.assistant_id ? `助教 ${item.assistant_name || item.assistant_id}` : "未选择")
  };
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}
