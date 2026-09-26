/**
 * Tests for `src/lib/churchAccess.ts`.
 *
 * Run with `npm run test:church-access`. Needs no emulator: the module is pure.
 *
 * The rules and the server both lock a church on the same comparison, so the
 * cases here pin the edges that matter: the exact instant of the lock, the
 * midnight the lock is rounded to, and the value shapes a Timestamp arrives in.
 */

import { strict as assert } from "node:assert";
import {
  PAYMENT_GRACE_DAYS,
  accessUntilForBillingDate,
  endOfDaySast,
  getChurchAccess,
  laterOf,
  toDate,
} from "../src/lib/churchAccess";

let pass = 0;
let fail = 0;

function test(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${label}`);
    pass++;
  } catch (e) {
    console.log(`  FAIL  ${label}\n        ${(e as Error).message.split("\n")[0]}`);
    fail++;
  }
}

const now = new Date("2026-09-15T08:00:00.000Z"); // 10:00 SAST

console.log("\nchurchAccess\n");

test("no accessUntil is unmetered", () => {
  assert.deepEqual(getChurchAccess({}, now), { state: "unmetered", accessUntil: null, daysLeft: null });
});

test("no church document is unmetered, as in the rules", () => {
  assert.equal(getChurchAccess(null, now).state, "unmetered");
});

test("a future accessUntil is open with whole days left", () => {
  const access = getChurchAccess({ accessUntil: new Date("2026-09-18T09:00:00.000Z") }, now);
  assert.equal(access.state, "open");
  assert.equal(access.daysLeft, 3);
});

test("the last hours of access count as 0 days left, still open", () => {
  const access = getChurchAccess({ accessUntil: new Date("2026-09-15T21:59:59.999Z") }, now);
  assert.equal(access.state, "open");
  assert.equal(access.daysLeft, 0);
});

// The rules allow writes while `accessUntil > request.time`, so the instant
// itself is already locked.
test("accessUntil exactly now is locked", () => {
  assert.equal(getChurchAccess({ accessUntil: now }, now).state, "locked");
});

test("a past accessUntil is locked", () => {
  assert.equal(getChurchAccess({ accessUntil: new Date("2026-09-01T00:00:00.000Z") }, now).state, "locked");
});

test("reads a Timestamp-like value with toDate()", () => {
  const ts = { toDate: () => new Date("2026-10-01T00:00:00.000Z") };
  assert.equal(getChurchAccess({ accessUntil: ts }, now).state, "open");
});

test("reads a serialised Timestamp with seconds or _seconds", () => {
  assert.equal(toDate({ seconds: 1_800_000_000 })?.getTime(), 1_800_000_000_000);
  assert.equal(toDate({ _seconds: 1_800_000_000 })?.getTime(), 1_800_000_000_000);
});

test("an unparseable string is no date, not Invalid Date", () => {
  assert.equal(toDate("not a date"), null);
});

test("endOfDaySast is 23:59:59.999 in Johannesburg", () => {
  assert.equal(endOfDaySast(now).toISOString(), "2026-09-15T21:59:59.999Z");
});

// 23:30 UTC is already the next day in South Africa.
test("endOfDaySast uses the South African date, not the UTC one", () => {
  assert.equal(endOfDaySast(new Date("2026-09-15T23:30:00.000Z")).toISOString(), "2026-09-16T21:59:59.999Z");
});

test("accessUntilForBillingDate adds the grace period and rounds to midnight", () => {
  const until = accessUntilForBillingDate(new Date("2026-10-15T06:00:00.000Z"));
  assert.equal(PAYMENT_GRACE_DAYS, 5);
  assert.equal(until.toISOString(), "2026-10-20T21:59:59.999Z");
});

test("laterOf never shortens and treats null as no date", () => {
  const a = new Date("2026-10-01T00:00:00.000Z");
  const b = new Date("2027-01-01T00:00:00.000Z");
  assert.equal(laterOf(a, b), b);
  assert.equal(laterOf(b, a), b);
  assert.equal(laterOf(null, a), a);
  assert.equal(laterOf(a, null), a);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
