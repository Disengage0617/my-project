const mock = require("../../utils/mock");

Page({
  data: {
    store: mock.store,
    tableGroups: [
      { area: "大厅区", count: 12, type: "普台", price: "28/38/58" },
      { area: "银腿区", count: 10, type: "乔氏银腿", price: "38/48/68" },
      { area: "独牙区", count: 8, type: "独牙", price: "48/58/88" },
      { area: "金腿区", count: 6, type: "乔氏金腿", price: "58/78/108" },
      { area: "玫瑰金区", count: 4, type: "乔氏玫瑰金", price: "68/98/128" }
    ],
    assistantPrice: "80/120"
  }
});
