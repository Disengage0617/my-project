const {
  ASSISTANT_RESERVATION_STATUS,
  ASSISTANT_STATUS,
  CAMPAIGN_REGISTRATION_STATUS,
  NO_SHOW_LOCK_DAYS,
  NO_SHOW_STATUS,
  RESERVATION_STATUS,
  TABLE_STATUS
} = require("./constants");
const {
  assertAuthorizedProfile,
  assertNoAssistantConflict,
  assertNoShowAllowed,
  assertNoTableConflict,
  assertReservationTime,
  businessError,
  maskPhone
} = require("./rules");

const DEFAULT_STORE_ID = "store_demo_001";
const LOCK_TTL_MS = 60 * 1000;
const ROLE_LEVEL = { user: 0, staff: 1, manager: 2, owner: 3, admin: 3 };
const TABLE_TYPES = ["standard", "silver", "duya", "gold", "rose_gold"];
const PRICE_TARGET_TYPES = ["table", "assistant", "package"];
const PRICE_UNITS = ["hour", "session"];
const CAMPAIGN_TYPES = ["new_user", "package", "match", "member", "other"];
const CAMPAIGN_STATUSES = ["draft", "published", "offline", "ended"];
const TEST_ONLY_ACTIONS = ["bootstrapMvp", "validateMvpBootstrap", "runMvpFlowSmokeTest", "runMvpGuardSmokeTest"];
const DEFAULT_HOME_PAGE_CONFIG = {
  page_key: "home",
  status: "published",
  theme: {
    primary_color: "#18d6a3",
    accent_color: "#e6c15d",
    background_style: "dark-neon"
  },
  modules: [
    {
      id: "hero",
      type: "hero",
      enabled: true,
      sort_order: 1,
      title: "W 台球俱乐部",
      subtitle: "24小时营业 · 到店后员工核实开台",
      image_url: "/assets/generated/billiards-bg-option-1.png",
      cta_text: "立即预约桌台",
      link: "/pages/reservation/index"
    },
    {
      id: "activities",
      type: "activity_entry",
      enabled: true,
      sort_order: 2,
      title: "店内活动",
      subtitle: "赛事、练习局和会员活动",
      image_url: "/assets/generated/billiards-bg-option-2.png",
      link: "/pages/campaign-list/index"
    },
    {
      id: "coach",
      type: "assistant_entry",
      enabled: true,
      sort_order: 3,
      title: "助理教练",
      subtitle: "查看状态与价格",
      image_url: "/assets/generated/assistant-coach-card.jpg",
      link: "/pages/assistant-list/index"
    },
    {
      id: "event_feature",
      type: "event_feature",
      enabled: true,
      sort_order: 4,
      title: "暗夜霓虹排位赛",
      subtitle: "今晚开放报名 · 名额 0 / 32",
      image_url: "/assets/generated/billiards-bg-option-4.png",
      tag: "筹备中",
      link: "/pages/campaign-list/index"
    }
  ]
};

function nowIso() {
  return new Date().toISOString();
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString();
}

function formatCent(value) {
  return `¥${(Number(value || 0) / 100).toFixed(2)}`;
}

function getStoreId(payload = {}) {
  return payload.storeId || payload.store_id || DEFAULT_STORE_ID;
}

function getReservationId(payload = {}) {
  return payload.reservationId || payload.reservation_id;
}

function getTableId(payload = {}) {
  return payload.tableId || payload.table_id;
}

function getAssistantId(payload = {}) {
  return payload.assistantId || payload.assistant_id;
}

function getStartTime(payload = {}) {
  return payload.startTime || payload.start_time;
}

function getEndTime(payload = {}) {
  return payload.endTime || payload.end_time;
}

function getRoleLevel(role) {
  return ROLE_LEVEL[role] || 0;
}

function getOpenid({ payload = {}, wxContext = {} }) {
  return wxContext.OPENID || payload.openid || payload.openId || "";
}

function getPayloadData(payload = {}) {
  return payload.payload || {};
}

function getPagination(payload = {}, defaults = {}) {
  const page = Math.max(1, Number(payload.page || defaults.page || 1) || 1);
  const rawPageSize = Number(payload.page_size || payload.pageSize || defaults.pageSize || 20) || 20;
  const pageSize = Math.min(Math.max(1, rawPageSize), defaults.maxPageSize || 100);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function paginateItems(items = [], payload = {}, defaults = {}) {
  const { page, pageSize, offset } = getPagination(payload, defaults);
  return {
    items: items.slice(offset, offset + pageSize),
    total: items.length,
    page,
    page_size: pageSize
  };
}

function assertStringLength(value, field, { required = false, max = 120 } = {}) {
  const text = value == null ? "" : String(value).trim();
  if (required && !text) throw businessError("INVALID_PARAMS", `${field} is required`);
  if (text && text.length > max) throw businessError("INVALID_PARAMS", `${field} is too long`);
  return text;
}

function assertEnumValue(value, field, values, { required = false } = {}) {
  if (value == null || value === "") {
    if (required) throw businessError("INVALID_PARAMS", `${field} is required`);
    return value;
  }
  if (!values.includes(value)) throw businessError("INVALID_PARAMS", `${field} is invalid`);
  return value;
}

function assertIntegerRange(value, field, { required = false, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value == null || value === "") {
    if (required) throw businessError("INVALID_PARAMS", `${field} is required`);
    return value;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw businessError("INVALID_PARAMS", `${field} is invalid`);
  }
  return number;
}

function assertBooleanValue(value, field) {
  if (value == null) return value;
  if (typeof value !== "boolean") throw businessError("INVALID_PARAMS", `${field} must be boolean`);
  return value;
}

function assertTimeOrder(startTime, endTime) {
  if (!startTime || !endTime) return;
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    throw businessError("INVALID_PARAMS", "campaign time range is invalid");
  }
}

function assertPhone(phone) {
  const text = assertStringLength(phone, "phone", { required: true, max: 20 });
  if (!/^\+?\d{6,20}$/.test(text)) throw businessError("INVALID_PARAMS", "phone is invalid");
  return text;
}

function validateBookingRule(rule = {}) {
  if (!rule || typeof rule !== "object") return rule;
  for (const field of ["min_advance_minutes", "hold_minutes", "min_duration_minutes", "max_duration_minutes", "slot_step_minutes", "no_show_ban_days"]) {
    if (rule[field] != null) assertIntegerRange(rule[field], `booking_rule.${field}`, { min: 1, max: 1440 });
  }
  if (rule.allow_user_cancel != null) assertBooleanValue(rule.allow_user_cancel, "booking_rule.allow_user_cancel");
  return rule;
}

function validateStorePayload(data = {}) {
  if (data.name != null) assertStringLength(data.name, "name", { required: true, max: 80 });
  if (data.phone != null) assertStringLength(data.phone, "phone", { max: 30 });
  if (data.address != null) assertStringLength(data.address, "address", { max: 200 });
  if (data.status != null) assertEnumValue(data.status, "status", ["active", "disabled"]);
  if (data.booking_rule != null) validateBookingRule(data.booking_rule);
}

function validateTablePayload(data = {}, { isNew = false } = {}) {
  if (isNew || data.table_no != null) assertStringLength(data.table_no, "table_no", { required: true, max: 20 });
  if (data.table_type != null) assertEnumValue(data.table_type, "table_type", TABLE_TYPES);
  if (data.table_type_name != null) assertStringLength(data.table_type_name, "table_type_name", { max: 40 });
  if (data.area_name != null) assertStringLength(data.area_name, "area_name", { max: 40 });
  if (data.status != null) assertEnumValue(data.status, "status", Object.values(TABLE_STATUS));
  if (data.enabled != null) assertBooleanValue(data.enabled, "enabled");
}

function validatePriceRulePayload(data = {}, { isNew = false } = {}) {
  if (isNew || data.target_type != null) assertEnumValue(data.target_type, "target_type", PRICE_TARGET_TYPES, { required: isNew });
  if (data.table_type != null) assertEnumValue(data.table_type, "table_type", TABLE_TYPES);
  if (isNew || data.price_cent != null) assertIntegerRange(data.price_cent, "price_cent", { required: isNew, min: 0, max: 99999999 });
  if (isNew || data.unit != null) assertEnumValue(data.unit, "unit", PRICE_UNITS, { required: isNew });
  if (data.enabled != null) assertBooleanValue(data.enabled, "enabled");
}

function validateAssistantPayload(data = {}, { isNew = false } = {}) {
  if (isNew || data.name != null) assertStringLength(data.name, "name", { required: isNew, max: 60 });
  if (data.status != null) assertEnumValue(data.status, "status", Object.values(ASSISTANT_STATUS));
  if (data.service_price_cent != null) assertIntegerRange(data.service_price_cent, "service_price_cent", { min: 0, max: 99999999 });
  if (data.enabled != null) assertBooleanValue(data.enabled, "enabled");
}

function validateCampaignPayload(data = {}, { isNew = false } = {}) {
  if (isNew || data.title != null) assertStringLength(data.title, "title", { required: isNew, max: 80 });
  if (data.campaign_type != null) assertEnumValue(data.campaign_type, "campaign_type", CAMPAIGN_TYPES);
  if (data.status != null) assertEnumValue(data.status, "status", CAMPAIGN_STATUSES);
  if (data.quota_limited != null) assertBooleanValue(data.quota_limited, "quota_limited");
  if (data.need_review != null) assertBooleanValue(data.need_review, "need_review");
  if (data.member_only != null) assertBooleanValue(data.member_only, "member_only");
  if (data.quota_total != null) assertIntegerRange(data.quota_total, "quota_total", { min: 0, max: 100000 });
  if (data.quota_used != null) assertIntegerRange(data.quota_used, "quota_used", { min: 0, max: 100000 });
  assertTimeOrder(data.start_time, data.end_time);
}

function cloneForAudit(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function normalizePageConfig(storeId, pageKey, config) {
  const fallback = pageKey === "home" ? DEFAULT_HOME_PAGE_CONFIG : { page_key: pageKey, status: "published", theme: {}, modules: [] };
  const source = config || {};
  const modules = Array.isArray(source.modules) ? source.modules : fallback.modules;
  return {
    ...fallback,
    ...source,
    _id: source._id || `${storeId}_${pageKey}_published`,
    store_id: storeId,
    page_key: pageKey,
    status: source.status || fallback.status || "published",
    theme: { ...(fallback.theme || {}), ...(source.theme || {}) },
    modules: modules
      .map((item, index) => ({
        enabled: true,
        sort_order: index + 1,
        ...item,
        id: item.id || `${pageKey}_module_${index + 1}`
      }))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  };
}

function buildTableSummary(table) {
  if (!table) return null;
  const tableNo = table.table_no || table.code || table.name || table._id || "";
  const tableTypeName = table.table_type_name || table.type_name || table.table_type || table.type || "";
  return {
    _id: table._id,
    table_id: table._id,
    table_no: tableNo,
    code: table.code || tableNo,
    name: table.name || tableNo,
    table_type: table.table_type || table.type || "",
    table_type_name: tableTypeName,
    area_id: table.area_id || "",
    area_name: table.area_name || "",
    status: table.status || "",
    enabled: table.enabled !== false
  };
}

async function attachReservationTableSummary(db, reservation) {
  const table = reservation && reservation.table_id
    ? await db.collection("billiard_table").doc(reservation.table_id).get().then((res) => res.data).catch(() => null)
    : null;
  const tableSummary = table && table.store_id === reservation.store_id ? buildTableSummary(table) : null;
  return {
    ...reservation,
    table: tableSummary,
    tableCode: tableSummary ? tableSummary.table_no : reservation.table_id || "",
    table_code: tableSummary ? tableSummary.table_no : reservation.table_id || "",
    tableType: tableSummary ? tableSummary.table_type_name : reservation.table_type || "",
    table_type_name: tableSummary ? tableSummary.table_type_name : reservation.table_type || ""
  };
}

async function getDocById(db, collection, id) {
  if (!id) throw businessError("ID_REQUIRED", "record id required");
  const result = await db.collection(collection).doc(id).get();
  if (!result.data) throw businessError("RESOURCE_NOT_FOUND", "record not found");
  return result.data;
}

async function findOne(db, collection, query) {
  const result = await db.collection(collection).where(query).limit(1).get();
  return (result.data || [])[0] || null;
}

function isCollectionNotFoundError(error) {
  const code = error && (error.code || error.errCode);
  const message = String((error && (error.message || error.errMsg)) || "");
  return code === -502005
    || code === "-502005"
    || message.includes("DATABASE_COLLECTION_NOT_EXIST")
    || message.includes("database collection not exists")
    || message.includes("collection not exists");
}

async function findOneOptionalCollection(db, collection, query) {
  try {
    return await findOne(db, collection, query);
  } catch (error) {
    if (isCollectionNotFoundError(error)) return null;
    throw error;
  }
}

async function setDocData(db, collectionName, id, data) {
  const doc = db.collection(collectionName).doc(id);
  const { _id, ...docData } = data;
  const nextData = { ...docData, updated_at: nowIso() };
  if (typeof doc.set === "function") {
    await doc.set({ data: nextData });
  } else {
    await doc.update({ data: nextData });
  }
}

async function assertStoreActive(db, storeId) {
  const store = await getDocById(db, "store", storeId);
  if (store.status && store.status !== "active") {
    throw businessError("STORE_DISABLED", "store is disabled");
  }
  return store;
}

async function assertStaffPermission({ db, wxContext, storeId, minRole = "staff" }) {
  if (!wxContext.OPENID) throw businessError("UNAUTHORIZED", "login required");
  const staff = await findOne(db, "staff_user", { store_id: storeId, openid: wxContext.OPENID, enabled: true });
  if (!staff || getRoleLevel(staff.role) < getRoleLevel(minRole)) {
    throw businessError("FORBIDDEN", "staff permission required");
  }
  return staff;
}

function assertStoreMatch(payload, resource) {
  const payloadStoreId = payload.storeId || payload.store_id;
  if (payloadStoreId && payloadStoreId !== resource.store_id) {
    throw businessError("RESOURCE_STORE_MISMATCH", "resource store mismatch");
  }
}

async function getCurrentUser({ db, wxContext }) {
  if (!wxContext.OPENID) throw businessError("UNAUTHORIZED", "login required");
  return findOne(db, "user", { openid: wxContext.OPENID });
}

async function loginByWechat({ payload = {}, wxContext = {}, db }) {
  const openid = getOpenid({ payload, wxContext });
  if (!openid) throw businessError("UNAUTHORIZED", "wechat openid required");
  const now = nowIso();
  const profile = payload.profile || {};
  const existing = await findOne(db, "user", { openid });
  const userId = existing ? existing._id : `user_${openid}`;
  const user = {
    ...(existing || {}),
    _id: userId,
    openid,
    unionid: wxContext.UNIONID || payload.unionid || (existing && existing.unionid) || "",
    nickname: payload.nickname || payload.nickName || profile.nickname || profile.nickName || (existing && existing.nickname) || "",
    avatar_url: payload.avatar_url || payload.avatarUrl || profile.avatar_url || profile.avatarUrl || (existing && existing.avatar_url) || "",
    default_store_id: payload.default_store_id || payload.defaultStoreId || (existing && existing.default_store_id) || getStoreId(payload),
    status: (existing && existing.status) || "active",
    created_at: existing ? existing.created_at : now
  };
  if (payload.phone || existing && existing.phone) user.phone = payload.phone || existing.phone;
  await setDocData(db, "user", userId, user);
  return {
    user: { ...user, updated_at: now },
    token: `local-session-${openid}`,
    local_test_only: !wxContext.OPENID
  };
}

async function authorizePhone({ payload = {}, wxContext = {}, db }) {
  const openid = getOpenid({ payload, wxContext });
  if (!openid) throw businessError("UNAUTHORIZED", "login required");
  const phone = assertPhone(payload.phone || payload.phoneNumber || payload.purePhoneNumber);
  const now = nowIso();
  const existing = await findOne(db, "user", { openid });
  const userId = existing ? existing._id : `user_${openid}`;
  const user = {
    ...(existing || {}),
    _id: userId,
    openid,
    phone,
    phone_authorized_at: now,
    status: (existing && existing.status) || "active",
    created_at: existing ? existing.created_at : now
  };
  await setDocData(db, "user", userId, user);
  const storeId = payload.store_id || payload.storeId;
  if (storeId) {
    await upsertCustomerProfile({ db, storeId, openid, user, patch: { phone, phone_authorized_at: now } });
  }
  return { phone, phone_authorized_at: now };
}

async function getCurrentRole({ payload = {}, wxContext = {}, db }) {
  const storeId = getStoreId(payload);
  const openid = getOpenid({ payload, wxContext });
  if (!openid) throw businessError("UNAUTHORIZED", "login required");
  const staff = await findOne(db, "staff_user", { store_id: storeId, openid, enabled: true });
  if (!staff || staff.status === "disabled") {
    return { role: "user", permissions: [], staff_user: null };
  }
  return {
    role: staff.role || "staff",
    permissions: staff.permissions || [],
    staff_user: {
      _id: staff._id,
      display_name: staff.display_name || staff.name || "",
      status: staff.status || "active",
      role: staff.role || "staff"
    }
  };
}

async function assertNoActiveTableReservations({ db, storeId, tableId }) {
  const reservations = await db.collection("reservation").where({ store_id: storeId, table_id: tableId }).get();
  if ((reservations.data || []).some((item) => [
    RESERVATION_STATUS.PENDING_CONFIRM,
    RESERVATION_STATUS.WAITING_ARRIVAL,
    RESERVATION_STATUS.WAITING_REVIEW,
    RESERVATION_STATUS.ARRIVED,
    RESERVATION_STATUS.IN_SERVICE
  ].includes(item.status))) {
    throw businessError("TABLE_HAS_ACTIVE_RESERVATION", "cannot disable table with active reservations");
  }
}

async function writeAuditLog({ db, storeId, action, operatorOpenid, operatorRole = "", targetType, targetId, before, after, reason }) {
  await db.collection("audit_log").add({
    data: {
      store_id: storeId,
      operator_openid: operatorOpenid || "",
      operator_user_id: operatorOpenid || "",
      operator_role: operatorRole || "",
      action,
      target_type: targetType,
      target_id: targetId || "",
      before: cloneForAudit(before),
      after: cloneForAudit(after),
      before_status: before && before.status ? before.status : "",
      after_status: after && after.status ? after.status : "",
      reason: reason || "",
      remark: reason || "",
      created_at: nowIso()
    }
  });
}

async function writeTableStatusLog({ db, storeId, tableId, reservationId = "", fromStatus = "", toStatus, operatorOpenid, operatorRole = "", reason = "" }) {
  await db.collection("table_status_log").add({
    data: {
      store_id: storeId,
      table_id: tableId,
      reservation_id: reservationId,
      from_status: fromStatus,
      to_status: toStatus,
      status: toStatus,
      operator_openid: operatorOpenid || "",
      operator_user_id: operatorOpenid || "",
      operator_role: operatorRole,
      reason,
      remark: reason,
      created_at: nowIso()
    }
  });
}

async function writeAssistantStatusLog({ db, storeId, assistantId, fromStatus = "", toStatus, operatorOpenid, reason = "" }) {
  await db.collection("assistant_status_log").add({
    data: {
      store_id: storeId,
      assistant_id: assistantId,
      from_status: fromStatus,
      to_status: toStatus,
      operator_openid: operatorOpenid || "",
      operator_user_id: operatorOpenid || "",
      reason: reason || "",
      created_at: nowIso()
    }
  });
}

async function upsertCustomerProfile({ db, storeId, openid, user, patch = {} }) {
  const userId = user && user._id ? user._id : openid;
  if (!userId) return null;
  try {
    const existing = await findOne(db, "customer_profile", { store_id: storeId, user_id: userId });
    const base = existing || {
      store_id: storeId,
      user_id: userId,
      openid,
      phone: user && user.phone ? user.phone : "",
      nickname: user && (user.nickname || user.nickName) ? (user.nickname || user.nickName) : "",
      reservation_count: 0,
      completed_count: 0,
      no_show_count: 0,
      campaign_count: 0,
      created_at: nowIso()
    };
    const next = { ...base, ...patch, updated_at: nowIso() };
    const id = existing ? existing._id : `customer_${storeId}_${userId}`;
    await setDocData(db, "customer_profile", id, { _id: id, ...next });
    return { _id: id, ...next };
  } catch (error) {
    if (isCollectionNotFoundError(error)) return null;
    throw error;
  }
}

async function assertEnabledResource({ db, collection, id, storeId, disabledStatuses = [] }) {
  const resource = await getDocById(db, collection, id);
  if (resource.store_id !== storeId) throw businessError("RESOURCE_STORE_MISMATCH", "resource store mismatch");
  if (resource.enabled === false || disabledStatuses.includes(resource.status)) {
    throw businessError("RESOURCE_UNAVAILABLE", "resource unavailable");
  }
  return resource;
}

function lockDocId(lockKey) {
  return Buffer.from(lockKey).toString("base64").replace(/[+/=]/g, "_");
}

async function acquireReservationLock({ db, storeId, resourceType = "table", resourceId, startTime, endTime, openid }) {
  const lockKey = `${resourceType}:${storeId}:${resourceId}:${startTime || "na"}:${endTime || "na"}`;
  const lockId = lockDocId(lockKey);
  const lockDoc = db.collection("reservation_lock").doc(lockId);
  const current = await lockDoc.get().catch(() => ({ data: null }));
  if (current.data && current.data.status === "active" && new Date(current.data.expires_at).getTime() > Date.now()) {
    throw businessError("LOCK_BUSY", "reservation lock busy");
  }
  const data = {
    lock_key: lockKey,
    store_id: storeId,
    resource_type: resourceType,
    resource_id: resourceId,
    openid,
    owner_user_id: openid,
    status: "active",
    start_time: startTime || "",
    end_time: endTime || "",
    expires_at: new Date(Date.now() + LOCK_TTL_MS).toISOString(),
    created_at: nowIso(),
    updated_at: nowIso()
  };
  if (typeof lockDoc.set === "function") await lockDoc.set({ data });
  else await lockDoc.update({ data });
  return { lockId, lockKey };
}

async function releaseReservationLock({ db, lock }) {
  if (!lock) return;
  await db.collection("reservation_lock").doc(lock.lockId).update({
    data: { status: "released", released_at: nowIso(), updated_at: nowIso() }
  }).catch(() => {});
}

async function getStoreOverview({ payload, db }) {
  const storeId = getStoreId(payload);
  const [storeRes, tableRes, assistantRes, campaignRes] = await Promise.all([
    db.collection("store").doc(storeId).get().catch(() => ({ data: null })),
    db.collection("billiard_table").where({ store_id: storeId, enabled: true }).get(),
    db.collection("assistant").where({ store_id: storeId, enabled: true }).get(),
    db.collection("campaign").where({ store_id: storeId, status: "published" }).limit(5).get()
  ]);
  const tables = tableRes.data || [];
  const store = storeRes.data || { _id: storeId, name: "Demo Store", business_hours: { mode: "24h" } };
  return {
    store,
    idle_table_count: tables.filter((item) => item.status === TABLE_STATUS.FREE).length,
    freeTableCount: tables.filter((item) => item.status === TABLE_STATUS.FREE).length,
    idle_assistant_count: (assistantRes.data || []).filter((item) => item.status === ASSISTANT_STATUS.IDLE).length,
    freeAssistantCount: (assistantRes.data || []).filter((item) => item.status === ASSISTANT_STATUS.IDLE).length,
    campaigns: campaignRes.data || []
  };
}

async function getAdminDashboard({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  await assertStaffPermission({ db, wxContext, storeId, minRole: "manager" });
  const [overview, reservationsRes, customersRes, registrationsRes, noShowRes, auditRes] = await Promise.all([
    getStoreOverview({ payload, db }),
    db.collection("reservation").where({ store_id: storeId }).orderBy("start_time", "desc").get().catch(() => ({ data: [] })),
    db.collection("customer_profile").where({ store_id: storeId }).get().catch(() => ({ data: [] })),
    db.collection("campaign_registration").where({ store_id: storeId }).get().catch(() => ({ data: [] })),
    db.collection("no_show_record").where({ store_id: storeId, status: NO_SHOW_STATUS.ACTIVE }).get().catch(() => ({ data: [] })),
    db.collection("audit_log").where({ store_id: storeId }).orderBy("created_at", "desc").limit(8).get().catch(() => ({ data: [] }))
  ]);
  const reservations = reservationsRes.data || [];
  return {
    overview,
    metrics: {
      reservation_count: reservations.length,
      waiting_review_count: reservations.filter((item) => item.status === RESERVATION_STATUS.WAITING_REVIEW).length,
      customer_count: (customersRes.data || []).length,
      campaign_registration_count: (registrationsRes.data || []).length,
      no_show_active_count: (noShowRes.data || []).length,
      free_table_count: overview.freeTableCount || 0,
      free_assistant_count: overview.freeAssistantCount || 0
    },
    recentReservations: reservations.slice(0, 8),
    recentAuditLogs: auditRes.data || []
  };
}

async function getStoreDetail({ payload, db }) {
  return assertStoreActive(db, getStoreId(payload));
}

async function getPriceRules({ payload, db }) {
  const storeId = getStoreId(payload);
  const query = { store_id: storeId, enabled: true };
  if (payload.target_type || payload.targetType) query.target_type = payload.target_type || payload.targetType;
  const result = await db.collection("price_rule").where(query).get();
  return { rules: result.data || [] };
}

async function getPageConfig({ payload, db }) {
  const storeId = getStoreId(payload);
  const pageKey = payload.pageKey || payload.page_key || "home";
  const status = payload.status || "published";
  const result = await db.collection("page_config").where({ store_id: storeId, page_key: pageKey, status }).limit(1).get().catch(() => ({ data: [] }));
  const config = (result.data || [])[0] || null;
  return { config: normalizePageConfig(storeId, pageKey, config) };
}

async function managePageConfig({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  const staff = await assertStaffPermission({ db, wxContext, storeId, minRole: "manager" });
  const pageKey = payload.pageKey || payload.page_key || (payload.payload && (payload.payload.page_key || payload.payload.pageKey)) || "home";
  const status = payload.action === "saveDraft" ? "draft" : payload.action === "unpublish" ? "draft" : "published";
  const configId = payload.configId || payload.config_id || `${storeId}_${pageKey}_${status}`;
  const before = await db.collection("page_config").doc(configId).get().then((res) => res.data).catch(() => null);
  const nextPayload = payload.payload || {};
  const config = normalizePageConfig(storeId, pageKey, {
    ...(before || {}),
    ...nextPayload,
    _id: configId,
    status,
    published_at: status === "published" ? nowIso() : (before && before.published_at) || "",
    created_at: before ? before.created_at : nowIso()
  });
  await setDocData(db, "page_config", configId, config);
  await writeAuditLog({ db, storeId, action: `managePageConfig:${payload.action || "publish"}`, operatorOpenid: wxContext.OPENID, operatorRole: staff.role, targetType: "page_config", targetId: configId, before, after: config, reason: payload.reason });
  return { config };
}

async function getAssets({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  await assertStaffPermission({ db, wxContext, storeId, minRole: "manager" });
  const query = { store_id: storeId };
  if (payload.type) query.type = payload.type;
  const result = await db.collection("asset").where(query).orderBy("created_at", "desc").get().catch(() => ({ data: [] }));
  const includeDeleted = payload.includeDeleted || payload.include_deleted;
  const items = (result.data || []).filter((item) => includeDeleted || item.is_deleted !== true);
  return { items, total: items.length };
}

async function manageAssets({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  const staff = await assertStaffPermission({ db, wxContext, storeId, minRole: "manager" });
  const action = payload.action || "upsert";
  const assetId = payload.assetId || payload.asset_id || (payload.payload && payload.payload._id) || `asset_${storeId}_${Date.now()}`;
  const before = await db.collection("asset").doc(assetId).get().then((res) => res.data).catch(() => null);
  if (action === "delete") {
    const deleted = { ...(before || {}), _id: assetId, store_id: storeId, is_deleted: true, status: "deleted" };
    await setDocData(db, "asset", assetId, deleted);
    await writeAuditLog({ db, storeId, action: "manageAssets:delete", operatorOpenid: wxContext.OPENID, operatorRole: staff.role, targetType: "asset", targetId: assetId, before, after: deleted, reason: payload.reason });
    return { asset: deleted, item: deleted };
  }
  const asset = {
    ...(before || {}),
    ...(payload.payload || {}),
    _id: assetId,
    store_id: storeId,
    name: (payload.payload && payload.payload.name) || (before && before.name) || "未命名素材",
    type: (payload.payload && payload.payload.type) || (before && before.type) || "other",
    status: "active",
    is_deleted: false,
    created_at: before ? before.created_at : nowIso()
  };
  await setDocData(db, "asset", assetId, asset);
  await writeAuditLog({ db, storeId, action: `manageAssets:${action}`, operatorOpenid: wxContext.OPENID, operatorRole: staff.role, targetType: "asset", targetId: assetId, before, after: asset, reason: payload.reason });
  return { asset, item: asset };
}

async function manageStore({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  const staff = await assertStaffPermission({ db, wxContext, storeId, minRole: "manager" });
  const action = payload.action || "upsert";
  const payloadData = getPayloadData(payload);
  const before = await db.collection("store").doc(storeId).get().then((res) => res.data).catch(() => null);
  if (!["upsert", "update"].includes(action)) throw businessError("INVALID_ACTION", "unsupported store action");
  validateStorePayload(payloadData);
  const item = { ...(before || {}), ...payloadData, _id: storeId, status: payloadData.status || (before && before.status) || "active", created_at: before ? before.created_at : nowIso() };
  await setDocData(db, "store", storeId, item);
  await writeAuditLog({ db, storeId, action: "manageStore", operatorOpenid: wxContext.OPENID, operatorRole: staff.role, targetType: "store", targetId: storeId, before, after: item, reason: payload.reason });
  return { item };
}

async function manageTables({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  const staff = await assertStaffPermission({ db, wxContext, storeId, minRole: "manager" });
  const action = payload.action || "upsert";
  if (!["list", "upsert", "update", "disable"].includes(action)) throw businessError("INVALID_ACTION", "unsupported table action");
  const tableId = payload.table_id || payload.tableId || (payload.payload && (payload.payload._id || payload.payload.table_id));
  if (action === "list") {
    const result = await db.collection("billiard_table").where({ store_id: storeId }).get();
    const status = payload.status;
    const tableType = payload.table_type || payload.tableType;
    const filtered = (result.data || []).filter((item) => (
      (!status || item.status === status)
      && (!tableType || item.table_type === tableType)
    ));
    return paginateItems(filtered, payload);
  }
  if (!tableId) throw businessError("TABLE_REQUIRED", "table id required");
  const payloadData = getPayloadData(payload);
  const before = await db.collection("billiard_table").doc(tableId).get().then((res) => res.data).catch(() => null);
  validateTablePayload(payloadData, { isNew: !before && action !== "disable" });
  if (action === "disable") await assertNoActiveTableReservations({ db, storeId, tableId });
  const item = {
    ...(before || {}),
    ...payloadData,
    _id: tableId,
    store_id: storeId,
    enabled: action === "disable" ? false : (payloadData.enabled !== false),
    status: action === "disable" ? TABLE_STATUS.DISABLED : (payloadData.status || (before && before.status) || TABLE_STATUS.FREE),
    created_at: before ? before.created_at : nowIso()
  };
  await setDocData(db, "billiard_table", tableId, item);
  await writeAuditLog({ db, storeId, action: `manageTables:${action}`, operatorOpenid: wxContext.OPENID, operatorRole: staff.role, targetType: "billiard_table", targetId: tableId, before, after: item, reason: payload.reason });
  return { item };
}

async function managePriceRules({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  const staff = await assertStaffPermission({ db, wxContext, storeId, minRole: "manager" });
  const action = payload.action || "upsert";
  if (action === "list") return getPriceRules({ payload, db });
  if (!["upsert", "update", "disable"].includes(action)) throw businessError("INVALID_ACTION", "unsupported price rule action");
  const ruleId = payload.price_rule_id || payload.priceRuleId || (payload.payload && payload.payload._id) || `price_${storeId}_${Date.now()}`;
  const payloadData = getPayloadData(payload);
  const before = await db.collection("price_rule").doc(ruleId).get().then((res) => res.data).catch(() => null);
  validatePriceRulePayload(payloadData, { isNew: !before && action !== "disable" });
  const item = { ...(before || {}), ...payloadData, _id: ruleId, store_id: storeId, enabled: action === "disable" ? false : (payloadData.enabled !== false), created_at: before ? before.created_at : nowIso() };
  await setDocData(db, "price_rule", ruleId, item);
  await writeAuditLog({ db, storeId, action: `managePriceRules:${action}`, operatorOpenid: wxContext.OPENID, operatorRole: staff.role, targetType: "price_rule", targetId: ruleId, before, after: item, reason: payload.reason });
  return { item };
}

async function manageAssistants({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  const staff = await assertStaffPermission({ db, wxContext, storeId, minRole: "manager" });
  const action = payload.action || "upsert";
  if (!["upsert", "update", "disable"].includes(action)) throw businessError("INVALID_ACTION", "unsupported assistant action");
  const assistantId = getAssistantId(payload) || (payload.payload && payload.payload._id) || `assistant_${storeId}_${Date.now()}`;
  const payloadData = getPayloadData(payload);
  const before = await db.collection("assistant").doc(assistantId).get().then((res) => res.data).catch(() => null);
  validateAssistantPayload(payloadData, { isNew: !before && action !== "disable" });
  const item = { ...(before || {}), ...payloadData, _id: assistantId, store_id: storeId, enabled: action === "disable" ? false : (payloadData.enabled !== false), status: payloadData.status || (before && before.status) || ASSISTANT_STATUS.IDLE, created_at: before ? before.created_at : nowIso() };
  await setDocData(db, "assistant", assistantId, item);
  await writeAuditLog({ db, storeId, action: `manageAssistants:${action}`, operatorOpenid: wxContext.OPENID, operatorRole: staff.role, targetType: "assistant", targetId: assistantId, before, after: item, reason: payload.reason });
  return { assistant: item, item };
}

async function updateTableStatus({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  const tableId = getTableId(payload);
  const toStatus = payload.to_status || payload.toStatus;
  const reason = payload.reason || "";
  if (![TABLE_STATUS.FREE, TABLE_STATUS.CLEANING, TABLE_STATUS.REPAIRING, TABLE_STATUS.DISABLED].includes(toStatus)) {
    throw businessError("INVALID_TABLE_STATUS", "invalid target table status");
  }
  const staff = await assertStaffPermission({ db, wxContext, storeId });
  const table = await assertEnabledResource({ db, collection: "billiard_table", id: tableId, storeId });
  if (toStatus === TABLE_STATUS.DISABLED) {
    await assertNoActiveTableReservations({ db, storeId, tableId });
  }
  await db.collection("billiard_table").doc(tableId).update({ data: { status: toStatus, enabled: toStatus !== TABLE_STATUS.DISABLED, updated_at: nowIso() } });
  await writeTableStatusLog({ db, storeId, tableId, fromStatus: table.status, toStatus, operatorOpenid: wxContext.OPENID, operatorRole: staff.role, reason });
  return { table: { ...table, status: toStatus, enabled: toStatus !== TABLE_STATUS.DISABLED } };
}

async function getAvailableTables({ payload, db }) {
  const storeId = getStoreId(payload);
  const tableType = payload.table_type || payload.tableType;
  const result = await db.collection("billiard_table").where({ store_id: storeId, enabled: true }).orderBy("code", "asc").get();
  const tables = (result.data || []).filter((table) => !tableType || table.table_type === tableType);
  return { list: tables, tables, items: tables, total: tables.length };
}

async function getAssistants({ payload, db }) {
  const storeId = getStoreId(payload);
  const startTime = getStartTime(payload);
  const endTime = getEndTime(payload);
  const result = await db.collection("assistant").where({ store_id: storeId, enabled: true }).orderBy("sort", "asc").get();
  const items = [];
  for (const assistant of result.data || []) {
    let available = assistant.status === ASSISTANT_STATUS.IDLE;
    if (available && startTime && endTime) {
      try {
        await assertNoAssistantConflict({ db, storeId, assistantId: assistant._id, startTime, endTime });
      } catch (error) {
        available = false;
      }
    }
    items.push({ ...assistant, available });
  }
  return { list: items, items };
}

async function getAssistantDetail({ payload, db }) {
  const assistant = await getDocById(db, "assistant", getAssistantId(payload));
  assertStoreMatch(payload, assistant);
  return assistant;
}

async function createReservation({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  const tableId = getTableId(payload);
  const assistantId = getAssistantId(payload);
  const startTime = getStartTime(payload);
  const endTime = getEndTime(payload);
  if (!tableId) throw businessError("TABLE_REQUIRED", "table required");
  const store = await assertStoreActive(db, storeId);
  assertReservationTime(startTime, endTime, store.booking_rule || {});
  const table = await assertEnabledResource({ db, collection: "billiard_table", id: tableId, storeId, disabledStatuses: [TABLE_STATUS.REPAIRING, TABLE_STATUS.DISABLED] });
  if (assistantId) {
    const assistant = await assertEnabledResource({ db, collection: "assistant", id: assistantId, storeId });
    if (assistant.status !== ASSISTANT_STATUS.IDLE) throw businessError("RESOURCE_UNAVAILABLE", "assistant unavailable");
  }
  const user = await getCurrentUser({ db, wxContext }).catch(() => null);
  await assertNoShowAllowed({ db, openid: wxContext.OPENID, userId: user && user._id, storeId });
  let lock;
  try {
    lock = await acquireReservationLock({ db, storeId, resourceType: "table", resourceId: tableId, startTime, endTime, openid: wxContext.OPENID });
    await assertNoTableConflict({ db, storeId, tableId, startTime, endTime });
    await assertNoAssistantConflict({ db, storeId, assistantId, startTime, endTime });
    const created_at = nowIso();
    const reservation = {
      store_id: storeId,
      openid: wxContext.OPENID,
      user_id: user && user._id ? user._id : wxContext.OPENID,
      table_id: tableId,
      table_type: table.table_type || table.type || "",
      assistant_id: assistantId || "",
      assistant_required: Boolean(assistantId || payload.assistant_required || payload.assistantRequired),
      start_time: startTime,
      end_time: endTime,
      people_count: payload.peopleCount || payload.people_count || 1,
      remark: payload.remark || "",
      status: RESERVATION_STATUS.WAITING_ARRIVAL,
      lock_key: lock.lockKey,
      created_at,
      updated_at: created_at
    };
    const result = await db.collection("reservation").add({ data: reservation });
    if (assistantId) {
      const assistantReservation = await db.collection("assistant_reservation").add({
        data: {
          store_id: storeId,
          openid: wxContext.OPENID,
          user_id: reservation.user_id,
          reservation_id: result._id,
          assistant_id: assistantId,
          start_time: startTime,
          end_time: endTime,
          status: ASSISTANT_RESERVATION_STATUS.PENDING_CONFIRM,
          remark: payload.remark || "",
          created_at,
          updated_at: created_at
        }
      });
      await db.collection("reservation").doc(result._id).update({ data: { assistant_reservation_id: assistantReservation._id, updated_at: nowIso() } });
    }
    const existingProfile = await findOneOptionalCollection(db, "customer_profile", { store_id: storeId, user_id: reservation.user_id });
    await upsertCustomerProfile({
      db,
      storeId,
      openid: wxContext.OPENID,
      user,
      patch: {
        reservation_count: (existingProfile ? existingProfile.reservation_count || 0 : 0) + 1,
        last_reservation_at: startTime
      }
    });
    return { reservationId: result._id, reservation_id: result._id, status: RESERVATION_STATUS.WAITING_ARRIVAL, reservation: { _id: result._id, ...reservation } };
  } finally {
    await releaseReservationLock({ db, lock });
  }
}

async function createAssistantReservation({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  const assistantId = getAssistantId(payload);
  const startTime = getStartTime(payload);
  const endTime = getEndTime(payload);
  await assertStoreActive(db, storeId);
  assertReservationTime(startTime, endTime, {});
  const assistant = await assertEnabledResource({ db, collection: "assistant", id: assistantId, storeId });
  if (assistant.status !== ASSISTANT_STATUS.IDLE) throw businessError("RESOURCE_UNAVAILABLE", "assistant unavailable");
  const user = await getCurrentUser({ db, wxContext }).catch(() => null);
  await assertNoShowAllowed({ db, openid: wxContext.OPENID, userId: user && user._id, storeId });
  await assertNoAssistantConflict({ db, storeId, assistantId, startTime, endTime });
  const created_at = nowIso();
  const result = await db.collection("assistant_reservation").add({
    data: {
      store_id: storeId,
      openid: wxContext.OPENID,
      user_id: user && user._id ? user._id : wxContext.OPENID,
      assistant_id: assistantId,
      reservation_id: payload.reservation_id || payload.reservationId || "",
      start_time: startTime,
      end_time: endTime,
      status: ASSISTANT_RESERVATION_STATUS.PENDING_CONFIRM,
      remark: payload.remark || "",
      created_at,
      updated_at: created_at
    }
  });
  return { assistantReservationId: result._id, assistant_reservation_id: result._id, status: ASSISTANT_RESERVATION_STATUS.PENDING_CONFIRM };
}

async function confirmAssistantReservation({ payload, wxContext, db }) {
  const id = payload.assistantReservationId || payload.assistant_reservation_id;
  const reservation = await getDocById(db, "assistant_reservation", id);
  assertStoreMatch(payload, reservation);
  await assertStaffPermission({ db, wxContext, storeId: reservation.store_id });
  if (reservation.status !== ASSISTANT_RESERVATION_STATUS.PENDING_CONFIRM) {
    throw businessError("INVALID_STATUS", "assistant reservation is not pending");
  }
  await assertNoAssistantConflict({ db, storeId: reservation.store_id, assistantId: reservation.assistant_id, startTime: reservation.start_time, endTime: reservation.end_time, excludeAssistantReservationId: id });
  await db.collection("assistant_reservation").doc(id).update({ data: { status: ASSISTANT_RESERVATION_STATUS.CONFIRMED, confirmed_at: nowIso(), confirmed_by: wxContext.OPENID, updated_at: nowIso() } });
  return { assistantReservationId: id, assistant_reservation: { ...reservation, status: ASSISTANT_RESERVATION_STATUS.CONFIRMED }, status: ASSISTANT_RESERVATION_STATUS.CONFIRMED };
}

async function updateAssistantStatus({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  const assistantId = getAssistantId(payload);
  const toStatus = payload.to_status || payload.toStatus;
  const reason = payload.reason || "";
  const staff = await assertStaffPermission({ db, wxContext, storeId });
  if (!Object.values(ASSISTANT_STATUS).includes(toStatus)) throw businessError("INVALID_ASSISTANT_STATUS", "invalid assistant status");
  const assistant = await getDocById(db, "assistant", assistantId);
  assertStoreMatch({ store_id: storeId }, assistant);
  if (assistant.status === ASSISTANT_STATUS.SERVING && toStatus === ASSISTANT_STATUS.CHECKED_OUT) {
    throw businessError("STATE_TRANSITION_INVALID", "serving assistant cannot check out directly");
  }
  await db.collection("assistant").doc(assistantId).update({ data: { status: toStatus, updated_at: nowIso() } });
  await writeAssistantStatusLog({ db, storeId, assistantId, fromStatus: assistant.status, toStatus, operatorOpenid: wxContext.OPENID, reason });
  await writeAuditLog({ db, storeId, action: "updateAssistantStatus", operatorOpenid: wxContext.OPENID, operatorRole: staff.role, targetType: "assistant", targetId: assistantId, before: assistant, after: { ...assistant, status: toStatus }, reason });
  return { assistant: { ...assistant, status: toStatus } };
}

async function updateReservationStatus({ db, reservationId, status, extra = {} }) {
  const updated_at = nowIso();
  await db.collection("reservation").doc(reservationId).update({ data: { status, updated_at, ...extra } });
  return { reservationId, reservation_id: reservationId, status, updatedAt: updated_at };
}

async function getMyReservations({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  const result = await db.collection("reservation").where({ store_id: storeId, openid: wxContext.OPENID }).orderBy("start_time", "desc").limit(30).get();
  const items = [];
  for (const reservation of result.data || []) {
    items.push(await attachReservationTableSummary(db, reservation));
  }
  return { list: items, items, total: items.length };
}

async function getMineCenter({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  if (!wxContext.OPENID) throw businessError("UNAUTHORIZED", "login required");
  const user = await getCurrentUser({ db, wxContext }).catch(() => null);
  const userId = user && user._id ? user._id : wxContext.OPENID;
  const [customer, walletRes, couponRes, orderRes, reservationRes, assistantReservationRes, registrationRes, noShowRes] = await Promise.all([
    findOne(db, "customer_profile", { store_id: storeId, user_id: userId }).catch(() => null),
    db.collection("member_account").where({ store_id: storeId, user_id: userId }).limit(1).get().catch(() => ({ data: [] })),
    db.collection("coupon").where({ store_id: storeId, user_id: userId }).get().catch(() => ({ data: [] })),
    db.collection("order").where({ store_id: storeId, user_id: userId }).orderBy("created_at", "desc").get().catch(() => ({ data: [] })),
    db.collection("reservation").where({ store_id: storeId, openid: wxContext.OPENID }).orderBy("start_time", "desc").limit(5).get().catch(() => ({ data: [] })),
    db.collection("assistant_reservation").where({ store_id: storeId, openid: wxContext.OPENID }).orderBy("start_time", "desc").limit(5).get().catch(() => ({ data: [] })),
    db.collection("campaign_registration").where({ store_id: storeId, openid: wxContext.OPENID }).orderBy("created_at", "desc").limit(5).get().catch(() => ({ data: [] })),
    db.collection("no_show_record").where({ store_id: storeId, openid: wxContext.OPENID, status: NO_SHOW_STATUS.ACTIVE }).get().catch(() => ({ data: [] }))
  ]);
  const wallet = (walletRes.data || [])[0] || { balance_cent: 0, stored_value_enabled: false, payment_enabled: false };
  const coupons = couponRes.data || [];
  const orders = orderRes.data || [];
  const reservations = [];
  for (const reservation of reservationRes.data || []) {
    reservations.push(await attachReservationTableSummary(db, reservation));
  }
  const phone = (user && user.phone) || (customer && customer.phone) || "";
  const reservationCount = customer ? customer.reservation_count || 0 : reservations.length;
  const noShowCount = customer ? customer.no_show_count || 0 : (noShowRes.data || []).length;
  return {
    profile: {
      nickName: (user && (user.nickname || user.nickName)) || (customer && customer.nickname) || "微信用户",
      avatarUrl: (user && (user.avatar_url || user.avatarUrl)) || "",
      memberLevel: (wallet && wallet.member_level_name) || "普通会员",
      phone,
      phoneAuthorized: Boolean(phone),
      reservationCount,
      noShowCount
    },
    auth: {
      loggedIn: true,
      openid: wxContext.OPENID,
      profileAuthorized: Boolean(user || customer),
      phoneAuthorized: Boolean(phone),
      paymentEnabled: false
    },
    wallet: {
      ...wallet,
      balanceCent: wallet.balance_cent || wallet.balanceCent || 0,
      balanceText: formatCent(wallet.balance_cent || wallet.balanceCent || 0),
      storedValueEnabled: wallet.stored_value_enabled === true,
      paymentEnabled: false,
      rechargeEnabled: false
    },
    summary: {
      reservationCount,
      couponCount: coupons.length,
      orderCount: orders.length,
      noShowLockCount: (noShowRes.data || []).length
    },
    coupons,
    orders,
    reservations,
    assistantReservations: assistantReservationRes.data || [],
    campaignRegistrations: registrationRes.data || [],
    noShowLocks: noShowRes.data || []
  };
}

async function getReservationDetail({ payload, wxContext, db }) {
  const reservation = await getDocById(db, "reservation", getReservationId(payload));
  assertStoreMatch(payload, reservation);
  if (reservation.openid !== wxContext.OPENID) {
    await assertStaffPermission({ db, wxContext, storeId: reservation.store_id });
  }
  return attachReservationTableSummary(db, reservation);
}

async function submitArrival({ payload, wxContext, db }) {
  const reservationId = getReservationId(payload);
  const reservation = await getDocById(db, "reservation", reservationId);
  assertStoreMatch(payload, reservation);
  if (reservation.openid !== wxContext.OPENID) throw businessError("FORBIDDEN", "only owner can submit arrival");
  if (reservation.status !== RESERVATION_STATUS.WAITING_ARRIVAL) throw businessError("INVALID_STATUS", "invalid arrival status");
  return updateReservationStatus({ db, reservationId, status: RESERVATION_STATUS.WAITING_REVIEW, extra: { arrival_submitted_at: nowIso() } });
}

async function confirmArrival({ payload, wxContext, db }) {
  const reservationId = getReservationId(payload);
  const reservation = await getDocById(db, "reservation", reservationId);
  assertStoreMatch(payload, reservation);
  const staff = await assertStaffPermission({ db, wxContext, storeId: reservation.store_id });
  if (reservation.status !== RESERVATION_STATUS.WAITING_REVIEW) throw businessError("INVALID_STATUS", "invalid confirm arrival status");
  await writeAuditLog({ db, storeId: reservation.store_id, action: "confirmArrival", operatorOpenid: wxContext.OPENID, operatorRole: staff.role, targetType: "reservation", targetId: reservation._id, before: reservation, after: { ...reservation, status: RESERVATION_STATUS.ARRIVED }, reason: payload.remark });
  return updateReservationStatus({ db, reservationId, status: RESERVATION_STATUS.ARRIVED, extra: { arrival_confirmed_at: nowIso(), arrival_confirmed_by: wxContext.OPENID } });
}

async function rejectArrival({ payload, wxContext, db }) {
  const reservationId = getReservationId(payload);
  const reservation = await getDocById(db, "reservation", reservationId);
  assertStoreMatch(payload, reservation);
  const staff = await assertStaffPermission({ db, wxContext, storeId: reservation.store_id });
  if (reservation.status !== RESERVATION_STATUS.WAITING_REVIEW) throw businessError("INVALID_STATUS", "invalid reject arrival status");
  await writeAuditLog({ db, storeId: reservation.store_id, action: "rejectArrival", operatorOpenid: wxContext.OPENID, operatorRole: staff.role, targetType: "reservation", targetId: reservation._id, before: reservation, after: { ...reservation, status: RESERVATION_STATUS.WAITING_ARRIVAL }, reason: payload.reason });
  return updateReservationStatus({ db, reservationId, status: RESERVATION_STATUS.WAITING_ARRIVAL, extra: { arrival_rejected_at: nowIso(), arrival_rejected_by: wxContext.OPENID } });
}

async function markNoShow({ payload, wxContext, db }) {
  const reservationId = getReservationId(payload);
  const reservation = await getDocById(db, "reservation", reservationId);
  assertStoreMatch(payload, reservation);
  const staff = await assertStaffPermission({ db, wxContext, storeId: reservation.store_id });
  if (![RESERVATION_STATUS.WAITING_ARRIVAL, RESERVATION_STATUS.WAITING_REVIEW, RESERVATION_STATUS.ARRIVED].includes(reservation.status)) {
    throw businessError("INVALID_STATUS", "invalid no-show status");
  }
  const banStartAt = nowIso();
  const banEndAt = addDays(new Date(), NO_SHOW_LOCK_DAYS);
  const record = {
    store_id: reservation.store_id,
    openid: reservation.openid,
    user_id: reservation.user_id || reservation.openid,
    reservation_id: reservationId,
    ban_start_at: banStartAt,
    ban_end_at: banEndAt,
    lock_until: banEndAt,
    status: NO_SHOW_STATUS.ACTIVE,
    operator_openid: wxContext.OPENID,
    reason: payload.reason || "no show",
    created_at: banStartAt,
    updated_at: banStartAt
  };
  const noShow = await db.collection("no_show_record").add({ data: record });
  await writeAuditLog({ db, storeId: reservation.store_id, action: "markNoShow", operatorOpenid: wxContext.OPENID, operatorRole: staff.role, targetType: "reservation", targetId: reservation._id, before: reservation, after: { ...reservation, status: RESERVATION_STATUS.NO_SHOW }, reason: payload.reason });
  const profile = await findOneOptionalCollection(db, "customer_profile", { store_id: reservation.store_id, user_id: reservation.user_id || reservation.openid });
  await upsertCustomerProfile({ db, storeId: reservation.store_id, openid: reservation.openid, user: { _id: reservation.user_id || reservation.openid }, patch: { no_show_count: (profile ? profile.no_show_count || 0 : 0) + 1 } });
  const updated = await updateReservationStatus({ db, reservationId, status: RESERVATION_STATUS.NO_SHOW, extra: { no_show_at: nowIso(), no_show_by: wxContext.OPENID, no_show_locked_until: banEndAt } });
  return { ...updated, no_show_record: { _id: noShow._id, ...record } };
}

async function openTable({ payload, wxContext, db }) {
  const reservationId = getReservationId(payload);
  const reservation = await getDocById(db, "reservation", reservationId);
  assertStoreMatch(payload, reservation);
  const staff = await assertStaffPermission({ db, wxContext, storeId: reservation.store_id });
  if (reservation.status !== RESERVATION_STATUS.ARRIVED) throw businessError("INVALID_STATUS", "invalid open table status");
  const table = await assertEnabledResource({ db, collection: "billiard_table", id: reservation.table_id, storeId: reservation.store_id, disabledStatuses: [TABLE_STATUS.REPAIRING, TABLE_STATUS.DISABLED] });
  await db.collection("billiard_table").doc(reservation.table_id).update({ data: { status: TABLE_STATUS.USING, updated_at: nowIso() } });
  await writeTableStatusLog({ db, storeId: reservation.store_id, tableId: reservation.table_id, reservationId, fromStatus: table.status, toStatus: TABLE_STATUS.USING, operatorOpenid: wxContext.OPENID, operatorRole: staff.role, reason: "open table" });
  await writeAuditLog({ db, storeId: reservation.store_id, action: "openTable", operatorOpenid: wxContext.OPENID, operatorRole: staff.role, targetType: "reservation", targetId: reservation._id, before: reservation, after: { ...reservation, status: RESERVATION_STATUS.IN_SERVICE } });
  return updateReservationStatus({ db, reservationId, status: RESERVATION_STATUS.IN_SERVICE, extra: { opened_at: nowIso(), opened_by: wxContext.OPENID } });
}

async function closeTable({ payload, wxContext, db }) {
  const reservationId = getReservationId(payload);
  const reservation = await getDocById(db, "reservation", reservationId);
  assertStoreMatch(payload, reservation);
  const staff = await assertStaffPermission({ db, wxContext, storeId: reservation.store_id });
  if (reservation.status !== RESERVATION_STATUS.IN_SERVICE) throw businessError("INVALID_STATUS", "invalid close table status");
  const nextTableStatus = payload.nextTableStatus || payload.next_table_status || TABLE_STATUS.FREE;
  if (![TABLE_STATUS.FREE, TABLE_STATUS.CLEANING].includes(nextTableStatus)) throw businessError("INVALID_TABLE_STATUS", "invalid next table status");
  const table = await getDocById(db, "billiard_table", reservation.table_id);
  await db.collection("billiard_table").doc(reservation.table_id).update({ data: { status: nextTableStatus, updated_at: nowIso() } });
  await writeTableStatusLog({ db, storeId: reservation.store_id, tableId: reservation.table_id, reservationId, fromStatus: table.status, toStatus: nextTableStatus, operatorOpenid: wxContext.OPENID, operatorRole: staff.role, reason: "close table" });
  await writeAuditLog({ db, storeId: reservation.store_id, action: "closeTable", operatorOpenid: wxContext.OPENID, operatorRole: staff.role, targetType: "reservation", targetId: reservation._id, before: reservation, after: { ...reservation, status: RESERVATION_STATUS.COMPLETED } });
  const profile = await findOneOptionalCollection(db, "customer_profile", { store_id: reservation.store_id, user_id: reservation.user_id || reservation.openid });
  await upsertCustomerProfile({ db, storeId: reservation.store_id, openid: reservation.openid, user: { _id: reservation.user_id || reservation.openid }, patch: { completed_count: (profile ? profile.completed_count || 0 : 0) + 1, last_arrival_at: nowIso() } });
  return updateReservationStatus({ db, reservationId, status: RESERVATION_STATUS.COMPLETED, extra: { closed_at: nowIso(), closed_by: wxContext.OPENID } });
}

async function releaseReservation({ payload, wxContext, db }) {
  const reservationId = getReservationId(payload);
  const reservation = await getDocById(db, "reservation", reservationId);
  assertStoreMatch(payload, reservation);
  const staff = await assertStaffPermission({ db, wxContext, storeId: reservation.store_id });
  if (![RESERVATION_STATUS.WAITING_ARRIVAL, RESERVATION_STATUS.WAITING_REVIEW].includes(reservation.status)) throw businessError("INVALID_STATUS", "invalid release status");
  await writeAuditLog({ db, storeId: reservation.store_id, action: "releaseReservation", operatorOpenid: wxContext.OPENID, operatorRole: staff.role, targetType: "reservation", targetId: reservation._id, before: reservation, after: { ...reservation, status: RESERVATION_STATUS.RELEASED }, reason: payload.reason });
  return updateReservationStatus({ db, reservationId, status: RESERVATION_STATUS.RELEASED, extra: { released_at: nowIso(), released_by: wxContext.OPENID, release_reason: payload.reason || "timeout release" } });
}

async function getStaffWorkbench({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  await assertStaffPermission({ db, wxContext, storeId });
  const result = await db.collection("reservation").where({ store_id: storeId }).orderBy("start_time", "asc").get();
  const items = result.data || [];
  return { todayReservations: items, items, waitingReviewCount: items.filter((item) => item.status === RESERVATION_STATUS.WAITING_REVIEW).length };
}

async function getTodayReservations(args) {
  return getStaffWorkbench(args);
}

async function getAdminReservations({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  await assertStaffPermission({ db, wxContext, storeId });
  const query = { store_id: storeId };
  if (payload.status) query.status = payload.status;
  const result = await db.collection("reservation").where(query).orderBy("start_time", "desc").get();
  const items = [];
  for (const reservation of result.data || []) {
    items.push(await attachReservationTableSummary(db, reservation));
  }
  return paginateItems(items, payload);
}

async function getCampaigns({ payload, db }) {
  const storeId = getStoreId(payload);
  const status = payload.status || "published";
  const query = { store_id: storeId };
  if (status !== "all") query.status = status;
  const result = await db.collection("campaign").where(query).orderBy("start_time", "asc").get();
  const items = (result.data || []).map((item) => ({
    ...item,
    quota_left: item.quota_limited ? Math.max((item.quota_total || item.quota || 0) - (item.quota_used || item.registered_count || 0), 0) : null
  }));
  const paged = paginateItems(items, payload);
  return { list: paged.items, ...paged };
}

async function getCampaignDetail({ payload, db }) {
  const campaign = await getDocById(db, "campaign", payload.campaignId || payload.campaign_id);
  assertStoreMatch(payload, campaign);
  return campaign;
}

async function createCampaignRegistration({ payload, wxContext, db }) {
  const campaignId = payload.campaignId || payload.campaign_id;
  const user = await getCurrentUser({ db, wxContext }).catch(() => null);
  const profile = assertAuthorizedProfile(payload.profile || {}, user || {});
  const participantCount = assertIntegerRange(payload.participant_count || payload.participantCount || 1, "participant_count", { min: 1, max: 20 });
  let lock;
  try {
    lock = await acquireReservationLock({ db, storeId: getStoreId(payload), resourceType: "campaign", resourceId: campaignId, openid: wxContext.OPENID });
    const campaign = await getDocById(db, "campaign", campaignId);
    assertStoreMatch(payload, campaign);
    if (campaign.status !== "published") throw businessError("RESOURCE_DISABLED", "campaign is not published");
    const existing = await findOne(db, "campaign_registration", { store_id: campaign.store_id, campaign_id: campaignId, openid: wxContext.OPENID });
    if (existing && ![CAMPAIGN_REGISTRATION_STATUS.CANCELED, CAMPAIGN_REGISTRATION_STATUS.REJECTED].includes(existing.status)) {
      throw businessError("DUPLICATE_REGISTRATION", "user already registered campaign");
    }
    const quotaTotal = campaign.quota_total || campaign.quota || 0;
    const quotaUsed = campaign.quota_used || campaign.registered_count || 0;
    if ((campaign.quota_limited || campaign.quota) && quotaUsed + participantCount > quotaTotal) {
      throw businessError("CAMPAIGN_FULL", "campaign full");
    }
    const status = campaign.need_review ? CAMPAIGN_REGISTRATION_STATUS.PENDING_REVIEW : CAMPAIGN_REGISTRATION_STATUS.SUCCESS;
    const created_at = nowIso();
    const result = await db.collection("campaign_registration").add({
      data: {
        store_id: campaign.store_id,
        campaign_id: campaignId,
        openid: wxContext.OPENID,
        user_id: user && user._id ? user._id : wxContext.OPENID,
        nickname: profile.nickname,
        nick_name: profile.nickname,
        phone: profile.phone,
        participant_count: participantCount,
        status,
        form_data: payload.form_data || payload.formData || {},
        remark: payload.remark || "",
        quota_reserved: Boolean(campaign.quota_limited || campaign.quota),
        created_at,
        updated_at: created_at
      }
    });
    if (campaign.quota_limited || campaign.quota) {
      await db.collection("campaign").doc(campaignId).update({ data: { quota_used: quotaUsed + participantCount, registered_count: quotaUsed + participantCount, updated_at: created_at } });
    }
    const customerProfile = await findOneOptionalCollection(db, "customer_profile", { store_id: campaign.store_id, user_id: user && user._id ? user._id : wxContext.OPENID });
    await upsertCustomerProfile({ db, storeId: campaign.store_id, openid: wxContext.OPENID, user: user || { _id: wxContext.OPENID, phone: profile.phone, nickname: profile.nickname }, patch: { campaign_count: (customerProfile ? customerProfile.campaign_count || 0 : 0) + 1 } });
    return { registrationId: result._id, registration_id: result._id, status, registration: { _id: result._id, status } };
  } finally {
    await releaseReservationLock({ db, lock });
  }
}

async function manageCampaigns({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  const staff = await assertStaffPermission({ db, wxContext, storeId, minRole: "manager" });
  const action = payload.action || "upsert";
  if (!["upsert", "update", "publish", "offline"].includes(action)) throw businessError("INVALID_ACTION", "unsupported campaign action");
  const campaignId = payload.campaign_id || payload.campaignId || (payload.payload && payload.payload._id) || `campaign_${storeId}_${Date.now()}`;
  const before = await db.collection("campaign").doc(campaignId).get().then((res) => res.data).catch(() => null);
  const payloadData = payload.payload || {};
  validateCampaignPayload(payloadData, { isNew: !before });
  const status = action === "publish" ? "published" : action === "offline" ? "offline" : payloadData.status || (before && before.status) || "draft";
  const campaign = { ...(before || {}), ...payloadData, _id: campaignId, store_id: storeId, status, created_at: before ? before.created_at : nowIso() };
  await setDocData(db, "campaign", campaignId, campaign);
  await writeAuditLog({ db, storeId, action: `manageCampaigns:${action}`, operatorOpenid: wxContext.OPENID, operatorRole: staff.role, targetType: "campaign", targetId: campaignId, before, after: campaign, reason: payload.reason });
  return { campaign };
}

async function getCampaignRegistrations({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  const staff = await assertStaffPermission({ db, wxContext, storeId });
  const campaignId = payload.campaignId || payload.campaign_id;
  const query = { store_id: storeId };
  if (campaignId) query.campaign_id = campaignId;
  if (payload.status) query.status = payload.status;
  const result = await db.collection("campaign_registration").where(query).orderBy("created_at", "desc").get();
  const canViewFullPhone = getRoleLevel(staff.role) >= getRoleLevel("manager");
  const items = (result.data || []).map((item) => ({ ...item, phone: canViewFullPhone ? item.phone : maskPhone(item.phone) }));
  return paginateItems(items, payload);
}

async function reviewCampaignRegistration({ payload, wxContext, db }) {
  const registrationId = payload.registrationId || payload.registration_id;
  const action = payload.action || payload.reviewAction;
  const targetStatus = action === "approve" || payload.status === CAMPAIGN_REGISTRATION_STATUS.SUCCESS
    ? CAMPAIGN_REGISTRATION_STATUS.SUCCESS
    : action === "reject" || payload.status === CAMPAIGN_REGISTRATION_STATUS.REJECTED
      ? CAMPAIGN_REGISTRATION_STATUS.REJECTED
      : "";
  if (!targetStatus) throw businessError("INVALID_ACTION", "review action must be approve or reject");
  const registration = await getDocById(db, "campaign_registration", registrationId);
  assertStoreMatch(payload, registration);
  const staff = await assertStaffPermission({ db, wxContext, storeId: registration.store_id });
  if (registration.status !== CAMPAIGN_REGISTRATION_STATUS.PENDING_REVIEW) {
    throw businessError("STATE_TRANSITION_INVALID", "campaign registration is not pending review");
  }
  const reason = payload.reason || payload.reject_reason || "";
  if (targetStatus === CAMPAIGN_REGISTRATION_STATUS.REJECTED && !reason) {
    throw businessError("REASON_REQUIRED", "reject reason required");
  }
  const reviewedAt = nowIso();
  const patch = {
    status: targetStatus,
    reviewed_by: wxContext.OPENID,
    reviewed_at: reviewedAt,
    reject_reason: targetStatus === CAMPAIGN_REGISTRATION_STATUS.REJECTED ? reason : "",
    updated_at: reviewedAt
  };
  await db.collection("campaign_registration").doc(registrationId).update({ data: patch });
  if (targetStatus === CAMPAIGN_REGISTRATION_STATUS.REJECTED && registration.quota_reserved) {
    const campaign = await getDocById(db, "campaign", registration.campaign_id);
    const nextUsed = Math.max((campaign.quota_used || campaign.registered_count || 0) - (registration.participant_count || 1), 0);
    await db.collection("campaign").doc(registration.campaign_id).update({ data: { quota_used: nextUsed, registered_count: nextUsed, updated_at: reviewedAt } });
  }
  const after = { ...registration, ...patch };
  await writeAuditLog({ db, storeId: registration.store_id, action: `reviewCampaignRegistration:${action}`, operatorOpenid: wxContext.OPENID, operatorRole: staff.role, targetType: "campaign_registration", targetId: registrationId, before: registration, after, reason });
  return { registration: after };
}

async function getCustomers({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  const staff = await assertStaffPermission({ db, wxContext, storeId });
  const result = await db.collection("customer_profile").where({ store_id: storeId }).get()
    .catch((error) => {
      if (isCollectionNotFoundError(error)) return { data: [] };
      throw error;
    });
  const keyword = payload.keyword || "";
  const canViewFullPhone = getRoleLevel(staff.role) >= getRoleLevel("manager");
  const items = (result.data || [])
    .filter((item) => !keyword || String(item.phone || "").includes(keyword) || String(item.nickname || "").includes(keyword))
    .map((item) => ({ ...item, phone: canViewFullPhone ? item.phone : maskPhone(item.phone) }));
  return paginateItems(items, payload);
}

async function getCustomerProfile({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  const staff = await assertStaffPermission({ db, wxContext, storeId });
  const userId = payload.user_id || payload.userId;
  const profile = await findOneOptionalCollection(db, "customer_profile", { store_id: storeId, user_id: userId });
  if (!profile) throw businessError("RESOURCE_NOT_FOUND", "customer profile not found");
  return { ...profile, phone: getRoleLevel(staff.role) >= getRoleLevel("manager") ? profile.phone : maskPhone(profile.phone) };
}

async function getNoShowRecords({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  await assertStaffPermission({ db, wxContext, storeId });
  const status = payload.status || NO_SHOW_STATUS.ACTIVE;
  const result = await db.collection("no_show_record").where({ store_id: storeId, status }).orderBy("created_at", "desc").get();
  return paginateItems(result.data || [], payload);
}

async function getAuditLogs({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  await assertStaffPermission({ db, wxContext, storeId, minRole: "manager" });
  const query = { store_id: storeId };
  if (payload.action) query.action = payload.action;
  if (payload.targetType || payload.target_type) query.target_type = payload.targetType || payload.target_type;
  const result = await db.collection("audit_log").where(query).orderBy("created_at", "desc").get().catch(() => ({ data: [] }));
  return paginateItems(result.data || [], payload);
}

async function liftNoShowBan({ payload, wxContext, db }) {
  const recordId = payload.noShowRecordId || payload.no_show_record_id;
  const reason = payload.reason || "";
  if (!reason) throw businessError("REASON_REQUIRED", "lift reason required");
  const record = await getDocById(db, "no_show_record", recordId);
  assertStoreMatch(payload, record);
  const staff = await assertStaffPermission({ db, wxContext, storeId: record.store_id, minRole: "manager" });
  const liftedAt = nowIso();
  const after = { ...record, status: NO_SHOW_STATUS.LIFTED, lifted_by: wxContext.OPENID, lifted_at: liftedAt, lift_reason: reason };
  await db.collection("no_show_record").doc(recordId).update({ data: { status: NO_SHOW_STATUS.LIFTED, lifted_by: wxContext.OPENID, lifted_at: liftedAt, lift_reason: reason, updated_at: liftedAt } });
  await writeAuditLog({ db, storeId: record.store_id, action: "liftNoShowBan", operatorOpenid: wxContext.OPENID, operatorRole: staff.role, targetType: "no_show_record", targetId: recordId, before: record, after, reason });
  return { noShowRecordId: recordId, no_show_record: after, status: NO_SHOW_STATUS.LIFTED };
}

async function getDebugContext({ wxContext }) {
  return { openid: wxContext.OPENID || "", appid: wxContext.APPID || "", unionid: wxContext.UNIONID || "", env: wxContext.ENV || "", test_only_actions: TEST_ONLY_ACTIONS };
}

async function ensureCollections(db, collectionNames) {
  if (typeof db.createCollection !== "function") return;
  for (const collectionName of collectionNames) {
    try {
      await db.createCollection(collectionName);
    } catch (error) {
      const message = error.message || "";
      if (!message.includes("exist") && !message.includes("already") && !message.includes("collection")) throw error;
    }
  }
}

function tablesSortOrder(prefix, index) {
  const offsets = { A: 0, B: 12, C: 22, D: 30, E: 36 };
  return (offsets[prefix] || 0) + index + 1;
}

async function bootstrapMvp({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  const openid = wxContext.OPENID;
  const requestedOpenid = payload.openid || payload.managerOpenid || payload.manager_openid || openid;
  if (!openid) throw businessError("UNAUTHORIZED", "login required");
  if (requestedOpenid !== openid) throw businessError("FORBIDDEN", "can only bootstrap current openid");
  await ensureCollections(db, ["store", "staff_user", "user", "billiard_table", "assistant", "campaign", "price_rule", "reservation", "reservation_lock", "assistant_reservation", "campaign_registration", "customer_profile", "no_show_record", "table_status_log", "assistant_status_log", "audit_log", "page_config", "asset"]);
  const now = nowIso();
  await setDocData(db, "store", storeId, { _id: storeId, name: "Demo Billiards Club", address: "Demo Address", phone: "18800000001", business_hours: { mode: "24h" }, booking_rule: { min_advance_minutes: 30, hold_minutes: 15, min_duration_minutes: 60, max_duration_minutes: 240, no_show_ban_days: 3 }, status: "active", created_at: now });
  await setDocData(db, "user", `user_${openid}`, { _id: `user_${openid}`, openid, nickname: "Demo Manager", phone: "18800000001", status: "active", created_at: now });
  await setDocData(db, "staff_user", `staff_${openid}`, { _id: `staff_${openid}`, store_id: storeId, openid, user_id: `user_${openid}`, name: "Demo Manager", display_name: "Demo Manager", role: "manager", enabled: true, status: "active", created_at: now });
  const tableGroups = [
    { prefix: "A", count: 12, table_type: "standard", table_type_name: "普台", area_name: "普台区", price_cent: 3800 },
    { prefix: "B", count: 10, table_type: "silver", table_type_name: "乔氏银腿", area_name: "银腿区", price_cent: 4800 },
    { prefix: "C", count: 8, table_type: "duya", table_type_name: "独牙", area_name: "独牙区", price_cent: 5800 },
    { prefix: "D", count: 6, table_type: "gold", table_type_name: "乔氏金腿", area_name: "金腿区", price_cent: 6800 },
    { prefix: "E", count: 4, table_type: "rose_gold", table_type_name: "乔氏玫瑰金", area_name: "玫瑰金区", price_cent: 7800 }
  ];
  const tables = tableGroups.flatMap((group) => Array.from({ length: group.count }, (_, index) => {
    const code = `${group.prefix}${String(index + 1).padStart(2, "0")}`;
    return { ...group, id: `${storeId}_table_${code}`, code, sort_order: tablesSortOrder(group.prefix, index) };
  }));
  for (const table of tables) {
    await setDocData(db, "billiard_table", table.id, { _id: table.id, store_id: storeId, code: table.code, table_no: table.code, table_type: table.table_type, table_type_name: table.table_type_name, area_name: table.area_name, status: TABLE_STATUS.FREE, enabled: true, price_cent: table.price_cent, sort_order: table.sort_order, created_at: now });
  }
  await setDocData(db, "assistant", `${storeId}_assistant_001`, { _id: `${storeId}_assistant_001`, store_id: storeId, name: "Coach A", tags: ["beginner"], intro: "Demo coach", service_price_cent: 8800, status: ASSISTANT_STATUS.IDLE, enabled: true, sort: 1, created_at: now });
  await setDocData(db, "campaign", `${storeId}_campaign_new_user`, { _id: `${storeId}_campaign_new_user`, store_id: storeId, title: "New User Trial", campaign_type: "new_user", content: "Demo campaign", rules: "One registration per user", quota_limited: true, quota_total: 100, quota_used: 0, need_review: false, member_only: false, status: "published", created_at: now, start_time: now, end_time: addDays(new Date(), 30) });
  await setDocData(db, "page_config", `${storeId}_home_published`, normalizePageConfig(storeId, "home", { ...DEFAULT_HOME_PAGE_CONFIG, _id: `${storeId}_home_published`, store_id: storeId, created_at: now }));
  await setDocData(db, "asset", `${storeId}_asset_hero`, { _id: `${storeId}_asset_hero`, store_id: storeId, name: "首页 Hero", type: "hero", url: "/assets/generated/billiards-bg-option-1.png", file_id: "", status: "active", created_at: now });
  await writeAuditLog({ db, storeId, action: "bootstrapMvp", operatorOpenid: openid, operatorRole: "manager", targetType: "store", targetId: storeId, after: { status: "ready" }, reason: "test-only MVP bootstrap data" });
  return { storeId, managerOpenid: openid, role: "manager", tables: tables.length, assistants: 1, campaigns: 1, test_only: true };
}

async function validateMvpBootstrap({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  const checks = [];
  function addCheck(name, passed, detail = "") {
    checks.push({ name, passed: Boolean(passed), detail });
  }
  const storeRes = await db.collection("store").doc(storeId).get().catch(() => ({ data: null }));
  addCheck("store", Boolean(storeRes.data), storeRes.data ? storeRes.data.name || storeId : "missing");
  const staff = await findOne(db, "staff_user", { store_id: storeId, openid: wxContext.OPENID, enabled: true }).catch(() => null);
  addCheck("manager permission", Boolean(staff && getRoleLevel(staff.role) >= getRoleLevel("manager")), staff ? staff.role : "missing");
  for (const name of ["billiard_table", "assistant", "campaign", "reservation", "reservation_lock", "assistant_reservation", "campaign_registration", "customer_profile", "no_show_record", "table_status_log", "assistant_status_log", "audit_log", "page_config", "asset"]) {
    const result = await db.collection(name).get().catch(() => ({ data: [] }));
    addCheck(`collection:${name}`, Array.isArray(result.data));
  }
  const passedCount = checks.filter((item) => item.passed).length;
  return { ok: passedCount === checks.length, passedCount, totalCount: checks.length, checks, test_only: true };
}

async function runMvpFlowSmokeTest({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  await assertStaffPermission({ db, wxContext, storeId, minRole: "manager" });
  const table = (await db.collection("billiard_table").where({ store_id: storeId, enabled: true, status: TABLE_STATUS.FREE }).limit(1).get()).data[0];
  if (!table) throw businessError("NO_AVAILABLE_TABLE", "no available table for smoke test");
  const startAt = new Date(Date.now() + 90 * 60 * 1000);
  startAt.setSeconds(0, 0);
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  const steps = [];
  const created = await createReservation({ payload: { storeId, tableId: table._id, startTime: startAt.toISOString(), endTime: endAt.toISOString(), peopleCount: 1, remark: "MVP smoke test" }, wxContext, db });
  steps.push({ name: "createReservation", status: created.status, passed: created.status === RESERVATION_STATUS.WAITING_ARRIVAL });
  const submitted = await submitArrival({ payload: { storeId, reservationId: created.reservationId }, wxContext, db });
  steps.push({ name: "submitArrival", status: submitted.status, passed: submitted.status === RESERVATION_STATUS.WAITING_REVIEW });
  const confirmed = await confirmArrival({ payload: { storeId, reservationId: created.reservationId, remark: "smoke confirm" }, wxContext, db });
  steps.push({ name: "confirmArrival", status: confirmed.status, passed: confirmed.status === RESERVATION_STATUS.ARRIVED });
  const opened = await openTable({ payload: { storeId, reservationId: created.reservationId }, wxContext, db });
  steps.push({ name: "openTable", status: opened.status, passed: opened.status === RESERVATION_STATUS.IN_SERVICE });
  const closed = await closeTable({ payload: { storeId, reservationId: created.reservationId, nextTableStatus: TABLE_STATUS.FREE }, wxContext, db });
  steps.push({ name: "closeTable", status: closed.status, passed: closed.status === RESERVATION_STATUS.COMPLETED });
  const passedCount = steps.filter((item) => item.passed).length;
  return { ok: passedCount === steps.length, reservationId: created.reservationId, tableId: table._id, passedCount, totalCount: steps.length, steps, test_only: true };
}

async function runMvpGuardSmokeTest({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  await assertStaffPermission({ db, wxContext, storeId, minRole: "manager" });
  const table = (await db.collection("billiard_table").where({ store_id: storeId, enabled: true, status: TABLE_STATUS.FREE }).limit(1).get()).data[0];
  if (!table) throw businessError("NO_AVAILABLE_TABLE", "no available table for guard smoke test");
  const steps = [];
  const addStep = (name, passed, detail = "") => steps.push({ name, passed: Boolean(passed), detail });
  const startAt = new Date(Date.now() + 150 * 60 * 1000);
  startAt.setSeconds(0, 0);
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  const base = await createReservation({ payload: { storeId, tableId: table._id, startTime: startAt.toISOString(), endTime: endAt.toISOString() }, wxContext, db });
  addStep("baseReservation", base.status === RESERVATION_STATUS.WAITING_ARRIVAL, base.status);
  try {
    await createReservation({ payload: { storeId, tableId: table._id, startTime: startAt.toISOString(), endTime: endAt.toISOString() }, wxContext: { OPENID: "second_user" }, db });
    addStep("overlapRejected", false, "unexpected success");
  } catch (error) {
    addStep("overlapRejected", error.code === "TABLE_TIME_CONFLICT" || error.code === "LOCK_BUSY", error.code);
  }
  const noShowStart = new Date(Date.now() + 240 * 60 * 1000);
  noShowStart.setSeconds(0, 0);
  const noShowEnd = new Date(noShowStart.getTime() + 60 * 60 * 1000);
  const noShowSource = await createReservation({ payload: { storeId, tableId: table._id, startTime: noShowStart.toISOString(), endTime: noShowEnd.toISOString() }, wxContext, db });
  const marked = await markNoShow({ payload: { storeId, reservationId: noShowSource.reservationId, reason: "MVP guard smoke" }, wxContext, db });
  addStep("markNoShow", marked.status === RESERVATION_STATUS.NO_SHOW, marked.status);
  try {
    await createReservation({ payload: { storeId, tableId: table._id, startTime: new Date(Date.now() + 360 * 60 * 1000).toISOString(), endTime: new Date(Date.now() + 420 * 60 * 1000).toISOString() }, wxContext, db });
    addStep("noShowLockRejected", false, "unexpected success");
  } catch (error) {
    addStep("noShowLockRejected", error.code === "NO_SHOW_LOCKED", error.code);
  }
  const noShowRecord = (await db.collection("no_show_record").where({ store_id: storeId, openid: wxContext.OPENID, reservation_id: noShowSource.reservationId }).limit(1).get()).data[0];
  const lifted = await liftNoShowBan({ payload: { storeId, noShowRecordId: noShowRecord._id, reason: "MVP guard smoke lift" }, wxContext, db });
  addStep("liftNoShowBan", lifted.status === NO_SHOW_STATUS.LIFTED, lifted.status);
  const passedCount = steps.filter((item) => item.passed).length;
  return { ok: passedCount === steps.length, passedCount, totalCount: steps.length, baseReservationId: base.reservationId, noShowReservationId: noShowSource.reservationId, steps, test_only: true };
}

module.exports = {
  authorizePhone,
  bootstrapMvp,
  closeTable,
  confirmArrival,
  confirmAssistantReservation,
  createAssistantReservation,
  createCampaignRegistration,
  createReservation,
  getAdminDashboard,
  getAdminReservations,
  getAssets,
  getAssistantDetail,
  getAssistants,
  getAuditLogs,
  getAvailableTables,
  getCampaignDetail,
  getCampaignRegistrations,
  getCampaigns,
  getCurrentRole,
  getCurrentUser,
  getCustomerProfile,
  getCustomers,
  getDebugContext,
  getMyReservations,
  getMineCenter,
  getNoShowRecords,
  getPageConfig,
  getPriceRules,
  getReservationDetail,
  getStaffWorkbench,
  getStoreDetail,
  getStoreOverview,
  getTodayReservations,
  liftNoShowBan,
  loginByWechat,
  manageAssistants,
  manageAssets,
  manageCampaigns,
  managePageConfig,
  managePriceRules,
  manageStore,
  manageTables,
  markNoShow,
  openTable,
  rejectArrival,
  releaseReservation,
  reviewCampaignRegistration,
  runMvpFlowSmokeTest,
  runMvpGuardSmokeTest,
  submitArrival,
  updateAssistantStatus,
  updateTableStatus,
  validateMvpBootstrap
};
