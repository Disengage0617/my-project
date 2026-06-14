const test = require("node:test");
const assert = require("node:assert/strict");

const {
  bootstrapMvp,
  closeTable,
  confirmArrival,
  createReservation,
  liftNoShowBan,
  markNoShow,
  openTable,
  runMvpFlowSmokeTest,
  runMvpGuardSmokeTest,
  submitArrival
  ,
  validateMvpBootstrap
} = require("../src/handlers");
const {
  ASSISTANT_RESERVATION_STATUS,
  NO_SHOW_LOCK_DAYS,
  RESERVATION_STATUS,
  TABLE_STATUS
} = require("../src/constants");

const STORE_ID = "store_test_001";
const USER_OPENID = "user_openid";
const STAFF_OPENID = "staff_openid";
const TABLE_ID = "table_001";
const ASSISTANT_ID = "assistant_001";

function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function createFakeDb(seed = {}) {
  const collections = {
    reservation: {},
    assistant_reservation: {},
    assistant: {},
    audit_log: {},
    no_show_record: {},
    billiard_table: {},
    reservation_lock: {},
    staff_user: {},
    table_status_log: {},
    ...seed
  };
  const counters = {};

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function ensureCollection(name) {
    if (!collections[name]) collections[name] = {};
    return collections[name];
  }

  function nextId(name) {
    counters[name] = (counters[name] || 0) + 1;
    return `${name}_${String(counters[name]).padStart(3, "0")}`;
  }

  function matchesWhere(item, query) {
    return Object.entries(query).every(([field, expected]) => {
      const actual = item[field];
      if (expected && expected.__op === "in") return expected.values.includes(actual);
      if (expected && expected.__op === "lt") return actual < expected.value;
      if (expected && expected.__op === "gt") return actual > expected.value;
      if (expected && expected.__op === "gte") return actual >= expected.value;
      if (expected && expected.__op === "lte") return actual <= expected.value;
      return actual === expected;
    });
  }

  function collectionApi(name) {
    return {
      doc(id) {
        return {
          async get() {
            return { data: clone(ensureCollection(name)[id] || null) };
          },
          async update({ data }) {
            const collection = ensureCollection(name);
            collection[id] = { ...(collection[id] || { _id: id }), ...clone(data) };
            return { stats: { updated: 1 } };
          },
          async set({ data }) {
            const collection = ensureCollection(name);
            collection[id] = { _id: id, ...clone(data) };
            return { _id: id };
          }
        };
      },
      async add({ data }) {
        const id = nextId(name);
        ensureCollection(name)[id] = { _id: id, ...clone(data) };
        return { _id: id };
      },
      where(query) {
        let max = Infinity;
        return {
          limit(value) {
            max = value;
            return this;
          },
          orderBy() {
            return this;
          },
          async get() {
            const data = Object.values(ensureCollection(name))
              .filter((item) => matchesWhere(item, query))
              .slice(0, max)
              .map(clone);
            return { data };
          }
        };
      },
      orderBy() {
        return this;
      },
      limit() {
        return this;
      },
      async get() {
        return { data: Object.values(ensureCollection(name)).map(clone) };
      }
    };
  }

  return {
    data: collections,
    command: {
      in(values) {
        return { __op: "in", values };
      },
      lt(value) {
        return { __op: "lt", value };
      },
      gt(value) {
        return { __op: "gt", value };
      },
      gte(value) {
        return { __op: "gte", value };
      },
      lte(value) {
        return { __op: "lte", value };
      },
      inc(value) {
        return { __op: "inc", value };
      }
    },
    collection: collectionApi
  };
}

function seedTable() {
  return {
    [TABLE_ID]: {
      _id: TABLE_ID,
      store_id: STORE_ID,
      code: "A01",
      enabled: true,
      status: TABLE_STATUS.FREE
    }
  };
}

function seedAssistant() {
  return {
    [ASSISTANT_ID]: {
      _id: ASSISTANT_ID,
      store_id: STORE_ID,
      name: "Coach",
      enabled: true,
      status: "空闲"
    }
  };
}

function seedStaff(role = "staff", openid = STAFF_OPENID, storeId = STORE_ID) {
  return {
    [`staff_${openid}`]: {
      _id: `staff_${openid}`,
      store_id: storeId,
      openid,
      name: "Staff",
      role,
      enabled: true
    }
  };
}

test("runs reservation arrival and table lifecycle handlers end to end", async () => {
  const db = createFakeDb({ billiard_table: seedTable(), assistant: seedAssistant(), staff_user: seedStaff() });
  const startTime = minutesFromNow(60);
  const endTime = minutesFromNow(120);

  const created = await createReservation({
    payload: {
      storeId: STORE_ID,
      tableId: TABLE_ID,
      assistantId: ASSISTANT_ID,
      startTime,
      endTime,
      peopleCount: 2,
      remark: "window seat"
    },
    wxContext: { OPENID: USER_OPENID },
    db
  });

  assert.equal(created.status, RESERVATION_STATUS.WAITING_ARRIVAL);
  assert.equal(db.data.reservation[created.reservationId].table_id, TABLE_ID);
  assert.equal(db.data.assistant_reservation.assistant_reservation_001.status, ASSISTANT_RESERVATION_STATUS.PENDING_CONFIRM);

  const submitted = await submitArrival({
    payload: { reservationId: created.reservationId },
    wxContext: { OPENID: USER_OPENID },
    db
  });
  assert.equal(submitted.status, RESERVATION_STATUS.WAITING_REVIEW);

  const confirmed = await confirmArrival({
    payload: { reservationId: created.reservationId },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  assert.equal(confirmed.status, RESERVATION_STATUS.ARRIVED);

  const opened = await openTable({
    payload: { reservationId: created.reservationId },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  assert.equal(opened.status, RESERVATION_STATUS.IN_SERVICE);
  assert.equal(db.data.billiard_table[TABLE_ID].status, TABLE_STATUS.USING);

  const closed = await closeTable({
    payload: { reservationId: created.reservationId },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  assert.equal(closed.status, RESERVATION_STATUS.COMPLETED);
  assert.equal(db.data.billiard_table[TABLE_ID].status, TABLE_STATUS.FREE);
  assert.equal(Object.keys(db.data.table_status_log).length, 2);
  assert.equal(Object.keys(db.data.audit_log).length, 3);
});

test("rejects overlapping reservations for the same table", async () => {
  const startTime = minutesFromNow(60);
  const endTime = minutesFromNow(120);
  const db = createFakeDb({
    staff_user: seedStaff(),
    billiard_table: seedTable(),
    reservation: {
      existing_reservation: {
        _id: "existing_reservation",
        store_id: STORE_ID,
        openid: "other_user",
        table_id: TABLE_ID,
        start_time: minutesFromNow(90),
        end_time: minutesFromNow(150),
        status: RESERVATION_STATUS.WAITING_ARRIVAL
      }
    }
  });

  await assert.rejects(
    () => createReservation({
      payload: {
        storeId: STORE_ID,
        tableId: TABLE_ID,
        startTime,
        endTime
      },
      wxContext: { OPENID: USER_OPENID },
      db
    }),
    (error) => error.code === "TABLE_TIME_CONFLICT"
  );
});

test("markNoShow blocks the user from creating another reservation for 3 days", async () => {
  const db = createFakeDb({
    staff_user: seedStaff(),
    billiard_table: seedTable(),
    reservation: {
      reservation_to_mark: {
        _id: "reservation_to_mark",
        store_id: STORE_ID,
        openid: USER_OPENID,
        table_id: TABLE_ID,
        start_time: minutesFromNow(60),
        end_time: minutesFromNow(120),
        status: RESERVATION_STATUS.WAITING_ARRIVAL
      }
    }
  });

  const result = await markNoShow({
    payload: { reservationId: "reservation_to_mark", reason: "late" },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });

  assert.equal(result.status, RESERVATION_STATUS.NO_SHOW);
  const noShowRecord = db.data.no_show_record.no_show_record_001;
  assert.equal(noShowRecord.openid, USER_OPENID);
  assert.ok(new Date(noShowRecord.lock_until).getTime() > Date.now() + (NO_SHOW_LOCK_DAYS - 1) * 24 * 60 * 60 * 1000);

  await assert.rejects(
    () => createReservation({
      payload: {
        storeId: STORE_ID,
        tableId: TABLE_ID,
        startTime: minutesFromNow(180),
        endTime: minutesFromNow(240)
      },
      wxContext: { OPENID: USER_OPENID },
      db
    }),
    (error) => error.code === "NO_SHOW_LOCKED"
  );
});

test("allows reservation after an expired no-show lock", async () => {
  const db = createFakeDb({
    staff_user: seedStaff(),
    billiard_table: seedTable(),
    reservation: {
      expired_lock_source: {
        _id: "expired_lock_source",
        store_id: STORE_ID,
        openid: USER_OPENID,
        table_id: TABLE_ID,
        start_time: minutesFromNow(60),
        end_time: minutesFromNow(120),
        status: RESERVATION_STATUS.WAITING_ARRIVAL
      }
    }
  });

  await markNoShow({
    payload: { reservationId: "expired_lock_source" },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  db.data.no_show_record.no_show_record_001.lock_until = daysFromNow(-1);

  const result = await createReservation({
    payload: {
      storeId: STORE_ID,
      tableId: TABLE_ID,
      startTime: minutesFromNow(180),
      endTime: minutesFromNow(240)
    },
    wxContext: { OPENID: USER_OPENID },
    db
  });

  assert.equal(result.status, RESERVATION_STATUS.WAITING_ARRIVAL);
});

test("rejects staff-only actions for regular users", async () => {
  const db = createFakeDb({
    billiard_table: seedTable(),
    reservation: {
      waiting_review: {
        _id: "waiting_review",
        store_id: STORE_ID,
        openid: USER_OPENID,
        table_id: TABLE_ID,
        start_time: minutesFromNow(60),
        end_time: minutesFromNow(120),
        status: RESERVATION_STATUS.WAITING_REVIEW
      }
    }
  });

  await assert.rejects(
    () => confirmArrival({
      payload: { reservationId: "waiting_review", storeId: STORE_ID },
      wxContext: { OPENID: USER_OPENID },
      db
    }),
    (error) => error.code === "FORBIDDEN"
  );
});

test("rejects cross-store staff operations", async () => {
  const db = createFakeDb({
    staff_user: seedStaff("staff", STAFF_OPENID, "other_store"),
    billiard_table: seedTable(),
    reservation: {
      waiting_review: {
        _id: "waiting_review",
        store_id: STORE_ID,
        openid: USER_OPENID,
        table_id: TABLE_ID,
        start_time: minutesFromNow(60),
        end_time: minutesFromNow(120),
        status: RESERVATION_STATUS.WAITING_REVIEW
      }
    }
  });

  await assert.rejects(
    () => confirmArrival({
      payload: { reservationId: "waiting_review", storeId: STORE_ID },
      wxContext: { OPENID: STAFF_OPENID },
      db
    }),
    (error) => error.code === "FORBIDDEN"
  );
});

test("rejects disabled or repairing table resources", async () => {
  const db = createFakeDb({
    billiard_table: {
      [TABLE_ID]: {
        ...seedTable()[TABLE_ID],
        status: TABLE_STATUS.REPAIRING
      }
    }
  });

  await assert.rejects(
    () => createReservation({
      payload: {
        storeId: STORE_ID,
        tableId: TABLE_ID,
        startTime: minutesFromNow(60),
        endTime: minutesFromNow(120)
      },
      wxContext: { OPENID: USER_OPENID },
      db
    }),
    (error) => error.code === "RESOURCE_UNAVAILABLE"
  );
});

test("rejects reservation creation when the short lock is active", async () => {
  const db = createFakeDb({ billiard_table: seedTable() });

  const first = await createReservation({
    payload: {
      storeId: STORE_ID,
      tableId: TABLE_ID,
      startTime: minutesFromNow(60),
      endTime: minutesFromNow(120)
    },
    wxContext: { OPENID: USER_OPENID },
    db
  });
  const lockId = Object.keys(db.data.reservation_lock)[0];
  db.data.reservation_lock[lockId].status = "active";
  db.data.reservation_lock[lockId].expires_at = minutesFromNow(1);

  assert.equal(first.status, RESERVATION_STATUS.WAITING_ARRIVAL);
  await assert.rejects(
    () => createReservation({
      payload: {
        storeId: STORE_ID,
        tableId: TABLE_ID,
        startTime: db.data.reservation[first.reservationId].start_time,
        endTime: db.data.reservation[first.reservationId].end_time
      },
      wxContext: { OPENID: "second_user" },
      db
    }),
    (error) => error.code === "LOCK_BUSY"
  );
});

test("manager can lift a no-show ban with audit log", async () => {
  const managerOpenid = "manager_openid";
  const db = createFakeDb({
    staff_user: seedStaff("manager", managerOpenid),
    no_show_record: {
      no_show_active: {
        _id: "no_show_active",
        store_id: STORE_ID,
        openid: USER_OPENID,
        reservation_id: "reservation_001",
        status: "限制中",
        lock_until: daysFromNow(3),
        created_at: new Date().toISOString()
      }
    }
  });

  await assert.rejects(
    () => liftNoShowBan({
      payload: { noShowRecordId: "no_show_active", storeId: STORE_ID },
      wxContext: { OPENID: managerOpenid },
      db
    }),
    (error) => error.code === "REASON_REQUIRED"
  );

  const lifted = await liftNoShowBan({
    payload: { noShowRecordId: "no_show_active", storeId: STORE_ID, reason: "called store" },
    wxContext: { OPENID: managerOpenid },
    db
  });

  assert.equal(lifted.status, "已解除");
  assert.equal(db.data.no_show_record.no_show_active.lifted_by, managerOpenid);
  assert.equal(Object.keys(db.data.audit_log).length, 1);
  assert.equal(db.data.audit_log.audit_log_001.action, "liftNoShowBan");
});

test("bootstraps current openid as manager with MVP seed data", async () => {
  const db = createFakeDb();

  await assert.rejects(
    () => bootstrapMvp({
      payload: { storeId: STORE_ID, openid: "other_user" },
      wxContext: { OPENID: USER_OPENID },
      db
    }),
    (error) => error.code === "FORBIDDEN"
  );

  const result = await bootstrapMvp({
    payload: { storeId: STORE_ID, openid: USER_OPENID },
    wxContext: { OPENID: USER_OPENID },
    db
  });

  assert.equal(result.role, "manager");
  assert.equal(db.data.staff_user[`staff_${USER_OPENID}`].role, "manager");
  assert.equal(Object.keys(db.data.billiard_table).length, 3);
  assert.equal(Object.keys(db.data.assistant).length, 1);
  assert.equal(Object.keys(db.data.campaign).length, 1);
  assert.equal(db.data.audit_log.audit_log_001.action, "bootstrapMvp");

  const validation = await validateMvpBootstrap({
    payload: { storeId: STORE_ID },
    wxContext: { OPENID: USER_OPENID },
    db
  });
  assert.equal(validation.ok, true);
  assert.equal(validation.passedCount, validation.totalCount);
});

test("runs MVP reservation smoke flow end to end for manager", async () => {
  const db = createFakeDb();

  await bootstrapMvp({
    payload: { storeId: STORE_ID, openid: USER_OPENID },
    wxContext: { OPENID: USER_OPENID },
    db
  });

  const result = await runMvpFlowSmokeTest({
    payload: { storeId: STORE_ID },
    wxContext: { OPENID: USER_OPENID },
    db
  });

  assert.equal(result.ok, true);
  assert.equal(result.passedCount, result.totalCount);
  assert.equal(db.data.reservation[result.reservationId].status, RESERVATION_STATUS.COMPLETED);
  assert.equal(db.data.billiard_table[result.tableId].status, TABLE_STATUS.FREE);
  assert.equal(Object.keys(db.data.table_status_log).length, 2);
});

test("runs MVP guard smoke flow for conflict lead time and no-show lift", async () => {
  const db = createFakeDb();

  await bootstrapMvp({
    payload: { storeId: STORE_ID, openid: USER_OPENID },
    wxContext: { OPENID: USER_OPENID },
    db
  });

  const result = await runMvpGuardSmokeTest({
    payload: { storeId: STORE_ID },
    wxContext: { OPENID: USER_OPENID },
    db
  });

  assert.equal(result.ok, true);
  assert.equal(result.passedCount, result.totalCount);
  assert.equal(db.data.reservation[result.noShowReservationId].status, RESERVATION_STATUS.NO_SHOW);
  const noShowRecord = Object.values(db.data.no_show_record)[0];
  assert.equal(noShowRecord.lift_reason, "MVP guard smoke lift");
});
