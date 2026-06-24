const test = require("node:test");
const assert = require("node:assert/strict");

const {
  authorizePhone,
  bootstrapMvp,
  closeTable,
  confirmArrival,
  confirmAssistantReservation,
  createCampaignRegistration,
  createReservation,
  getCampaignRegistrations,
  getCustomers,
  getNoShowRecords,
  getCurrentRole,
  getAdminDashboard,
  getAdminReservations,
  getAssets,
  getAuditLogs,
  getAvailableTables,
  getPageConfig,
  getMineCenter,
  getMyReservations,
  getReservationDetail,
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
  reviewCampaignRegistration,
  runMvpFlowSmokeTest,
  runMvpGuardSmokeTest,
  submitArrival,
  updateAssistantStatus,
  updateTableStatus,
  validateMvpBootstrap
} = require("../src/handlers");
const {
  ASSISTANT_RESERVATION_STATUS,
  ASSISTANT_STATUS,
  CAMPAIGN_REGISTRATION_STATUS,
  NO_SHOW_LOCK_DAYS,
  NO_SHOW_STATUS,
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

function createFakeDb(seed = {}, options = {}) {
  const collections = {
    store: {
      [STORE_ID]: {
        _id: STORE_ID,
        name: "Test Store",
        status: "active",
        booking_rule: {
          min_advance_minutes: 30,
          min_duration_minutes: 60,
          max_duration_minutes: 240
        }
      }
    },
    user: {
      [USER_OPENID]: {
        _id: USER_OPENID,
        openid: USER_OPENID,
        nickname: "Test User",
        phone: "13800000000",
        status: "active"
      }
    },
    price_rule: {},
    page_config: {},
    asset: {},
    member_account: {},
    coupon: {},
    order: {},
    campaign: {},
    campaign_registration: {},
    customer_profile: {},
    assistant_status_log: {},
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
  const missingCollections = new Set(options.missingCollections || []);

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function ensureCollection(name) {
    if (missingCollections.has(name)) {
      const error = new Error("database collection not exists");
      error.code = -502005;
      throw error;
    }
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
      table_no: "A01",
      table_type: "standard",
      table_type_name: "Standard Table",
      area_name: "Main Area",
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
      status: ASSISTANT_STATUS.IDLE
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

  const detail = await getReservationDetail({
    payload: { storeId: STORE_ID, reservationId: created.reservationId },
    wxContext: { OPENID: USER_OPENID },
    db
  });
  assert.equal(detail.table._id, TABLE_ID);
  assert.equal(detail.table.table_no, "A01");
  assert.equal(detail.table.table_type_name, "Standard Table");
  assert.equal(detail.tableCode, "A01");
  assert.equal(detail.table_code, "A01");
  assert.equal(detail.tableType, "Standard Table");
  assert.equal(detail.table_type_name, "Standard Table");

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

test("createReservation succeeds when customer_profile collection is missing", async () => {
  const db = createFakeDb({ billiard_table: seedTable() }, { missingCollections: ["customer_profile"] });
  const startTime = minutesFromNow(60);
  const endTime = minutesFromNow(120);

  const created = await createReservation({
    payload: {
      storeId: STORE_ID,
      tableId: TABLE_ID,
      startTime,
      endTime
    },
    wxContext: { OPENID: USER_OPENID },
    db
  });

  assert.equal(created.status, RESERVATION_STATUS.WAITING_ARRIVAL);
  assert.equal(db.data.reservation[created.reservationId].table_id, TABLE_ID);
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
  db.data.no_show_record.no_show_record_001.ban_end_at = daysFromNow(-1);

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
        status: NO_SHOW_STATUS.ACTIVE,
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

  assert.equal(lifted.status, NO_SHOW_STATUS.LIFTED);
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
  assert.equal(Object.keys(db.data.billiard_table).length, 40);
  assert.equal(db.data.billiard_table[`${STORE_ID}_table_C01`].table_type, "duya");
  assert.equal(db.data.billiard_table[`${STORE_ID}_table_C08`].table_type_name, "独牙");
  assert.equal(Object.keys(db.data.assistant).length, 1);
  assert.equal(Object.keys(db.data.campaign).length, 1);
  assert.equal(db.data.audit_log.audit_log_001.action, "bootstrapMvp");

  const duyaTables = await getAvailableTables({
    payload: { storeId: STORE_ID, table_type: "duya" },
    db
  });
  assert.equal(duyaTables.total, 8);
  assert.deepEqual(duyaTables.tables.map((table) => table.table_no), ["C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08"]);

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

test("manager config APIs upsert store tables prices assistants and campaigns with audit logs", async () => {
  const db = createFakeDb({ staff_user: seedStaff("manager") });

  const store = await manageStore({
    payload: { storeId: STORE_ID, payload: { name: "Updated Store", booking_rule: { min_advance_minutes: 45 } } },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  assert.equal(store.item.name, "Updated Store");

  const table = await manageTables({
    payload: { storeId: STORE_ID, tableId: "table_002", payload: { table_no: "A02", table_type: "standard" } },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  assert.equal(table.item.store_id, STORE_ID);
  assert.equal(db.data.billiard_table.table_002.status, TABLE_STATUS.FREE);

  const price = await managePriceRules({
    payload: { storeId: STORE_ID, priceRuleId: "price_001", payload: { target_type: "table", table_type: "standard", price_cent: 3800, unit: "hour" } },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  assert.equal(price.item.price_cent, 3800);

  const assistant = await manageAssistants({
    payload: { storeId: STORE_ID, assistantId: ASSISTANT_ID, payload: { name: "Coach A", service_price_cent: 8800, avatar_url: "cloud://demo/avatar.jpg", photo_url: "cloud://demo/photo.jpg", thumb_url: "cloud://demo/thumb.jpg" } },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  assert.equal(assistant.assistant.status, ASSISTANT_STATUS.IDLE);
  assert.equal(assistant.assistant.avatar_url, "cloud://demo/avatar.jpg");
  assert.equal(assistant.assistant.photo_url, "cloud://demo/photo.jpg");
  assert.equal(assistant.assistant.thumb_url, "cloud://demo/thumb.jpg");

  const campaign = await manageCampaigns({
    payload: { storeId: STORE_ID, campaignId: "campaign_001", action: "publish", payload: { title: "Open Match", quota_limited: true, quota_total: 2, quota_used: 0 } },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  assert.equal(campaign.campaign.status, "published");
  assert.equal(Object.keys(db.data.audit_log).length, 5);
});

test("manager web admin APIs manage page config assets dashboard reservations and audit logs", async () => {
  const db = createFakeDb({
    staff_user: seedStaff("manager"),
    billiard_table: seedTable(),
    reservation: {
      reservation_001: {
        _id: "reservation_001",
        store_id: STORE_ID,
        openid: USER_OPENID,
        user_id: USER_OPENID,
        table_id: TABLE_ID,
        start_time: minutesFromNow(90),
        end_time: minutesFromNow(150),
        status: RESERVATION_STATUS.WAITING_REVIEW
      }
    },
    customer_profile: {
      customer_001: { _id: "customer_001", store_id: STORE_ID, user_id: USER_OPENID, phone: "13800000000", nickname: "Customer" }
    }
  });

  const page = await managePageConfig({
    payload: {
      storeId: STORE_ID,
      pageKey: "home",
      action: "publish",
      payload: {
        theme: { primary_color: "#18d6a3" },
        modules: [{ id: "hero", type: "hero", enabled: true, sort_order: 1, title: "Test Hero", image_url: "/hero.jpg" }]
      }
    },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  assert.equal(page.config.status, "published");
  assert.equal(page.config.modules[0].title, "Test Hero");

  const publicConfig = await getPageConfig({ payload: { storeId: STORE_ID, pageKey: "home" }, db });
  assert.equal(publicConfig.config.modules[0].title, "Test Hero");

  const asset = await manageAssets({
    payload: { storeId: STORE_ID, assetId: "asset_001", payload: { name: "Hero", type: "hero", url: "/hero.jpg", file_id: "cloud://hero" } },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  assert.equal(asset.item.url, "/hero.jpg");

  const assets = await getAssets({ payload: { storeId: STORE_ID }, wxContext: { OPENID: STAFF_OPENID }, db });
  assert.equal(assets.total, 1);

  await manageAssets({
    payload: { storeId: STORE_ID, assetId: "asset_001", action: "delete", reason: "cleanup" },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  const visibleAssets = await getAssets({ payload: { storeId: STORE_ID }, wxContext: { OPENID: STAFF_OPENID }, db });
  assert.equal(visibleAssets.total, 0);
  const allAssets = await getAssets({ payload: { storeId: STORE_ID, includeDeleted: true }, wxContext: { OPENID: STAFF_OPENID }, db });
  assert.equal(allAssets.total, 1);
  assert.equal(allAssets.items[0].status, "deleted");

  const dashboard = await getAdminDashboard({ payload: { storeId: STORE_ID }, wxContext: { OPENID: STAFF_OPENID }, db });
  assert.equal(dashboard.metrics.waiting_review_count, 1);
  assert.equal(dashboard.metrics.customer_count, 1);

  const reservations = await getAdminReservations({ payload: { storeId: STORE_ID }, wxContext: { OPENID: STAFF_OPENID }, db });
  assert.equal(reservations.total, 1);
  assert.equal(reservations.items[0].tableCode, "A01");

  const logs = await getAuditLogs({ payload: { storeId: STORE_ID }, wxContext: { OPENID: STAFF_OPENID }, db });
  assert.equal(logs.total, 3);
});

test("mine center returns profile wallet coupons orders and user records", async () => {
  const db = createFakeDb({
    user: {
      [USER_OPENID]: {
        _id: USER_OPENID,
        openid: USER_OPENID,
        nickname: "Test User",
        phone: "13800000000",
        status: "active"
      }
    },
    customer_profile: {
      customer_001: {
        _id: "customer_001",
        store_id: STORE_ID,
        user_id: USER_OPENID,
        phone: "13800000000",
        nickname: "Test User",
        reservation_count: 3,
        no_show_count: 0
      }
    },
    member_account: {
      member_001: {
        _id: "member_001",
        store_id: STORE_ID,
        user_id: USER_OPENID,
        balance_cent: 12000,
        member_level_name: "储值会员",
        stored_value_enabled: true
      }
    },
    coupon: {
      coupon_001: {
        _id: "coupon_001",
        store_id: STORE_ID,
        user_id: USER_OPENID,
        title: "新人券",
        status: "available"
      }
    },
    order: {
      order_001: {
        _id: "order_001",
        store_id: STORE_ID,
        user_id: USER_OPENID,
        title: "桌台预约",
        status: "pending_arrival",
        created_at: minutesFromNow(-30)
      }
    },
    billiard_table: seedTable(),
    reservation: {
      reservation_001: {
        _id: "reservation_001",
        store_id: STORE_ID,
        openid: USER_OPENID,
        user_id: USER_OPENID,
        table_id: TABLE_ID,
        start_time: minutesFromNow(90),
        end_time: minutesFromNow(150),
        status: RESERVATION_STATUS.WAITING_ARRIVAL
      }
    }
  });

  const result = await getMineCenter({
    payload: { storeId: STORE_ID },
    wxContext: { OPENID: USER_OPENID },
    db
  });

  assert.equal(result.profile.nickName, "Test User");
  assert.equal(result.profile.phoneAuthorized, true);
  assert.equal(result.profile.memberLevel, "储值会员");
  assert.equal(result.wallet.balanceText, "¥120.00");
  assert.equal(result.wallet.paymentEnabled, false);
  assert.equal(result.wallet.rechargeEnabled, false);
  assert.equal(result.auth.phoneAuthorized, true);
  assert.equal(result.summary.reservationCount, 3);
  assert.equal(result.coupons.length, 1);
  assert.equal(result.orders.length, 1);
  assert.equal(result.reservations.length, 1);
  assert.equal(result.reservations[0].tableCode, "A01");
  assert.equal(result.reservations[0].table.table_type_name, "Standard Table");

  const myReservations = await getMyReservations({
    payload: { storeId: STORE_ID },
    wxContext: { OPENID: USER_OPENID },
    db
  });
  assert.equal(myReservations.items[0].tableCode, "A01");
});

test("mine center returns safe fallbacks for first-time users without payment", async () => {
  const db = createFakeDb({ user: {} });

  const result = await getMineCenter({
    payload: { storeId: STORE_ID },
    wxContext: { OPENID: "first_time_user" },
    db
  });

  assert.equal(result.profile.nickName, "微信用户");
  assert.equal(result.profile.phoneAuthorized, false);
  assert.equal(result.auth.loggedIn, true);
  assert.equal(result.auth.profileAuthorized, false);
  assert.equal(result.wallet.balanceCent, 0);
  assert.equal(result.wallet.balanceText, "¥0.00");
  assert.equal(result.wallet.storedValueEnabled, false);
  assert.equal(result.wallet.paymentEnabled, false);
  assert.equal(result.wallet.rechargeEnabled, false);
  assert.deepEqual(result.coupons, []);
  assert.deepEqual(result.orders, []);
  assert.deepEqual(result.reservations, []);
});

test("web admin write APIs require manager permission", async () => {
  const db = createFakeDb({ staff_user: seedStaff("staff") });

  await assert.rejects(
    () => managePageConfig({
      payload: { storeId: STORE_ID, pageKey: "home", payload: { modules: [] } },
      wxContext: { OPENID: STAFF_OPENID },
      db
    }),
    /staff permission required/
  );

  const writeCalls = [
    () => manageStore({ payload: { storeId: STORE_ID, payload: { name: "Blocked" } }, wxContext: { OPENID: STAFF_OPENID }, db }),
    () => manageTables({ payload: { storeId: STORE_ID, tableId: TABLE_ID, payload: { table_no: "A01" } }, wxContext: { OPENID: STAFF_OPENID }, db }),
    () => managePriceRules({ payload: { storeId: STORE_ID, priceRuleId: "price_001", payload: { price_cent: 3800 } }, wxContext: { OPENID: STAFF_OPENID }, db }),
    () => manageAssistants({ payload: { storeId: STORE_ID, assistantId: ASSISTANT_ID, payload: { name: "Blocked" } }, wxContext: { OPENID: STAFF_OPENID }, db }),
    () => manageCampaigns({ payload: { storeId: STORE_ID, campaignId: "campaign_001", payload: { title: "Blocked" } }, wxContext: { OPENID: STAFF_OPENID }, db }),
    () => manageAssets({ payload: { storeId: STORE_ID, assetId: "asset_001", payload: { name: "Blocked" } }, wxContext: { OPENID: STAFF_OPENID }, db })
  ];

  for (const call of writeCalls) {
    await assert.rejects(call, /staff permission required/);
  }
});

test("updateTableStatus enforces active reservation guard and writes status log", async () => {
  const db = createFakeDb({
    staff_user: seedStaff(),
    billiard_table: seedTable(),
    reservation: {
      active_001: {
        _id: "active_001",
        store_id: STORE_ID,
        openid: USER_OPENID,
        user_id: USER_OPENID,
        table_id: TABLE_ID,
        start_time: minutesFromNow(60),
        end_time: minutesFromNow(120),
        status: RESERVATION_STATUS.WAITING_ARRIVAL
      }
    }
  });

  await assert.rejects(
    () => updateTableStatus({
      payload: { storeId: STORE_ID, tableId: TABLE_ID, toStatus: TABLE_STATUS.DISABLED, reason: "maintenance" },
      wxContext: { OPENID: STAFF_OPENID },
      db
    }),
    (error) => error.code === "TABLE_HAS_ACTIVE_RESERVATION"
  );

  db.data.reservation.active_001.status = RESERVATION_STATUS.RELEASED;
  const result = await updateTableStatus({
    payload: { storeId: STORE_ID, tableId: TABLE_ID, toStatus: TABLE_STATUS.CLEANING, reason: "cleaning" },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  assert.equal(result.table.status, TABLE_STATUS.CLEANING);
  assert.equal(db.data.table_status_log.table_status_log_001.from_status, TABLE_STATUS.FREE);
  assert.equal(db.data.table_status_log.table_status_log_001.to_status, TABLE_STATUS.CLEANING);
});

test("campaign registration requires authorized profile prevents over quota and masks staff phone list", async () => {
  const db = createFakeDb({
    staff_user: {
      ...seedStaff("staff"),
      ...seedStaff("manager", "manager_openid")
    },
    campaign: {
      campaign_001: {
        _id: "campaign_001",
        store_id: STORE_ID,
        title: "Trial",
        status: "published",
        quota_limited: true,
        quota_total: 2,
        quota_used: 0,
        need_review: true
      }
    }
  });

  await assert.rejects(
    () => createCampaignRegistration({
      payload: { storeId: STORE_ID, campaignId: "campaign_001", profile: { nickName: "No Phone" } },
      wxContext: { OPENID: "guest_1" },
      db
    }),
    (error) => error.code === "PHONE_REQUIRED"
  );

  const first = await createCampaignRegistration({
    payload: { storeId: STORE_ID, campaignId: "campaign_001", participantCount: 2, profile: { nickName: "Guest", phone: "13900000000" } },
    wxContext: { OPENID: "guest_1" },
    db
  });
  assert.equal(first.status, CAMPAIGN_REGISTRATION_STATUS.PENDING_REVIEW);
  assert.equal(db.data.campaign.campaign_001.quota_used, 2);

  await assert.rejects(
    () => createCampaignRegistration({
      payload: { storeId: STORE_ID, campaignId: "campaign_001", profile: { nickName: "Guest2", phone: "13700000000" } },
      wxContext: { OPENID: "guest_2" },
      db
    }),
    (error) => error.code === "CAMPAIGN_FULL"
  );

  const staffList = await getCampaignRegistrations({
    payload: { storeId: STORE_ID, campaignId: "campaign_001" },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  assert.equal(staffList.items[0].phone, "139****0000");

  const managerList = await getCampaignRegistrations({
    payload: { storeId: STORE_ID, campaignId: "campaign_001" },
    wxContext: { OPENID: "manager_openid" },
    db
  });
  assert.equal(managerList.items[0].phone, "13900000000");
});

test("assistant reservation confirmation rechecks conflicts and assistant status changes write logs", async () => {
  const db = createFakeDb({
    staff_user: seedStaff(),
    assistant: seedAssistant(),
    assistant_reservation: {
      ar_001: {
        _id: "ar_001",
        store_id: STORE_ID,
        openid: USER_OPENID,
        user_id: USER_OPENID,
        assistant_id: ASSISTANT_ID,
        start_time: minutesFromNow(60),
        end_time: minutesFromNow(120),
        status: ASSISTANT_RESERVATION_STATUS.PENDING_CONFIRM
      },
      ar_002: {
        _id: "ar_002",
        store_id: STORE_ID,
        openid: "other",
        user_id: "other",
        assistant_id: ASSISTANT_ID,
        start_time: minutesFromNow(90),
        end_time: minutesFromNow(150),
        status: ASSISTANT_RESERVATION_STATUS.CONFIRMED
      }
    }
  });

  await assert.rejects(
    () => confirmAssistantReservation({
      payload: { storeId: STORE_ID, assistantReservationId: "ar_001" },
      wxContext: { OPENID: STAFF_OPENID },
      db
    }),
    (error) => error.code === "ASSISTANT_TIME_CONFLICT"
  );

  db.data.assistant_reservation.ar_002.status = ASSISTANT_RESERVATION_STATUS.CANCELED;
  const confirmed = await confirmAssistantReservation({
    payload: { storeId: STORE_ID, assistantReservationId: "ar_001" },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  assert.equal(confirmed.status, ASSISTANT_RESERVATION_STATUS.CONFIRMED);

  const status = await updateAssistantStatus({
    payload: { storeId: STORE_ID, assistantId: ASSISTANT_ID, toStatus: ASSISTANT_STATUS.RESTING, reason: "break" },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  assert.equal(status.assistant.status, ASSISTANT_STATUS.RESTING);
  assert.equal(db.data.assistant_status_log.assistant_status_log_001.to_status, ASSISTANT_STATUS.RESTING);
});

test("customer list masks phone for staff and exposes full phone for manager", async () => {
  const db = createFakeDb({
    staff_user: {
      ...seedStaff("staff"),
      ...seedStaff("manager", "manager_openid")
    },
    customer_profile: {
      customer_001: {
        _id: "customer_001",
        store_id: STORE_ID,
        user_id: USER_OPENID,
        nickname: "Customer",
        phone: "13812345678",
        reservation_count: 3,
        completed_count: 2,
        no_show_count: 1,
        campaign_count: 1
      }
    }
  });

  const staffResult = await getCustomers({
    payload: { storeId: STORE_ID, keyword: "Customer" },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  assert.equal(staffResult.items[0].phone, "138****5678");
  assert.equal(staffResult.items[0].reservation_count, 3);

  const managerResult = await getCustomers({
    payload: { storeId: STORE_ID },
    wxContext: { OPENID: "manager_openid" },
    db
  });
  assert.equal(managerResult.items[0].phone, "13812345678");
});

test("no-show restriction list returns active records by store", async () => {
  const db = createFakeDb({
    staff_user: seedStaff(),
    no_show_record: {
      ns_001: {
        _id: "ns_001",
        store_id: STORE_ID,
        openid: USER_OPENID,
        user_id: USER_OPENID,
        reservation_id: "reservation_001",
        status: NO_SHOW_STATUS.ACTIVE,
        ban_end_at: daysFromNow(3)
      },
      ns_other: {
        _id: "ns_other",
        store_id: "other_store",
        openid: USER_OPENID,
        status: NO_SHOW_STATUS.ACTIVE,
        ban_end_at: daysFromNow(3)
      }
    }
  });

  const result = await getNoShowRecords({
    payload: { storeId: STORE_ID },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  assert.equal(result.total, 1);
  assert.equal(result.items[0]._id, "ns_001");
});

test("login phone authorization and role actions are locally testable", async () => {
  const db = createFakeDb({ user: {}, staff_user: seedStaff("manager", USER_OPENID) });

  const login = await loginByWechat({
    payload: { storeId: STORE_ID, nickName: "Local User" },
    wxContext: { OPENID: USER_OPENID },
    db
  });
  assert.equal(login.user.openid, USER_OPENID);
  assert.equal(login.user.nickname, "Local User");
  assert.match(login.token, /^local-session-/);

  const phone = await authorizePhone({
    payload: { storeId: STORE_ID, phone: "13912345678" },
    wxContext: { OPENID: USER_OPENID },
    db
  });
  assert.equal(phone.phone, "13912345678");
  assert.equal(db.data.user[`user_${USER_OPENID}`].phone, "13912345678");
  assert.equal(db.data.customer_profile[`customer_${STORE_ID}_user_${USER_OPENID}`].phone, "13912345678");

  const role = await getCurrentRole({
    payload: { storeId: STORE_ID },
    wxContext: { OPENID: USER_OPENID },
    db
  });
  assert.equal(role.role, "manager");
  assert.equal(role.staff_user._id, `staff_${USER_OPENID}`);
});

test("manager config APIs validate fields and manageTables disable uses active reservation guard", async () => {
  const db = createFakeDb({
    staff_user: seedStaff("manager"),
    billiard_table: seedTable(),
    reservation: {
      active_001: {
        _id: "active_001",
        store_id: STORE_ID,
        openid: USER_OPENID,
        user_id: USER_OPENID,
        table_id: TABLE_ID,
        start_time: minutesFromNow(60),
        end_time: minutesFromNow(120),
        status: RESERVATION_STATUS.WAITING_ARRIVAL
      }
    }
  });

  await assert.rejects(
    () => managePriceRules({
      payload: { storeId: STORE_ID, priceRuleId: "bad_price", payload: { target_type: "table", table_type: "standard", price_cent: 38.5, unit: "hour" } },
      wxContext: { OPENID: STAFF_OPENID },
      db
    }),
    (error) => error.code === "INVALID_PARAMS"
  );

  await assert.rejects(
    () => manageAssistants({
      payload: { storeId: STORE_ID, assistantId: ASSISTANT_ID, payload: { name: "Coach", status: "busy" } },
      wxContext: { OPENID: STAFF_OPENID },
      db
    }),
    (error) => error.code === "INVALID_PARAMS"
  );

  await assert.rejects(
    () => manageCampaigns({
      payload: { storeId: STORE_ID, campaignId: "bad_campaign", payload: { title: "Bad", quota_total: -1 } },
      wxContext: { OPENID: STAFF_OPENID },
      db
    }),
    (error) => error.code === "INVALID_PARAMS"
  );

  await assert.rejects(
    () => manageTables({
      payload: { storeId: STORE_ID, tableId: TABLE_ID, action: "disable", reason: "repair" },
      wxContext: { OPENID: STAFF_OPENID },
      db
    }),
    (error) => error.code === "TABLE_HAS_ACTIVE_RESERVATION"
  );

  db.data.reservation.active_001.status = RESERVATION_STATUS.RELEASED;
  const disabled = await manageTables({
    payload: { storeId: STORE_ID, tableId: TABLE_ID, action: "disable", reason: "repair" },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  assert.equal(disabled.item.status, TABLE_STATUS.DISABLED);
  assert.equal(disabled.item.enabled, false);
});

test("campaign registration review writes audit log and rejected registration releases quota", async () => {
  const db = createFakeDb({
    staff_user: seedStaff(),
    campaign: {
      campaign_001: {
        _id: "campaign_001",
        store_id: STORE_ID,
        title: "Review Campaign",
        status: "published",
        quota_limited: true,
        quota_total: 2,
        quota_used: 0,
        need_review: true
      }
    }
  });

  const registration = await createCampaignRegistration({
    payload: { storeId: STORE_ID, campaignId: "campaign_001", profile: { nickName: "Guest", phone: "13900000000" } },
    wxContext: { OPENID: "guest_review" },
    db
  });
  assert.equal(registration.status, CAMPAIGN_REGISTRATION_STATUS.PENDING_REVIEW);
  assert.equal(db.data.campaign.campaign_001.quota_used, 1);

  await assert.rejects(
    () => reviewCampaignRegistration({
      payload: { storeId: STORE_ID, registrationId: registration.registrationId, action: "reject" },
      wxContext: { OPENID: STAFF_OPENID },
      db
    }),
    (error) => error.code === "REASON_REQUIRED"
  );

  const rejected = await reviewCampaignRegistration({
    payload: { storeId: STORE_ID, registrationId: registration.registrationId, action: "reject", reason: "资料不完整" },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  assert.equal(rejected.registration.status, CAMPAIGN_REGISTRATION_STATUS.REJECTED);
  assert.equal(db.data.campaign.campaign_001.quota_used, 0);
  assert.equal(db.data.audit_log.audit_log_001.action, "reviewCampaignRegistration:reject");
});

test("campaign registration uses active campaign lock and backend lists paginate", async () => {
  const campaignLockId = Buffer.from(`campaign:${STORE_ID}:campaign_001:na:na`).toString("base64").replace(/[+/=]/g, "_");
  const db = createFakeDb({
    staff_user: seedStaff("manager"),
    campaign: {
      campaign_001: {
        _id: "campaign_001",
        store_id: STORE_ID,
        title: "Locked Campaign",
        status: "published",
        quota_limited: true,
        quota_total: 5,
        quota_used: 0,
        need_review: false
      }
    },
    reservation_lock: {
      [campaignLockId]: {
        _id: campaignLockId,
        store_id: STORE_ID,
        resource_type: "campaign",
        resource_id: "campaign_001",
        status: "active",
        expires_at: minutesFromNow(1)
      }
    },
    customer_profile: {
      c1: { _id: "c1", store_id: STORE_ID, user_id: "u1", nickname: "A", phone: "13800000001" },
      c2: { _id: "c2", store_id: STORE_ID, user_id: "u2", nickname: "B", phone: "13800000002" },
      c3: { _id: "c3", store_id: STORE_ID, user_id: "u3", nickname: "C", phone: "13800000003" }
    },
    audit_log: {
      a1: { _id: "a1", store_id: STORE_ID, action: "one" },
      a2: { _id: "a2", store_id: STORE_ID, action: "two" },
      a3: { _id: "a3", store_id: STORE_ID, action: "three" }
    },
    reservation: {
      r1: { _id: "r1", store_id: STORE_ID, table_id: TABLE_ID, openid: USER_OPENID, status: RESERVATION_STATUS.WAITING_ARRIVAL },
      r2: { _id: "r2", store_id: STORE_ID, table_id: TABLE_ID, openid: USER_OPENID, status: RESERVATION_STATUS.WAITING_REVIEW },
      r3: { _id: "r3", store_id: STORE_ID, table_id: TABLE_ID, openid: USER_OPENID, status: RESERVATION_STATUS.ARRIVED }
    }
  });

  await assert.rejects(
    () => createCampaignRegistration({
      payload: { storeId: STORE_ID, campaignId: "campaign_001", profile: { nickName: "Guest", phone: "13900000000" } },
      wxContext: { OPENID: "guest_locked" },
      db
    }),
    (error) => error.code === "LOCK_BUSY"
  );

  const customers = await getCustomers({
    payload: { storeId: STORE_ID, page: 2, page_size: 2 },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  assert.equal(customers.total, 3);
  assert.equal(customers.items.length, 1);
  assert.equal(customers.page, 2);

  const audits = await getAuditLogs({
    payload: { storeId: STORE_ID, page: 1, page_size: 2 },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  assert.equal(audits.total, 3);
  assert.equal(audits.items.length, 2);

  const reservations = await getAdminReservations({
    payload: { storeId: STORE_ID, page: 1, page_size: 2 },
    wxContext: { OPENID: STAFF_OPENID },
    db
  });
  assert.equal(reservations.total, 3);
  assert.equal(reservations.items.length, 2);
});
