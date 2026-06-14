const {
  ASSISTANT_RESERVATION_STATUS,
  CAMPAIGN_REGISTRATION_STATUS,
  NO_SHOW_LOCK_DAYS,
  RESERVATION_STATUS,
  TABLE_STATUS
} = require("./constants");
const {
  assertAuthorizedProfile,
  assertNoAssistantConflict,
  assertNoShowAllowed,
  assertNoTableConflict,
  assertReservationTime,
  businessError
} = require("./rules");

const DEFAULT_STORE_ID = "store_demo_001";
const LOCK_TTL_MS = 60 * 1000;
const ROLE_LEVEL = {
  staff: 1,
  manager: 2,
  owner: 3,
  admin: 3
};

function nowIso() {
  return new Date().toISOString();
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString();
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

async function getDocById(db, collection, id) {
  if (!id) {
    throw businessError("ID_REQUIRED", "record id required");
  }

  const result = await db.collection(collection).doc(id).get();
  if (!result.data) {
    throw businessError("NOT_FOUND", "record not found");
  }
  return result.data;
}

function getRoleLevel(role) {
  return ROLE_LEVEL[role] || 0;
}

async function assertStaffPermission({ db, wxContext, storeId, minRole = "staff" }) {
  if (!wxContext.OPENID) {
    throw businessError("UNAUTHORIZED", "login required");
  }

  const result = await db.collection("staff_user")
    .where({ store_id: storeId, openid: wxContext.OPENID, enabled: true })
    .limit(1)
    .get();

  const staff = (result.data || [])[0];
  if (!staff || getRoleLevel(staff.role) < getRoleLevel(minRole)) {
    throw businessError("FORBIDDEN", "staff permission required");
  }
  return staff;
}

function assertReservationStore({ payload, reservation }) {
  const payloadStoreId = payload.storeId || payload.store_id;
  if (payloadStoreId && payloadStoreId !== reservation.store_id) {
    throw businessError("RESOURCE_STORE_MISMATCH", "reservation store mismatch");
  }
}

async function updateReservationStatus({ db, reservationId, status, extra = {} }) {
  const updated_at = nowIso();
  await db.collection("reservation").doc(reservationId).update({
    data: {
      status,
      updated_at,
      ...extra
    }
  });
  return { reservationId, status, updatedAt: updated_at };
}

async function writeAuditLog({ db, storeId, action, operatorOpenid, targetType, targetId, beforeStatus, afterStatus, remark }) {
  await db.collection("audit_log").add({
    data: {
      store_id: storeId,
      action,
      operator_openid: operatorOpenid,
      target_type: targetType,
      target_id: targetId,
      before_status: beforeStatus || "",
      after_status: afterStatus || "",
      remark: remark || "",
      created_at: nowIso()
    }
  });
}

async function writeReservationAudit({ db, reservation, wxContext, action, afterStatus, remark }) {
  await writeAuditLog({
    db,
    storeId: reservation.store_id,
    action,
    operatorOpenid: wxContext.OPENID,
    targetType: "reservation",
    targetId: reservation._id,
    beforeStatus: reservation.status,
    afterStatus,
    remark
  });
}

async function writeTableStatusLog({ db, reservation, status, operatorOpenid, remark }) {
  if (!reservation.table_id) return;

  await db.collection("table_status_log").add({
    data: {
      store_id: reservation.store_id,
      table_id: reservation.table_id,
      reservation_id: reservation._id,
      status,
      operator_openid: operatorOpenid,
      remark: remark || "",
      created_at: nowIso()
    }
  });
}

async function assertEnabledResource({ db, collection, id, storeId, disabledStatuses = [] }) {
  const resource = await getDocById(db, collection, id);
  if (resource.store_id !== storeId) {
    throw businessError("RESOURCE_STORE_MISMATCH", "resource store mismatch");
  }
  if (resource.enabled === false || disabledStatuses.includes(resource.status)) {
    throw businessError("RESOURCE_UNAVAILABLE", "resource unavailable");
  }
  if (collection === "assistant" && resource.status_code && resource.status_code !== "idle") {
    throw businessError("RESOURCE_UNAVAILABLE", "assistant unavailable");
  }
  return resource;
}

function lockDocId(lockKey) {
  return Buffer.from(lockKey).toString("base64").replace(/[+/=]/g, "_");
}

async function acquireReservationLock({ db, storeId, tableId, startTime, endTime, openid }) {
  const lockKey = `table:${storeId}:${tableId}:${startTime}:${endTime}`;
  const lockId = lockDocId(lockKey);
  const lockDoc = db.collection("reservation_lock").doc(lockId);
  const current = await lockDoc.get().catch(() => ({ data: null }));

  if (current.data && current.data.status === "active" && new Date(current.data.expires_at).getTime() > Date.now()) {
    throw businessError("LOCK_BUSY", "reservation lock busy");
  }

  const data = {
    lock_key: lockKey,
    store_id: storeId,
    table_id: tableId,
    openid,
    status: "active",
    expires_at: new Date(Date.now() + LOCK_TTL_MS).toISOString(),
    created_at: nowIso(),
    updated_at: nowIso()
  };

  if (typeof lockDoc.set === "function") {
    await lockDoc.set({ data });
  } else {
    await lockDoc.update({ data });
  }

  return { lockId, lockKey };
}

async function releaseReservationLock({ db, lock }) {
  if (!lock) return;
  await db.collection("reservation_lock").doc(lock.lockId).update({
    data: {
      status: "released",
      released_at: nowIso(),
      updated_at: nowIso()
    }
  }).catch(() => {});
}

async function getStoreOverview({ payload, db }) {
  const storeId = getStoreId(payload);
  const [storeRes, tableRes, assistantRes, campaignRes] = await Promise.all([
    db.collection("store").doc(storeId).get().catch(() => ({ data: null })),
    db.collection("billiard_table").where({ store_id: storeId, enabled: true }).get(),
    db.collection("assistant").where({ store_id: storeId, status: TABLE_STATUS.FREE, enabled: true }).get(),
    db.collection("campaign").where({ store_id: storeId, status: "已发布" }).limit(5).get()
  ]);

  const tables = tableRes.data || [];
  const store = storeRes.data || {
    _id: storeId,
    name: "Demo Store",
    business_hours: "24h",
    reservation_lead_minutes: 30,
    no_show_lock_days: 3,
    table_count: 40
  };

  return {
    store: {
      id: store._id || storeId,
      name: store.name,
      businessHours: store.business_hours || "24h",
      reservationLeadMinutes: store.reservation_lead_minutes || 30,
      noShowLockDays: store.no_show_lock_days || 3,
      tableCount: store.table_count || 40
    },
    freeTableCount: tables.filter((item) => item.status === TABLE_STATUS.FREE).length,
    freeAssistantCount: (assistantRes.data || []).length,
    campaigns: campaignRes.data || []
  };
}

async function getDebugContext({ wxContext }) {
  return {
    openid: wxContext.OPENID || "",
    appid: wxContext.APPID || "",
    unionid: wxContext.UNIONID || "",
    env: wxContext.ENV || ""
  };
}

async function setDocData(db, collectionName, id, data) {
  const doc = db.collection(collectionName).doc(id);
  const { _id, ...docData } = data;
  const nextData = {
    ...docData,
    updated_at: nowIso()
  };

  if (typeof doc.set === "function") {
    await doc.set({ data: nextData });
    return;
  }

  await doc.update({ data: nextData });
}

async function ensureCollections(db, collectionNames) {
  if (typeof db.createCollection !== "function") return;

  for (const collectionName of collectionNames) {
    try {
      await db.createCollection(collectionName);
    } catch (error) {
      const message = error.message || "";
      if (!message.includes("exist") && !message.includes("already") && !message.includes("collection")) {
        throw error;
      }
    }
  }
}

async function bootstrapMvp({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  const openid = wxContext.OPENID;
  const requestedOpenid = payload.openid || payload.managerOpenid || payload.manager_openid || openid;

  if (!openid) {
    throw businessError("UNAUTHORIZED", "login required");
  }
  if (requestedOpenid !== openid) {
    throw businessError("FORBIDDEN", "can only bootstrap current openid");
  }

  await ensureCollections(db, [
    "store",
    "staff_user",
    "billiard_table",
    "assistant",
    "campaign",
    "reservation",
    "reservation_lock",
    "assistant_reservation",
    "no_show_record",
    "table_status_log",
    "audit_log"
  ]);

  const now = nowIso();
  await setDocData(db, "store", storeId, {
    _id: storeId,
    name: "星火台球俱乐部",
    address: "示例地址",
    phone: "18800000001",
    business_hours: "24小时营业",
    reservation_lead_minutes: 30,
    no_show_lock_days: 3,
    table_count: 3,
    status: "active",
    created_at: now
  });

  await setDocData(db, "staff_user", `staff_${openid}`, {
    _id: `staff_${openid}`,
    store_id: storeId,
    openid,
    name: "测试店长",
    role: "manager",
    enabled: true,
    created_at: now
  });

  const tables = [
    { id: `${storeId}_table_A01`, code: "A01", area: "普台区", type: "普台", price_cent: 3800 },
    { id: `${storeId}_table_A02`, code: "A02", area: "普台区", type: "普台", price_cent: 3800 },
    { id: `${storeId}_table_B01`, code: "B01", area: "银腿区", type: "乔氏银腿", price_cent: 4800 }
  ];

  for (const table of tables) {
    await setDocData(db, "billiard_table", table.id, {
      _id: table.id,
      store_id: storeId,
      code: table.code,
      table_no: table.code,
      area: table.area,
      area_name: table.area,
      type: table.type,
      table_type_name: table.type,
      status: TABLE_STATUS.FREE,
      enabled: true,
      price_cent: table.price_cent,
      created_at: now
    });
  }

  await setDocData(db, "assistant", `${storeId}_assistant_001`, {
    _id: `${storeId}_assistant_001`,
    store_id: storeId,
    name: "小乔",
    tags: ["新手教学", "陪练"],
    intro: "适合新手入门和基础陪练。",
    service_price_cent: 8800,
    status: TABLE_STATUS.FREE,
    status_code: "idle",
    enabled: true,
    sort: 1,
    created_at: now
  });

  await setDocData(db, "campaign", `${storeId}_campaign_new_user`, {
    _id: `${storeId}_campaign_new_user`,
    store_id: storeId,
    title: "新人首练特惠",
    content: "新用户首次到店体验活动。",
    rules: "每个用户限参与一次。",
    quota: 100,
    registered_count: 0,
    need_review: false,
    status: "已发布",
    created_at: now,
    start_time: now,
    end_time: addDays(new Date(), 30)
  });

  await writeAuditLog({
    db,
    storeId,
    action: "bootstrapMvp",
    operatorOpenid: openid,
    targetType: "store",
    targetId: storeId,
    afterStatus: "ready",
    remark: "MVP bootstrap data"
  });

  return {
    storeId,
    managerOpenid: openid,
    role: "manager",
    tables: tables.length,
    assistants: 1,
    campaigns: 1
  };
}

async function validateMvpBootstrap({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  const checks = [];

  function addCheck(name, passed, detail = "") {
    checks.push({ name, passed: Boolean(passed), detail });
  }

  async function collectionExists(name) {
    try {
      await db.collection(name).limit(1).get();
      return true;
    } catch (error) {
      return false;
    }
  }

  const storeRes = await db.collection("store").doc(storeId).get().catch(() => ({ data: null }));
  addCheck("store", Boolean(storeRes.data), storeRes.data ? storeRes.data.name || storeId : "missing");

  const staffRes = await db.collection("staff_user")
    .where({ store_id: storeId, openid: wxContext.OPENID, enabled: true })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  const staff = (staffRes.data || [])[0];
  addCheck("manager permission", Boolean(staff && getRoleLevel(staff.role) >= getRoleLevel("manager")), staff ? staff.role : "missing");

  const tableRes = await db.collection("billiard_table")
    .where({ store_id: storeId, enabled: true })
    .limit(10)
    .get()
    .catch(() => ({ data: [] }));
  addCheck("available tables", (tableRes.data || []).length > 0, `${(tableRes.data || []).length} tables`);

  const assistantRes = await db.collection("assistant")
    .where({ store_id: storeId, enabled: true })
    .limit(10)
    .get()
    .catch(() => ({ data: [] }));
  addCheck("assistants", (assistantRes.data || []).length > 0, `${(assistantRes.data || []).length} assistants`);

  const campaignRes = await db.collection("campaign")
    .where({ store_id: storeId })
    .limit(10)
    .get()
    .catch(() => ({ data: [] }));
  addCheck("campaigns", (campaignRes.data || []).length > 0, `${(campaignRes.data || []).length} campaigns`);

  const requiredCollections = [
    "reservation",
    "reservation_lock",
    "assistant_reservation",
    "no_show_record",
    "table_status_log",
    "audit_log"
  ];

  for (const collectionName of requiredCollections) {
    addCheck(`collection:${collectionName}`, await collectionExists(collectionName));
  }

  const passedCount = checks.filter((item) => item.passed).length;
  return {
    ok: passedCount === checks.length,
    passedCount,
    totalCount: checks.length,
    checks
  };
}

async function runMvpFlowSmokeTest({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  await assertStaffPermission({ db, wxContext, storeId, minRole: "manager" });

  const tableRes = await db.collection("billiard_table")
    .where({ store_id: storeId, enabled: true, status: TABLE_STATUS.FREE })
    .limit(1)
    .get();
  const table = (tableRes.data || [])[0];
  if (!table) {
    throw businessError("NO_AVAILABLE_TABLE", "no available table for smoke test");
  }

  const startAt = new Date(Date.now() + 90 * 60 * 1000);
  startAt.setSeconds(0, 0);
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  const steps = [];

  const created = await createReservation({
    payload: {
      storeId,
      tableId: table._id,
      startTime: startAt.toISOString(),
      endTime: endAt.toISOString(),
      peopleCount: 1,
      remark: "MVP smoke test"
    },
    wxContext,
    db
  });
  steps.push({ name: "createReservation", status: created.status, passed: created.status === RESERVATION_STATUS.WAITING_ARRIVAL });

  const submitted = await submitArrival({
    payload: { storeId, reservationId: created.reservationId },
    wxContext,
    db
  });
  steps.push({ name: "submitArrival", status: submitted.status, passed: submitted.status === RESERVATION_STATUS.WAITING_REVIEW });

  const confirmed = await confirmArrival({
    payload: { storeId, reservationId: created.reservationId, remark: "smoke confirm" },
    wxContext,
    db
  });
  steps.push({ name: "confirmArrival", status: confirmed.status, passed: confirmed.status === RESERVATION_STATUS.ARRIVED });

  const opened = await openTable({
    payload: { storeId, reservationId: created.reservationId },
    wxContext,
    db
  });
  steps.push({ name: "openTable", status: opened.status, passed: opened.status === RESERVATION_STATUS.IN_SERVICE });

  const closed = await closeTable({
    payload: { storeId, reservationId: created.reservationId, nextTableStatus: TABLE_STATUS.FREE },
    wxContext,
    db
  });
  steps.push({ name: "closeTable", status: closed.status, passed: closed.status === RESERVATION_STATUS.COMPLETED });

  const finalReservation = await getDocById(db, "reservation", created.reservationId);
  const finalTable = await getDocById(db, "billiard_table", table._id);
  steps.push({
    name: "finalReservationStatus",
    status: finalReservation.status,
    passed: finalReservation.status === RESERVATION_STATUS.COMPLETED
  });
  steps.push({
    name: "finalTableStatus",
    status: finalTable.status,
    passed: finalTable.status === TABLE_STATUS.FREE
  });

  const passedCount = steps.filter((item) => item.passed).length;
  return {
    ok: passedCount === steps.length,
    reservationId: created.reservationId,
    tableId: table._id,
    passedCount,
    totalCount: steps.length,
    steps
  };
}

async function runMvpGuardSmokeTest({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  await assertStaffPermission({ db, wxContext, storeId, minRole: "manager" });

  const tableRes = await db.collection("billiard_table")
    .where({ store_id: storeId, enabled: true, status: TABLE_STATUS.FREE })
    .limit(2)
    .get();
  const tables = tableRes.data || [];
  const table = tables[0];
  if (!table) {
    throw businessError("NO_AVAILABLE_TABLE", "no available table for guard smoke test");
  }

  const steps = [];
  function addStep(name, passed, detail = "") {
    steps.push({ name, passed: Boolean(passed), detail });
  }

  const startAt = new Date(Date.now() + 150 * 60 * 1000);
  startAt.setSeconds(0, 0);
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

  const base = await createReservation({
    payload: {
      storeId,
      tableId: table._id,
      startTime: startAt.toISOString(),
      endTime: endAt.toISOString(),
      peopleCount: 1,
      remark: "MVP guard smoke base"
    },
    wxContext,
    db
  });
  addStep("baseReservation", base.status === RESERVATION_STATUS.WAITING_ARRIVAL, base.status);

  try {
    await createReservation({
      payload: {
        storeId,
        tableId: table._id,
        startTime: startAt.toISOString(),
        endTime: endAt.toISOString(),
        peopleCount: 1,
        remark: "MVP guard smoke overlap"
      },
      wxContext,
      db
    });
    addStep("overlapRejected", false, "unexpected success");
  } catch (error) {
    addStep("overlapRejected", error.code === "TABLE_TIME_CONFLICT", error.code || error.message);
  }

  const earlyStart = new Date(Date.now() + 10 * 60 * 1000);
  earlyStart.setSeconds(0, 0);
  const earlyEnd = new Date(earlyStart.getTime() + 60 * 60 * 1000);
  try {
    await createReservation({
      payload: {
        storeId,
        tableId: table._id,
        startTime: earlyStart.toISOString(),
        endTime: earlyEnd.toISOString(),
        peopleCount: 1,
        remark: "MVP guard smoke early"
      },
      wxContext,
      db
    });
    addStep("earlyReservationRejected", false, "unexpected success");
  } catch (error) {
    addStep("earlyReservationRejected", error.code === "RESERVATION_TOO_EARLY", error.code || error.message);
  }

  const noShowStart = new Date(Date.now() + 240 * 60 * 1000);
  noShowStart.setSeconds(0, 0);
  const noShowEnd = new Date(noShowStart.getTime() + 60 * 60 * 1000);
  const noShowSource = await createReservation({
    payload: {
      storeId,
      tableId: table._id,
      startTime: noShowStart.toISOString(),
      endTime: noShowEnd.toISOString(),
      peopleCount: 1,
      remark: "MVP guard smoke no-show source"
    },
    wxContext,
    db
  });
  addStep("noShowSourceReservation", noShowSource.status === RESERVATION_STATUS.WAITING_ARRIVAL, noShowSource.status);

  const marked = await markNoShow({
    payload: { storeId, reservationId: noShowSource.reservationId, reason: "MVP guard smoke" },
    wxContext,
    db
  });
  addStep("markNoShow", marked.status === RESERVATION_STATUS.NO_SHOW, marked.status);

  const afterNoShowStart = new Date(Date.now() + 360 * 60 * 1000);
  afterNoShowStart.setSeconds(0, 0);
  const afterNoShowEnd = new Date(afterNoShowStart.getTime() + 60 * 60 * 1000);
  try {
    await createReservation({
      payload: {
        storeId,
        tableId: table._id,
        startTime: afterNoShowStart.toISOString(),
        endTime: afterNoShowEnd.toISOString(),
        peopleCount: 1,
        remark: "MVP guard smoke blocked by no-show"
      },
      wxContext,
      db
    });
    addStep("noShowLockRejected", false, "unexpected success");
  } catch (error) {
    addStep("noShowLockRejected", error.code === "NO_SHOW_LOCKED", error.code || error.message);
  }

  const noShowRes = await db.collection("no_show_record")
    .where({ store_id: storeId, openid: wxContext.OPENID, reservation_id: noShowSource.reservationId })
    .limit(1)
    .get();
  const noShowRecord = (noShowRes.data || [])[0];
  if (!noShowRecord) {
    addStep("noShowRecordCreated", false, "missing");
  } else {
    addStep("noShowRecordCreated", true, noShowRecord._id);
    const lifted = await liftNoShowBan({
      payload: { storeId, noShowRecordId: noShowRecord._id, reason: "MVP guard smoke lift" },
      wxContext,
      db
    });
    addStep("liftNoShowBan", Boolean(lifted.noShowRecordId), lifted.status);
  }

  const passedCount = steps.filter((item) => item.passed).length;
  return {
    ok: passedCount === steps.length,
    passedCount,
    totalCount: steps.length,
    baseReservationId: base.reservationId,
    noShowReservationId: noShowSource.reservationId,
    steps
  };
}

async function getAvailableTables({ payload, db }) {
  const storeId = getStoreId(payload);
  const result = await db.collection("billiard_table")
    .where({ store_id: storeId, enabled: true })
    .orderBy("code", "asc")
    .get();

  return { list: result.data || [] };
}

async function getAssistants({ payload, db }) {
  const storeId = getStoreId(payload);
  const result = await db.collection("assistant")
    .where({ store_id: storeId, enabled: true })
    .orderBy("sort", "asc")
    .get();

  return { list: result.data || [] };
}

async function getMyReservations({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  const result = await db.collection("reservation")
    .where({ store_id: storeId, openid: wxContext.OPENID })
    .orderBy("start_time", "desc")
    .limit(30)
    .get();

  return { list: result.data || [] };
}

async function getStaffWorkbench({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  await assertStaffPermission({ db, wxContext, storeId });
  const _ = db.command;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const result = await db.collection("reservation")
    .where({
      store_id: storeId,
      start_time: _.and ? _.and(_.gte(todayStart.toISOString()), _.lt(tomorrowStart.toISOString())) : _.gte(todayStart.toISOString())
    })
    .orderBy("start_time", "asc")
    .get();

  const todayReservations = (result.data || []).filter((item) => item.start_time < tomorrowStart.toISOString());
  return {
    todayReservations,
    waitingReviewCount: todayReservations.filter((item) => item.status === RESERVATION_STATUS.WAITING_REVIEW).length
  };
}

async function createReservation({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  const tableId = getTableId(payload);
  const assistantId = getAssistantId(payload);
  const startTime = getStartTime(payload);
  const endTime = getEndTime(payload);

  if (!tableId) {
    throw businessError("TABLE_REQUIRED", "table required");
  }
  assertReservationTime(startTime, endTime);
  await assertEnabledResource({
    db,
    collection: "billiard_table",
    id: tableId,
    storeId,
    disabledStatuses: [TABLE_STATUS.REPAIRING, TABLE_STATUS.DISABLED]
  });
  if (assistantId) {
    await assertEnabledResource({
      db,
      collection: "assistant",
      id: assistantId,
      storeId,
      disabledStatuses: ["未上班", "休息中", "已下班"]
    });
  }
  await assertNoShowAllowed({ db, openid: wxContext.OPENID, storeId });

  let lock;
  try {
    lock = await acquireReservationLock({ db, storeId, tableId, startTime, endTime, openid: wxContext.OPENID });
    await assertNoTableConflict({ db, storeId, tableId, startTime, endTime });
    await assertNoAssistantConflict({ db, storeId, assistantId, startTime, endTime });

    const created_at = nowIso();
    const reservation = {
      store_id: storeId,
      openid: wxContext.OPENID,
      table_id: tableId,
      assistant_id: assistantId || "",
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
      await db.collection("reservation").doc(result._id).update({
        data: { assistant_reservation_id: assistantReservation._id, updated_at: nowIso() }
      });
    }

    return {
      reservationId: result._id,
      status: RESERVATION_STATUS.WAITING_ARRIVAL
    };
  } finally {
    await releaseReservationLock({ db, lock });
  }
}

async function createAssistantReservation({ payload, wxContext, db }) {
  const storeId = getStoreId(payload);
  const assistantId = getAssistantId(payload);
  const startTime = getStartTime(payload);
  const endTime = getEndTime(payload);

  assertReservationTime(startTime, endTime);
  await assertEnabledResource({
    db,
    collection: "assistant",
    id: assistantId,
    storeId,
    disabledStatuses: ["未上班", "休息中", "已下班"]
  });
  await assertNoShowAllowed({ db, openid: wxContext.OPENID, storeId });
  await assertNoAssistantConflict({ db, storeId, assistantId, startTime, endTime });

  const created_at = nowIso();
  const result = await db.collection("assistant_reservation").add({
    data: {
      store_id: storeId,
      openid: wxContext.OPENID,
      assistant_id: assistantId,
      start_time: startTime,
      end_time: endTime,
      status: ASSISTANT_RESERVATION_STATUS.PENDING_CONFIRM,
      remark: payload.remark || "",
      created_at,
      updated_at: created_at
    }
  });

  return { assistantReservationId: result._id, status: ASSISTANT_RESERVATION_STATUS.PENDING_CONFIRM };
}

async function submitArrival({ payload, wxContext, db }) {
  const reservationId = getReservationId(payload);
  const reservation = await getDocById(db, "reservation", reservationId);
  assertReservationStore({ payload, reservation });
  if (reservation.openid !== wxContext.OPENID) {
    throw businessError("FORBIDDEN", "only owner can submit arrival");
  }
  if (reservation.status !== RESERVATION_STATUS.WAITING_ARRIVAL) {
    throw businessError("INVALID_STATUS", "invalid arrival status");
  }

  return updateReservationStatus({
    db,
    reservationId,
    status: RESERVATION_STATUS.WAITING_REVIEW,
    extra: { arrival_submitted_at: nowIso() }
  });
}

async function confirmArrival({ payload, wxContext, db }) {
  const reservationId = getReservationId(payload);
  const reservation = await getDocById(db, "reservation", reservationId);
  assertReservationStore({ payload, reservation });
  await assertStaffPermission({ db, wxContext, storeId: reservation.store_id });
  if (reservation.status !== RESERVATION_STATUS.WAITING_REVIEW) {
    throw businessError("INVALID_STATUS", "invalid confirm arrival status");
  }

  await writeReservationAudit({ db, reservation, wxContext, action: "confirmArrival", afterStatus: RESERVATION_STATUS.ARRIVED, remark: payload.remark });
  return updateReservationStatus({
    db,
    reservationId,
    status: RESERVATION_STATUS.ARRIVED,
    extra: { arrival_confirmed_at: nowIso(), arrival_confirmed_by: wxContext.OPENID }
  });
}

async function rejectArrival({ payload, wxContext, db }) {
  const reservationId = getReservationId(payload);
  const reservation = await getDocById(db, "reservation", reservationId);
  assertReservationStore({ payload, reservation });
  await assertStaffPermission({ db, wxContext, storeId: reservation.store_id });
  if (reservation.status !== RESERVATION_STATUS.WAITING_REVIEW) {
    throw businessError("INVALID_STATUS", "invalid reject arrival status");
  }

  await writeReservationAudit({ db, reservation, wxContext, action: "rejectArrival", afterStatus: RESERVATION_STATUS.WAITING_ARRIVAL, remark: payload.reason });
  return updateReservationStatus({
    db,
    reservationId,
    status: RESERVATION_STATUS.WAITING_ARRIVAL,
    extra: { arrival_rejected_at: nowIso(), arrival_rejected_by: wxContext.OPENID }
  });
}

async function markNoShow({ payload, wxContext, db }) {
  const reservationId = getReservationId(payload);
  const reservation = await getDocById(db, "reservation", reservationId);
  assertReservationStore({ payload, reservation });
  await assertStaffPermission({ db, wxContext, storeId: reservation.store_id });
  if (![RESERVATION_STATUS.WAITING_ARRIVAL, RESERVATION_STATUS.WAITING_REVIEW, RESERVATION_STATUS.ARRIVED].includes(reservation.status)) {
    throw businessError("INVALID_STATUS", "invalid no-show status");
  }

  const lockedUntil = addDays(new Date(), NO_SHOW_LOCK_DAYS);
  await db.collection("no_show_record").add({
    data: {
      store_id: reservation.store_id,
      openid: reservation.openid,
      reservation_id: reservationId,
      status: "限制中",
      lock_until: lockedUntil,
      operator_openid: wxContext.OPENID,
      reason: payload.reason || "no show",
      created_at: nowIso()
    }
  });

  await writeReservationAudit({ db, reservation, wxContext, action: "markNoShow", afterStatus: RESERVATION_STATUS.NO_SHOW, remark: payload.reason });
  return updateReservationStatus({
    db,
    reservationId,
    status: RESERVATION_STATUS.NO_SHOW,
    extra: { no_show_at: nowIso(), no_show_by: wxContext.OPENID, no_show_locked_until: lockedUntil }
  });
}

async function openTable({ payload, wxContext, db }) {
  const reservationId = getReservationId(payload);
  const reservation = await getDocById(db, "reservation", reservationId);
  assertReservationStore({ payload, reservation });
  await assertStaffPermission({ db, wxContext, storeId: reservation.store_id });
  if (reservation.status !== RESERVATION_STATUS.ARRIVED) {
    throw businessError("INVALID_STATUS", "invalid open table status");
  }
  await assertEnabledResource({
    db,
    collection: "billiard_table",
    id: reservation.table_id,
    storeId: reservation.store_id,
    disabledStatuses: [TABLE_STATUS.REPAIRING, TABLE_STATUS.DISABLED]
  });

  await db.collection("billiard_table").doc(reservation.table_id).update({
    data: { status: TABLE_STATUS.USING, updated_at: nowIso() }
  });
  await writeTableStatusLog({
    db,
    reservation,
    status: TABLE_STATUS.USING,
    operatorOpenid: wxContext.OPENID,
    remark: "open table"
  });
  await writeReservationAudit({ db, reservation, wxContext, action: "openTable", afterStatus: RESERVATION_STATUS.IN_SERVICE });

  return updateReservationStatus({
    db,
    reservationId,
    status: RESERVATION_STATUS.IN_SERVICE,
    extra: { opened_at: nowIso(), opened_by: wxContext.OPENID }
  });
}

async function closeTable({ payload, wxContext, db }) {
  const reservationId = getReservationId(payload);
  const reservation = await getDocById(db, "reservation", reservationId);
  assertReservationStore({ payload, reservation });
  await assertStaffPermission({ db, wxContext, storeId: reservation.store_id });
  if (reservation.status !== RESERVATION_STATUS.IN_SERVICE) {
    throw businessError("INVALID_STATUS", "invalid close table status");
  }

  const nextTableStatus = payload.nextTableStatus || payload.next_table_status || TABLE_STATUS.FREE;
  if (![TABLE_STATUS.FREE, TABLE_STATUS.CLEANING].includes(nextTableStatus)) {
    throw businessError("INVALID_TABLE_STATUS", "invalid next table status");
  }
  await db.collection("billiard_table").doc(reservation.table_id).update({
    data: { status: nextTableStatus, updated_at: nowIso() }
  });
  await writeTableStatusLog({
    db,
    reservation,
    status: nextTableStatus,
    operatorOpenid: wxContext.OPENID,
    remark: "close table"
  });
  await writeReservationAudit({ db, reservation, wxContext, action: "closeTable", afterStatus: RESERVATION_STATUS.COMPLETED });

  return updateReservationStatus({
    db,
    reservationId,
    status: RESERVATION_STATUS.COMPLETED,
    extra: { closed_at: nowIso(), closed_by: wxContext.OPENID }
  });
}

async function releaseReservation({ payload, wxContext, db }) {
  const reservationId = getReservationId(payload);
  const reservation = await getDocById(db, "reservation", reservationId);
  assertReservationStore({ payload, reservation });
  await assertStaffPermission({ db, wxContext, storeId: reservation.store_id });
  if (![RESERVATION_STATUS.WAITING_ARRIVAL, RESERVATION_STATUS.WAITING_REVIEW].includes(reservation.status)) {
    throw businessError("INVALID_STATUS", "invalid release status");
  }

  await writeReservationAudit({ db, reservation, wxContext, action: "releaseReservation", afterStatus: RESERVATION_STATUS.RELEASED, remark: payload.reason });
  return updateReservationStatus({
    db,
    reservationId,
    status: RESERVATION_STATUS.RELEASED,
    extra: { released_at: nowIso(), released_by: wxContext.OPENID, release_reason: payload.reason || "timeout release" }
  });
}

async function getCampaignDetail({ payload, db }) {
  return getDocById(db, "campaign", payload.campaignId || payload.campaign_id);
}

async function getCampaigns({ payload, db }) {
  const storeId = getStoreId(payload);
  const result = await db.collection("campaign")
    .where({ store_id: storeId, status: "已发布" })
    .orderBy("start_time", "asc")
    .get();

  return { list: result.data || [] };
}

async function createCampaignRegistration({ payload, wxContext, db }) {
  assertAuthorizedProfile(payload.profile);
  const campaignId = payload.campaignId || payload.campaign_id;
  const campaign = await getDocById(db, "campaign", campaignId);

  if (campaign.quota && campaign.registered_count >= campaign.quota) {
    throw businessError("CAMPAIGN_FULL", "campaign full");
  }

  const status = campaign.need_review
    ? CAMPAIGN_REGISTRATION_STATUS.PENDING_REVIEW
    : CAMPAIGN_REGISTRATION_STATUS.SUCCESS;
  const created_at = nowIso();
  const result = await db.collection("campaign_registration").add({
    data: {
      store_id: campaign.store_id,
      campaign_id: campaignId,
      openid: wxContext.OPENID,
      nick_name: payload.profile.nickName,
      phone: payload.profile.phone,
      status,
      remark: payload.remark || "",
      created_at,
      updated_at: created_at
    }
  });

  if (campaign.quota) {
    await db.collection("campaign").doc(campaignId).update({
      data: { registered_count: db.command.inc ? db.command.inc(1) : (campaign.registered_count || 0) + 1, updated_at: created_at }
    });
  }

  return { registrationId: result._id, status };
}

async function liftNoShowBan({ payload, wxContext, db }) {
  const recordId = payload.noShowRecordId || payload.no_show_record_id;
  const reason = payload.reason || "";
  if (!reason) {
    throw businessError("REASON_REQUIRED", "lift reason required");
  }

  const record = await getDocById(db, "no_show_record", recordId);
  assertReservationStore({ payload, reservation: record });
  await assertStaffPermission({ db, wxContext, storeId: record.store_id, minRole: "manager" });

  const liftedAt = nowIso();
  await db.collection("no_show_record").doc(recordId).update({
    data: {
      status: "已解除",
      lifted_by: wxContext.OPENID,
      lifted_at: liftedAt,
      lift_reason: reason,
      updated_at: liftedAt
    }
  });
  await writeAuditLog({
    db,
    storeId: record.store_id,
    action: "liftNoShowBan",
    operatorOpenid: wxContext.OPENID,
    targetType: "no_show_record",
    targetId: recordId,
    beforeStatus: record.status,
    afterStatus: "已解除",
    remark: reason
  });

  return { noShowRecordId: recordId, status: "已解除" };
}

module.exports = {
  bootstrapMvp,
  createAssistantReservation,
  createCampaignRegistration,
  createReservation,
  getAssistants,
  getAvailableTables,
  getCampaignDetail,
  getCampaigns,
  getDebugContext,
  getMyReservations,
  getStaffWorkbench,
  getStoreOverview,
  confirmArrival,
  closeTable,
  liftNoShowBan,
  markNoShow,
  openTable,
  rejectArrival,
  releaseReservation,
  runMvpFlowSmokeTest,
  runMvpGuardSmokeTest,
  submitArrival,
  validateMvpBootstrap
};
