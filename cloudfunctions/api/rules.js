const {
  ACTIVE_ASSISTANT_RESERVATION_STATUSES,
  ACTIVE_RESERVATION_STATUSES,
  RESERVATION_LEAD_MINUTES
} = require("./constants");

function businessError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertReservationTime(startTime, endTime) {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const minStart = Date.now() + RESERVATION_LEAD_MINUTES * 60 * 1000;

  if (!startTime || Number.isNaN(start)) {
    throw businessError("INVALID_TIME", "预约开始时间无效");
  }

  if (!endTime || Number.isNaN(end) || end <= start) {
    throw businessError("INVALID_TIME_RANGE", "预约结束时间需晚于开始时间");
  }

  if (start < minStart) {
    throw businessError("RESERVATION_TOO_EARLY", "预约需至少提前30分钟");
  }
}

async function assertNoShowAllowed({ db, openid, storeId }) {
  if (!openid || !storeId) return;

  const result = await db.collection("no_show_record")
    .where({
      store_id: storeId,
      openid,
      status: "限制中"
    })
    .limit(1)
    .get();

  const active = (result.data || []).find((item) => new Date(item.lock_until).getTime() > Date.now());
  if (active) {
    throw businessError("NO_SHOW_LOCKED", "该用户因未到店，3天内暂不可预约");
  }
}

async function assertNoTableConflict({ db, storeId, tableId, startTime, endTime }) {
  if (!storeId || !tableId || !startTime || !endTime) return;

  const result = await db.collection("reservation")
    .where({
      store_id: storeId,
      table_id: tableId,
      status: db.command.in(ACTIVE_RESERVATION_STATUSES),
      start_time: db.command.lt(endTime),
      end_time: db.command.gt(startTime)
    })
    .limit(1)
    .get();

  if ((result.data || []).length > 0) {
    throw businessError("TABLE_TIME_CONFLICT", "该桌台当前时段已被预约");
  }
}

async function assertNoAssistantConflict({ db, storeId, assistantId, startTime, endTime }) {
  if (!storeId || !assistantId || !startTime || !endTime) return;

  const result = await db.collection("assistant_reservation")
    .where({
      store_id: storeId,
      assistant_id: assistantId,
      status: db.command.in(ACTIVE_ASSISTANT_RESERVATION_STATUSES),
      start_time: db.command.lt(endTime),
      end_time: db.command.gt(startTime)
    })
    .limit(1)
    .get();

  if ((result.data || []).length > 0) {
    throw businessError("ASSISTANT_TIME_CONFLICT", "该助教当前时段已被预约");
  }
}

function assertAuthorizedProfile(profile = {}) {
  if (!profile.nickName || !profile.phone) {
    throw businessError("PROFILE_AUTH_REQUIRED", "活动报名需授权微信昵称和手机号");
  }
}

module.exports = {
  assertAuthorizedProfile,
  assertNoAssistantConflict,
  assertReservationTime,
  assertNoShowAllowed,
  assertNoTableConflict,
  businessError
};
