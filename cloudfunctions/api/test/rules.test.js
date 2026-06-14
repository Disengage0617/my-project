const test = require("node:test");
const assert = require("node:assert/strict");
const { assertReservationTime } = require("../src/rules");

function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

test("rejects reservations inside the 30 minute lead window", () => {
  assert.throws(
    () => assertReservationTime(minutesFromNow(10), minutesFromNow(70)),
    (error) => error.code === "RESERVATION_TOO_EARLY"
  );
});

test("accepts reservations at or beyond the 30 minute lead window", () => {
  assert.doesNotThrow(() => assertReservationTime(minutesFromNow(31), minutesFromNow(91)));
});

test("rejects invalid time ranges", () => {
  assert.throws(
    () => assertReservationTime(minutesFromNow(60), minutesFromNow(30)),
    (error) => error.code === "INVALID_TIME_RANGE"
  );
});

