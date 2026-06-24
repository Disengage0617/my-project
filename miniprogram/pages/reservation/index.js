const api = require("../../services/api.js");
const mock = require("../../utils/mock.js");
const { TABLE_TYPES } = require("../../utils/constants.js");

Page({
  data: {
    tables: [],
    assistants: [],
    dateOptions: [],
    tableTypeOptions: [],
    selectedDate: "",
    selectedTableType: "all",
    selectedTableId: "",
    selectedAssistantId: "",
    startTime: "",
    endTimeText: "",
    timePickerHours: [],
    timePickerMinutes: [],
    timePickerValue: [0, 0],
    pendingTimePickerValue: [0, 0],
    isPickingTime: false,
    durationHours: 2,
    peopleCount: 1,
    remark: "",
    ruleConfirmed: true,
    estimatedAmount: 0,
    estimatedAmountText: "到店结算",
    availabilityMessage: "",
    canSubmit: false,
    loading: false,
    submitting: false,
    errorMessage: ""
  },

  onLoad() {
    const startAt = getDefaultStartAt();
    const selectedDate = formatDateValue(startAt);
    const startTime = formatTimeText(startAt);
    const pickerData = buildTimePickerData(startTime);
    this.setData({
      dateOptions: buildDateOptions(startAt),
      tableTypeOptions: buildTableTypeOptions(),
      selectedDate,
      startTime,
      endTimeText: formatTimeText(new Date(startAt.getTime() + this.data.durationHours * 60 * 60 * 1000)),
      ...pickerData,
      pendingTimePickerValue: pickerData.timePickerValue
    });
    this.loadOptions(true);
  },

  onShow() {
    setTabBarSelected(this, 1);
    const app = getApp();
    const pendingTableType = app.globalData.pendingReservationTableType;
    if (!pendingTableType) return;
    app.globalData.pendingReservationTableType = "";
    const normalizedType = normalizeTableTypeKey(pendingTableType);
    if (!this.data.tableTypeOptions.length) return;
    const exists = this.data.tableTypeOptions.some((item) => item.key === normalizedType);
    if (!exists || normalizedType === this.data.selectedTableType) return;
    this.setData({ selectedTableType: normalizedType, selectedTableId: "" }, () => this.loadOptions(false));
  },

  loadOptions(shouldLoadAssistants) {
    const timeRange = buildTimeRange(this.data.selectedDate, this.data.startTime, this.data.durationHours);
    const storeId = getApp().globalData.storeId;
    const tableType = this.data.selectedTableType === "all" ? "" : this.data.selectedTableType;
    const tablePayload = {
      storeId,
      store_id: storeId,
      startTime: timeRange.startAt.toISOString(),
      start_time: timeRange.startAt.toISOString(),
      endTime: timeRange.endAt.toISOString(),
      end_time: timeRange.endAt.toISOString(),
      tableType,
      table_type: tableType
    };
    const requests = [api.call("getAvailableTables", tablePayload)];
    if (shouldLoadAssistants || !this.data.assistants.length) {
      requests.push(api.call("getAssistants", { storeId, store_id: storeId }));
    }

    this.setData({ loading: true, errorMessage: "" });
    Promise.all(requests).then((results) => {
      const tableRes = results[0] || {};
      const assistantRes = results[1] || {};
      const tables = getList(tableRes)
        .map((item) => normalizeTable(item, timeRange))
        .filter((item) => matchSelectedTableType(item, this.data.selectedTableType));
      const assistants = results[1]
        ? mergeAssistantFallbacks(getList(assistantRes)).map(normalizeAssistant)
        : this.data.assistants;
      const selectedTable = tables.find((item) => item.id === this.data.selectedTableId && item.canSelect);
      const firstAvailableTable = tables.find((item) => item.canSelect);
      this.setData({
        tables,
        assistants,
        selectedTableId: selectedTable ? selectedTable.id : ((firstAvailableTable && firstAvailableTable.id) || ""),
        loading: false
      }, () => this.updateSummary());
    }).catch((error) => {
      const message = getErrorMessage(error, "可预约资源加载失败");
      this.setData({ loading: false, errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    });
  },

  selectDate(e) {
    const value = e.currentTarget.dataset.value;
    if (!value || value === this.data.selectedDate) return;
    this.setData({ selectedDate: value, selectedTableId: "" }, () => this.loadOptions(false));
  },

  selectTableType(e) {
    const key = e.currentTarget.dataset.key || "all";
    if (key === this.data.selectedTableType) return;
    this.setData({ selectedTableType: key, selectedTableId: "" }, () => this.loadOptions(false));
  },

  selectTable(e) {
    const id = e.currentTarget.dataset.id;
    const table = this.data.tables.find((item) => item.id === id);
    if (!table || !table.canSelect) {
      wx.showToast({ title: table ? table.availabilityText : "当前桌台不可预约", icon: "none" });
      return;
    }
    this.setData({ selectedTableId: id }, () => this.updateSummary());
  },

  selectAssistant(e) {
    const id = e.currentTarget.dataset.id || "";
    const nextId = this.data.selectedAssistantId === id ? "" : id;
    this.setData({ selectedAssistantId: nextId }, () => this.updateSummary());
  },

  changeDuration(e) {
    const delta = Number(e.currentTarget.dataset.delta || 0);
    const durationHours = Math.min(4, Math.max(1, this.data.durationHours + delta));
    this.setData({ durationHours, selectedTableId: "" }, () => this.loadOptions(false));
  },

  startTimePicking() {
    this.setData({
      isPickingTime: true,
      pendingTimePickerValue: this.data.timePickerValue
    });
  },

  changeTimePicker(e) {
    const pickerValue = normalizePickerValue(e.detail && e.detail.value);
    if (this.data.isPickingTime) {
      this.setData({ pendingTimePickerValue: pickerValue });
      return;
    }
    this.commitTimePickerValue(pickerValue);
  },

  endTimePicking(e) {
    const pickerValue = normalizePickerValue((e.detail && e.detail.value) || this.data.pendingTimePickerValue);
    this.commitTimePickerValue(pickerValue);
  },

  commitTimePickerValue(pickerValue) {
    const normalizedValue = normalizePickerValue(pickerValue);
    const hour = this.data.timePickerHours[normalizedValue[0]] || "00";
    const minute = this.data.timePickerMinutes[normalizedValue[1]] || "00";
    this.setData({
      isPickingTime: false,
      pendingTimePickerValue: normalizedValue,
      timePickerValue: normalizedValue,
      startTime: `${hour}:${minute}`,
      selectedTableId: ""
    }, () => this.loadOptions(false));
  },

  changePeople(e) {
    const delta = Number(e.currentTarget.dataset.delta || 0);
    const peopleCount = Math.min(8, Math.max(1, this.data.peopleCount + delta));
    this.setData({ peopleCount });
  },

  toggleRule() {
    this.setData({ ruleConfirmed: !this.data.ruleConfirmed }, () => this.updateSummary());
  },

  inputRemark(e) {
    this.setData({ remark: e.detail.value || "" });
  },

  updateSummary() {
    const timeRange = buildTimeRange(this.data.selectedDate, this.data.startTime, this.data.durationHours);
    const selectedTable = this.data.tables.find((item) => item.id === this.data.selectedTableId);
    const selectedAssistant = this.data.assistants.find((item) => item.id === this.data.selectedAssistantId);
    const tableAmount = selectedTable && selectedTable.price ? Number(selectedTable.price) * this.data.durationHours : 0;
    const assistantAmount = selectedAssistant && selectedAssistant.price ? Number(selectedAssistant.price) * this.data.durationHours : 0;
    const estimatedAmount = tableAmount + assistantAmount;
    const isTooEarly = timeRange.startAt.getTime() < Date.now() + 30 * 60 * 1000;
    const availabilityMessage = buildAvailabilityMessage({
      isTooEarly,
      selectedTable,
      hasTables: this.data.tables.length > 0,
      hasAvailableTable: this.data.tables.some((item) => item.canSelect)
    });
    this.setData({
      endTimeText: formatTimeText(timeRange.endAt),
      estimatedAmount,
      estimatedAmountText: estimatedAmount ? `¥${estimatedAmount}` : "到店结算",
      availabilityMessage,
      canSubmit: Boolean(selectedTable && selectedTable.canSelect && this.data.ruleConfirmed && !isTooEarly)
    });
  },

  submitReservation() {
    if (this.data.submitting) return;
    const selectedTable = this.data.tables.find((item) => item.id === this.data.selectedTableId);
    if (!this.data.selectedTableId) {
      wx.showToast({ title: "请先选择桌台", icon: "none" });
      return;
    }
    if (!selectedTable || !selectedTable.canSelect) {
      wx.showToast({ title: selectedTable ? selectedTable.availabilityText : "当前桌台不可预约", icon: "none" });
      return;
    }
    if (!this.data.ruleConfirmed) {
      wx.showToast({ title: "请先确认预约规则", icon: "none" });
      return;
    }

    const timeRange = buildTimeRange(this.data.selectedDate, this.data.startTime, this.data.durationHours);
    const storeId = getApp().globalData.storeId;
    const payload = {
      storeId,
      store_id: storeId,
      tableId: this.data.selectedTableId,
      table_id: this.data.selectedTableId,
      assistantId: this.data.selectedAssistantId,
      assistant_id: this.data.selectedAssistantId,
      startTime: timeRange.startAt.toISOString(),
      start_time: timeRange.startAt.toISOString(),
      endTime: timeRange.endAt.toISOString(),
      end_time: timeRange.endAt.toISOString(),
      durationHours: this.data.durationHours,
      duration_hours: this.data.durationHours,
      peopleCount: this.data.peopleCount,
      people_count: this.data.peopleCount,
      remark: this.data.remark,
      estimatedAmount: this.data.estimatedAmount,
      estimated_amount: this.data.estimatedAmount
    };

    this.setData({ submitting: true, errorMessage: "" });
    api.call("createReservation", payload).then(() => {
      wx.showToast({ title: "预约已提交", icon: "success" });
      wx.switchTab({ url: "/pages/my-reservations/index" });
    }).catch((error) => {
      const message = getErrorMessage(error, "预约失败");
      this.setData({ errorMessage: message });
      wx.showToast({ title: message, icon: "none" });
    }).finally(() => {
      this.setData({ submitting: false });
    });
  }
});

function getDefaultStartAt() {
  const date = new Date(Date.now() + 40 * 60 * 1000);
  const minutes = date.getMinutes() < 30 ? 30 : 0;
  if (minutes === 0) date.setHours(date.getHours() + 1);
  date.setMinutes(minutes, 0, 0);
  return date;
}

function setTabBarSelected(page, selected) {
  if (typeof page.getTabBar === "function" && page.getTabBar()) {
    page.getTabBar().setData({ selected });
  }
}

function buildTimePickerData(startTime) {
  const hours = Array.from({ length: 24 }, (_, index) => pad(index));
  const minutes = Array.from({ length: 12 }, (_, index) => pad(index * 5));
  const [hour, minute] = (startTime || "00:00").split(":");
  return {
    timePickerHours: hours,
    timePickerMinutes: minutes,
    timePickerValue: [
      Math.max(0, hours.indexOf(hour)),
      Math.max(0, minutes.indexOf(minute))
    ]
  };
}

function normalizePickerValue(value) {
  const source = Array.isArray(value) ? value : [0, 0];
  return [
    Math.max(0, Math.min(23, Number(source[0]) || 0)),
    Math.max(0, Math.min(11, Number(source[1]) || 0))
  ];
}

function buildDateOptions(anchorDate) {
  const base = anchorDate || new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + index);
    return {
      value: formatDateValue(date),
      label: index === 0 ? "今天" : index === 1 ? "明天" : `周${"日一二三四五六".charAt(date.getDay())}`,
      dateText: `${date.getMonth() + 1}/${date.getDate()}`
    };
  });
}

function buildTableTypeOptions() {
  return [{ key: "all", name: "全部" }].concat(TABLE_TYPES.map((item) => ({ key: item.key, name: item.name })));
}

function buildTimeRange(dateText, timeText, durationHours) {
  const sourceDate = parseDateValue(dateText);
  const [hour, minute] = (timeText || formatTimeText(getDefaultStartAt())).split(":").map(Number);
  const startAt = new Date(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate(), hour || 0, minute || 0, 0, 0);
  const endAt = new Date(startAt.getTime() + durationHours * 60 * 60 * 1000);
  return { startAt, endAt };
}

function parseDateValue(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return getDefaultStartAt();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatDateValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTimeText(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getList(res) {
  return res.list || res.items || res.tables || [];
}

function normalizeTable(item, timeRange) {
  const code = item.code || item.table_no || item.tableCode || "";
  const rawType = item.table_type || item.type_key || item.type || item.table_type_name || "";
  const typeKey = normalizeTableTypeKey(rawType);
  const typeName = item.table_type_name || item.typeName || normalizeTableType(rawType) || item.type || "桌台";
  const rawStatus = item.status || item.table_status || "";
  const statusText = normalizeTableStatus(rawStatus);
  const enabled = item.enabled !== false && item.disabled !== true;
  const available = item.available !== false && enabled && isSelectableTableStatus(rawStatus, statusText);
  const nextAvailableTime = item.nextAvailableTime || item.next_available_time || "";
  return {
    ...item,
    id: item.id || item._id || item.table_id,
    code,
    displayName: `${typeName} ${code}`.trim(),
    area: item.area || item.area_name || "",
    type: typeName,
    typeKey,
    status: statusText,
    price: item.price || item.price_yuan || (item.price_cent ? Math.round(item.price_cent / 100) : ""),
    imageUrl: getTableImage(typeKey, code),
    seatText: getSeatText(typeKey),
    canSelect: available,
    availabilityText: available ? "可预约" : buildTableUnavailableText(statusText, nextAvailableTime),
    availabilityTip: available ? `${formatTimeText(timeRange.startAt)}-${formatTimeText(timeRange.endAt)} 可预约` : buildTableUnavailableText(statusText, nextAvailableTime),
    cardClass: available ? "" : "disabled-card"
  };
}

function getTableImage(typeKey, code) {
  const map = {
    standard: "/assets/generated/billiards-bg-option-1.png",
    silver: "/assets/generated/billiards-bg-option-3.png",
    duya: "/assets/generated/billiards-bg-option-4.png",
    gold: "/assets/generated/billiards-bg-option-2.png",
    rose_gold: "/assets/generated/billiards-bg-option-6-live.png"
  };
  if (String(code || "").charAt(0) === "C") return map.duya;
  return map[typeKey] || "/assets/generated/home-cyber-hero-table.png";
}

function getSeatText(typeKey) {
  if (typeKey === "gold" || typeKey === "rose_gold") return "高杆";
  if (typeKey === "silver" || typeKey === "duya") return "中杆";
  return "低杆";
}

function matchSelectedTableType(table, selectedTableType) {
  if (!selectedTableType || selectedTableType === "all") return true;
  return normalizeTableTypeKey(selectedTableType) === normalizeTableTypeKey(table.typeKey || table.type);
}

function normalizeTableTypeKey(value) {
  const text = String(value || "").trim();
  const codeMatch = text.match(/^([A-E])\d{2}$/i);
  if (codeMatch) {
    const prefixMap = { A: "standard", B: "silver", C: "duya", D: "gold", E: "rose_gold" };
    return prefixMap[codeMatch[1].toUpperCase()] || text;
  }
  const typeKeyMap = {
    standard: "standard",
    normal: "standard",
    "普台": "standard",
    silver: "silver",
    "乔氏银腿": "silver",
    "银腿": "silver",
    duya: "duya",
    "独牙": "duya",
    gold: "gold",
    "乔氏金腿": "gold",
    "金腿": "gold",
    rose_gold: "rose_gold",
    roseGold: "rose_gold",
    "乔氏玫瑰金": "rose_gold",
    "玫瑰金": "rose_gold"
  };
  return typeKeyMap[text] || text;
}

function normalizeTableType(value) {
  const typeMap = {
    standard: "普台",
    normal: "普台",
    "普台": "普台",
    silver: "乔氏银腿",
    "乔氏银腿": "乔氏银腿",
    "银腿": "乔氏银腿",
    duya: "独牙",
    "独牙": "独牙",
    gold: "乔氏金腿",
    "乔氏金腿": "乔氏金腿",
    "金腿": "乔氏金腿",
    rose_gold: "乔氏玫瑰金",
    roseGold: "乔氏玫瑰金",
    "乔氏玫瑰金": "乔氏玫瑰金",
    "玫瑰金": "乔氏玫瑰金"
  };
  return typeMap[String(value || "")] || "";
}

function normalizeTableStatus(value) {
  const statusMap = {
    idle: "空闲",
    free: "空闲",
    available: "空闲",
    reserved: "已预约",
    pending_arrival: "已预约",
    in_use: "使用中",
    using: "使用中",
    in_progress: "使用中",
    cleaning: "清洁中",
    repairing: "维修中",
    repair: "维修中",
    disabled: "停用",
    stopped: "停用"
  };
  const text = String(value || "").trim();
  return statusMap[text] || text || "状态待确认";
}

function isSelectableTableStatus(rawStatus, statusText) {
  const raw = String(rawStatus || "").trim();
  if (!raw) return true;
  return ["idle", "free", "available", "空闲"].indexOf(raw) >= 0 || statusText === "空闲";
}

function buildTableUnavailableText(statusText, nextAvailableTime) {
  if (nextAvailableTime) return `${statusText} · ${formatDisplayTime(nextAvailableTime)}后可约`;
  if (statusText === "停用" || statusText === "维修中" || statusText === "清洁中") return statusText;
  return `${statusText || "当前"}不可约`;
}

function formatDisplayTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildAvailabilityMessage({ isTooEarly, selectedTable, hasTables, hasAvailableTable }) {
  if (isTooEarly) return "预约时间需至少提前 30 分钟";
  if (!hasTables) return "当前筛选暂无桌台";
  if (!hasAvailableTable) return "当前时段暂无可预约桌台，请换时间或桌型";
  if (!selectedTable) return "请选择可预约桌台";
  return selectedTable.availabilityTip;
}

function normalizeAssistant(item) {
  const photoUrl = item.photoUrl || item.photo_url || item.avatar_url || item.thumb_url || "/assets/generated/assistant-thumb.jpg";
  return {
    ...item,
    id: item.id || item._id,
    name: item.name || item.assistant_name || "助教",
    level: item.level || item.level_name || "",
    status: item.status || "",
    tagsText: item.tagsText || item.tags_text || (item.tags || []).join("、"),
    price: item.price || item.price_yuan || (item.service_price_cent ? Math.round(item.service_price_cent / 100) : ""),
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

function pad(value) {
  return String(value).padStart(2, "0");
}

function getErrorMessage(error, fallback) {
  return error && error.message ? error.message : fallback;
}
