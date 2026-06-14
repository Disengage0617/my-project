const TABLE_TYPES = [
  { key: "standard", name: "普台", rank: 1 },
  { key: "silver", name: "乔氏银腿", rank: 2 },
  { key: "duya", name: "独牙", rank: 3 },
  { key: "gold", name: "乔氏金腿", rank: 4 },
  { key: "rose_gold", name: "乔氏玫瑰金", rank: 5 }
];

const RESERVATION_STATUS = {
  PENDING_CONFIRM: "待确认",
  WAITING_ARRIVAL: "待到店",
  WAITING_REVIEW: "待核实",
  ARRIVED: "已到店",
  IN_SERVICE: "进行中",
  COMPLETED: "已完成",
  CANCELED: "已取消",
  NO_SHOW: "未到店",
  RELEASED: "已释放"
};

const TABLE_STATUS = {
  FREE: "空闲",
  RESERVED: "已预约",
  USING: "使用中",
  CLEANING: "清洁中",
  REPAIRING: "维修中",
  DISABLED: "停用"
};

const ASSISTANT_STATUS = {
  OFF_DUTY: "未上班",
  FREE: "空闲",
  RESERVED: "已预约",
  SERVING: "上钟中",
  RESTING: "休息中",
  CLOCKED_OUT: "已下班"
};

module.exports = {
  TABLE_TYPES,
  RESERVATION_STATUS,
  TABLE_STATUS,
  ASSISTANT_STATUS
};
