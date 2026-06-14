const cloud = require("wx-server-sdk");
const handlers = require("./handlers");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { action, payload = {} } = event || {};
  const wxContext = cloud.getWXContext();
  const handler = handlers[action];

  if (!handler) {
    return { ok: false, code: "ACTION_NOT_FOUND", message: `未知接口：${action}` };
  }

  try {
    const data = await handler({ payload, wxContext, db: cloud.database() });
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      code: error.code || "INTERNAL_ERROR",
      message: error.message || "服务异常"
    };
  }
};
