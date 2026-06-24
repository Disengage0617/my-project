const api = require("../../services/api.js");
const { TABLE_STATUS } = require("../../utils/constants");

Page({
  data: {
    tables: [],
    loading: false,
    actioningId: "",
    errorMessage: ""
  },

  onLoad() {
    this.loadData();
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    this.setData({ loading: true, errorMessage: "" });
    api.call("getAvailableTables", { storeId: getApp().globalData.storeId }).then((res) => {
      this.setData({ tables: (res.list || []).map(normalizeTable), loading: false });
    }).catch((error) => {
      const message = error.message || "桌台状态加载失败";
      this.setData({ loading: false, errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    });
  },

  cycleStatus(e) {
    const tableId = e.currentTarget.dataset.id;
    const currentStatus = e.currentTarget.dataset.status;
    if (!tableId || this.data.actioningId) return;
    const toStatus = getNextStatus(currentStatus);
    this.setData({ actioningId: tableId, errorMessage: "" });
    api.call("updateTableStatus", {
      storeId: getApp().globalData.storeId,
      tableId,
      toStatus,
      reason: "前端桌台网格调整状态"
    }).then((res) => {
      const table = res.table || {};
      this.setData({
        tables: this.data.tables.map((item) => item.id === tableId ? normalizeTable({ ...item, ...table, status: table.status || toStatus }) : item)
      });
      wx.showToast({ title: `已切换为${formatTableStatus(table.status || toStatus)}`, icon: "success" });
    }).catch((error) => {
      const message = error.message || "桌台状态更新失败";
      this.setData({ errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    }).finally(() => {
      this.setData({ actioningId: "" });
    });
  }
});

function getNextStatus(status) {
  const list = ["idle", "cleaning", "repairing"];
  const index = list.indexOf(toApiStatus(status));
  return list[(index + 1) % list.length];
}

function normalizeTable(item = {}) {
  const status = toApiStatus(item.status);
  return {
    ...item,
    id: item.id || item._id,
    code: item.code || item.table_no || "",
    area: item.area || item.area_name || "",
    type: item.type || item.table_type_name || item.table_type || "",
    status,
    statusText: formatTableStatus(status)
  };
}

function toApiStatus(status) {
  const map = {
    [TABLE_STATUS.FREE]: "idle",
    [TABLE_STATUS.CLEANING]: "cleaning",
    [TABLE_STATUS.REPAIRING]: "repairing",
    [TABLE_STATUS.DISABLED]: "disabled",
    [TABLE_STATUS.RESERVED]: "reserved",
    [TABLE_STATUS.USING]: "in_use"
  };
  return map[status] || status || "idle";
}

function formatTableStatus(status) {
  const map = {
    idle: TABLE_STATUS.FREE,
    reserved: TABLE_STATUS.RESERVED,
    in_use: TABLE_STATUS.USING,
    cleaning: TABLE_STATUS.CLEANING,
    repairing: TABLE_STATUS.REPAIRING,
    disabled: TABLE_STATUS.DISABLED
  };
  return map[status] || status || TABLE_STATUS.FREE;
}
