const {
  ACTIVE_ASSISTANT_RESERVATION_STATUSES,
  ACTIVE_RESERVATION_STATUSES,
  NO_SHOW_STATUS,
  RESERVATION_LEAD_MINUTES
} = require("./constants");

function businessError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function toTime(value) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function assertReservationTime(startTime, endTime, bookingRule = {}) {
  const start = toTime(startTime);
  const end = toTime(endTime);
  const leadMinutes = bookingRule.min_advance_minutes || RESERVATION_LEAD_MINUTES;
  const minDuration = bookingRule.min_duration_minutes || 60;
  const maxDuration = bookingRule.max_duration_minutes || 240;

  if (!startTime || start == null) {
    throw businessError("INVALID_TIME", "reservation start time is invalid");
  }
  if (!endTime || end == null || end <= start) {
    throw businessError("INVALID_TIME_RANGE", "reservation end time must be later than start time");
  }
  if (start < Date.now() + leadMinutes * 60 * 1000) {
    throw businessError("RESERVATION_TOO_EARLY", `reservation requires at least ${leadMinutes} minutes advance`);
  }

  const durationMinutes = (end - start) / 60 / 1000;
  if (durationMinutes < minDuration || durationMinutes > maxDuration) {
    throw businessError("RESERVATION_DURATION_INVALID", "reservation duration is outside store rules");
  }
}

function hasOverlap(startA, endA, startB, endB) {
  return toTime(startA) < toTime(endB) && toTime(endA) > toTime(startB);
}

async function assertNoShowAllowed({ db, openid, userId, storeId }) {
  if (!storeId || (!openid && !userId)) return;

  const result = await db.collection("no_show_record")
    .where({ store_id: storeId, status: NO_SHOW_STATUS.ACTIVE })
    .get();

  const active = (result.data || []).find((item) => {
    const sameUser = (userId && item.user_id === userId) || (openid && item.openid === openid);
    const banEndAt = item.ban_end_at || item.lock_until;
    return sameUser && toTime(item.ban_start_at || item.created_at || 0) <= Date.now() && toTime(banEndAt) > Date.now();
  });

  if (active) {
    throw businessError("NO_SHOW_LOCKED", "user has an active no-show restriction", {
      ban_end_at: active.ban_end_at || active.lock_until
    });
  }
}

async function assertNoTableConflict({ db, storeId, tableId, startTime, endTime, excludeReservationId = "" }) {
  if (!storeId || !tableId || !startTime || !endTime) return;

  const result = await db.collection("reservation")
    .where({ store_id: storeId, table_id: tableId })
    .get();

  const conflict = (result.data || []).find((item) => (
    item._id !== excludeReservationId
    && ACTIVE_RESERVATION_STATUSES.includes(item.status)
    && hasOverlap(startTime, endTime, item.start_time, item.end_time)
  ));

  if (conflict) {
    throw businessError("TABLE_TIME_CONFLICT", "table has an active reservation in this time range");
  }
}

async function assertNoAssistantConflict({ db, storeId, assistantId, startTime, endTime, excludeAssistantReservationId = "" }) {
  if (!storeId || !assistantId || !startTime || !endTime) return;

  const result = await db.collection("assistant_reservation")
    .where({ store_id: storeId, assistant_id: assistantId })
    .get();

  const conflict = (result.data || []).find((item) => (
    item._id !== excludeAssistantReservationId
    && ACTIVE_ASSISTANT_RESERVATION_STATUSES.includes(item.status)
    && hasOverlap(startTime, endTime, item.start_time, item.end_time)
  ));

  if (conflict) {
    throw businessError("ASSISTANT_TIME_CONFLICT", "assistant has an active reservation in this time range");
  }
}

function assertAuthorizedProfile(profile = {}, user = {}) {
  const nickname = profile.nickName || profile.nickname || user.nickname || user.nickName;
  const phone = profile.phone || user.phone;

  if (!nickname) {
    throw businessError("NICKNAME_REQUIRED", "campaign registration requires nickname authorization");
  }
  if (!phone) {
    throw businessError("PHONE_REQUIRED", "campaign registration requires phone authorization");
  }
  return { nickname, phone };
}

function maskPhone(phone = "") {
  const text = String(phone || "");
  if (text.length < 7) return text ? "****" : "";
  return `${text.slice(0, 3)}****${text.slice(-4)}`;
}

module.exports = {
  assertAuthorizedProfile,
  assertNoAssistantConflict,
  assertNoShowAllowed,
  assertNoTableConflict,
  assertReservationTime,
  businessError,
  hasOverlap,
  maskPhone
};
