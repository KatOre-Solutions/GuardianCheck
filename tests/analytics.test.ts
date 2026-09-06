/**
 * Tests for the Admin Dashboard's derived numbers (`src/lib/analytics.ts`).
 *
 * Run with `npm run test:analytics`. Needs no emulator and no Firebase — the
 * module under test is pure, which is most of the point of extracting it.
 *
 * These assert real numbers rather than shapes. Every case below corresponds
 * to a way the dashboard was previously wrong or would have gone wrong:
 *
 *   - a 30-day range that quietly covered 29 or 31 days
 *   - a child counted twice as two "unique children"
 *   - an average per service whose denominator dropped the services nobody
 *     attended, inflating the figure
 *   - "busiest service" reported as a slot name, so sixteen weekly documents
 *     sharing two names gave an answer that identified nothing
 *   - identical service names across several weeks landing in one column
 *   - `service.date === ""`, which `EventsServices.tsx` writes routinely
 *   - no active service at all, where every open check-in is stale
 *
 * Dates are pinned to a fixed `now`, so a run in January means the same thing
 * as a run in July. All bucketing is local-time, matching the app.
 */

import {
  buildAttendanceTrend,
  buildRoomOccupancy,
  buildServiceComparison,
  countServicesHeld,
  delta,
  filterHistorical,
  findStaleCheckins,
  inRange,
  rangeFor,
  serviceDayOf,
  sortByCheckInTimeDesc,
  spanOf,
  summarise,
  type CheckinRecord,
  type EventRecord,
  type RoomRecord,
  type ServiceRecord,
} from "../src/lib/analytics";

let pass = 0;
let fail = 0;

const check = (name: string, expected: unknown, actual: unknown) => {
  const ok = Object.is(expected, actual);
  if (ok) pass++;
  else fail++;
  console.log(
    `${ok ? "  ok  " : "FAIL  "} ${name}${ok ? "" : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`,
  );
};

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/** Sunday 6 September 2026, mid-afternoon, local time. */
const NOW = new Date(2026, 8, 6, 15, 30, 0);

/** A local-time ISO string, so fixtures land on the day they read as. */
const at = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): string => new Date(year, month - 1, day, hour, minute, 0).toISOString();

const services: ServiceRecord[] = [
  // Today, both slots. The 09:00 has closed; the 11:00 is running.
  { id: "svc-today-9", name: "09:00 Service", startTime: "09:00", date: "2026-09-06", eventId: "evt-today", status: "closed" },
  { id: "svc-today-11", name: "11:00 Service", startTime: "11:00", date: "2026-09-06", eventId: "evt-today", status: "active" },
  // Last Sunday — same two names again, which is what broke the old chart.
  { id: "svc-prev-9", name: "09:00 Service", startTime: "09:00", date: "2026-08-30", eventId: "evt-prev", status: "closed" },
  { id: "svc-prev-11", name: "11:00 Service", startTime: "11:00", date: "2026-08-30", eventId: "evt-prev", status: "closed" },
  // Ran, nobody came. Must still land in the average's denominator.
  { id: "svc-empty", name: "Youth", startTime: "18:00", date: "2026-09-02", eventId: "evt-youth", status: "closed" },
  // Scheduled but not yet held.
  { id: "svc-upcoming", name: "09:00 Service", startTime: "09:00", date: "2026-09-13", eventId: "evt-next", status: "upcoming" },
  // Date empty, as `EventsServices.tsx` writes it; resolves via the event.
  { id: "svc-nodate", name: "Midweek", startTime: "19:00", date: "", eventId: "evt-midweek", status: "closed" },
];

const events: EventRecord[] = [
  { id: "evt-today", name: "Sunday Service", date: "2026-09-06" },
  { id: "evt-prev", name: "Sunday Service", date: "2026-08-30" },
  { id: "evt-youth", name: "Youth Night", date: "2026-09-02" },
  { id: "evt-next", name: "Sunday Service", date: "2026-09-13" },
  { id: "evt-midweek", name: "Midweek", date: "2026-09-03" },
];

const checkins: CheckinRecord[] = [
  // Today, 09:00 — three children, one checked out.
  { id: "c1", childId: "kid-a", childName: "Ava", roomId: "room-1", roomName: "Toddlers", serviceId: "svc-today-9", serviceName: "09:00 Service", checkInTime: at(2026, 9, 6, 9, 5), status: "checked-out" },
  { id: "c2", childId: "kid-b", childName: "Ben", roomId: "room-1", roomName: "Toddlers", serviceId: "svc-today-9", serviceName: "09:00 Service", checkInTime: at(2026, 9, 6, 9, 10), status: "checked-in" },
  { id: "c3", childId: "kid-c", childName: "Cara", roomId: "room-2", roomName: "Juniors", serviceId: "svc-today-9", serviceName: "09:00 Service", checkInTime: at(2026, 9, 6, 9, 15), status: "checked-in" },
  // Today, 11:00 — the active service. `kid-a` attends both slots.
  { id: "c4", childId: "kid-a", childName: "Ava", roomId: "room-1", roomName: "Toddlers", serviceId: "svc-today-11", serviceName: "11:00 Service", checkInTime: at(2026, 9, 6, 11, 5), status: "checked-in" },
  { id: "c5", childId: "kid-d", childName: "Dan", roomId: "room-2", roomName: "Juniors", serviceId: "svc-today-11", serviceName: "11:00 Service", checkInTime: at(2026, 9, 6, 11, 20), status: "checked-in" },
  // Last Sunday.
  { id: "c6", childId: "kid-a", childName: "Ava", roomId: "room-1", roomName: "Toddlers", serviceId: "svc-prev-9", serviceName: "09:00 Service", checkInTime: at(2026, 8, 30, 9, 5), status: "checked-out" },
  { id: "c7", childId: "kid-b", childName: "Ben", roomId: "room-1", roomName: "Toddlers", serviceId: "svc-prev-11", serviceName: "11:00 Service", checkInTime: at(2026, 8, 30, 11, 5), status: "checked-out" },
  // Midweek, on a service whose `date` is "" — day comes from the event.
  { id: "c8", childId: "kid-c", childName: "Cara", roomId: "room-2", roomName: "Juniors", serviceId: "svc-nodate", serviceName: "Midweek", checkInTime: at(2026, 9, 3, 19, 10), status: "checked-out" },
  // References a service that no longer exists; label falls back to the record.
  { id: "c9", childId: "kid-e", childName: "Eli", roomId: "room-2", roomName: "Juniors", serviceId: "svc-deleted", serviceName: "Old Service", checkInTime: at(2026, 9, 1, 10, 0), status: "checked-in" },
  // No `serviceId` at all.
  { id: "c10", childId: "kid-f", childName: "Fay", roomId: "room-1", roomName: "Toddlers", checkInTime: at(2026, 9, 4, 10, 0), status: "checked-in" },
  // Soft-deleted: must not appear in any figure.
  { id: "c11", childId: "kid-g", childName: "Gus", roomId: "room-1", roomName: "Toddlers", serviceId: "svc-today-11", serviceName: "11:00 Service", checkInTime: at(2026, 9, 6, 11, 30), status: "checked-in", deleted: true },
];

const rooms: RoomRecord[] = [
  { id: "room-1", name: "Toddlers", capacity: 10 },
  // Capacity as a string, as older documents hold it.
  { id: "room-2", name: "Juniors", capacity: "4" },
  { id: "room-3", name: "Closed Room", capacity: 5, deleted: true },
];

/* -------------------------------------------------------------------------- */
/* rangeFor                                                                   */
/* -------------------------------------------------------------------------- */

const r30 = rangeFor(30, NOW);

check("30-day range ends at the end of today", "2026-09-06T23:59:59", isoLocal(r30.to).slice(0, 19));
check("30-day range starts 29 days back at midnight", "2026-08-08T00:00:00", isoLocal(r30.from).slice(0, 19));
check("30-day range covers exactly 30 days", 30, daysBetween(r30.from, r30.to));
check("previous period ends the day before the range starts", "2026-08-07T23:59:59", isoLocal(r30.previous.to).slice(0, 19));
check("previous period is the same length", 30, daysBetween(r30.previous.from, r30.previous.to));
check("previous period does not overlap the current one", true, r30.previous.to.getTime() < r30.from.getTime());
check("range label names the span", "8 Aug – 6 Sep 2026", r30.label);

const r7 = rangeFor(7, NOW);
check("7-day range covers exactly 7 days", 7, daysBetween(r7.from, r7.to));
check("7-day range starts 6 days back", "2026-08-31T00:00:00", isoLocal(r7.from).slice(0, 19));

/* -------------------------------------------------------------------------- */
/* inRange — boundaries                                                       */
/* -------------------------------------------------------------------------- */

const boundary: CheckinRecord[] = [
  { id: "b1", childId: "x", checkInTime: isoOf(r7.from) },
  { id: "b2", childId: "x", checkInTime: isoOf(r7.to) },
  { id: "b3", childId: "x", checkInTime: isoOf(new Date(r7.from.getTime() - 1)) },
  { id: "b4", childId: "x", checkInTime: isoOf(new Date(r7.to.getTime() + 1)) },
  { id: "b5", childId: "x", checkInTime: "" },
  { id: "b6", childId: "x", checkInTime: "not a date" },
];

check("first instant of the range is included", true, inRange(boundary, r7.from, r7.to).some((c) => c.id === "b1"));
check("last instant of the range is included", true, inRange(boundary, r7.from, r7.to).some((c) => c.id === "b2"));
check("one millisecond before the range is excluded", false, inRange(boundary, r7.from, r7.to).some((c) => c.id === "b3"));
check("one millisecond after the range is excluded", false, inRange(boundary, r7.from, r7.to).some((c) => c.id === "b4"));
check("unparseable check-in times are dropped, not counted as epoch", 2, inRange(boundary, r7.from, r7.to).length);
check("soft-deleted check-ins are excluded", false, inRange(checkins, r30.from, r30.to).some((c) => c.id === "c11"));

/* -------------------------------------------------------------------------- */
/* summarise                                                                  */
/* -------------------------------------------------------------------------- */

const summary30 = summarise(checkins, services, events, r30.from, r30.to);

check("total check-ins over 30 days excludes the deleted record", 10, summary30.totalCheckins);
check("unique children counts a repeat attender once", 6, summary30.uniqueChildren);
check("services held counts the zero-attendance service", 6, summary30.servicesHeld);
check("upcoming services are not counted as held", false, countServicesHeld(services, events, r30.from, rangeFor(30, new Date(2026, 8, 20)).to) === 0);
check("average per service divides by services held, not services attended", 2, summary30.averagePerService);
check("busiest is a service instance, not a slot name", 3, summary30.busiest?.count);
check("busiest names the day it happened", "09:00 Service, Sun 6 Sep", summary30.busiest?.label);

const emptySummary = summarise([], [], [], r30.from, r30.to);
check("average is null (not 0) when no service ran", null, emptySummary.averagePerService);
check("busiest is null when there is no attendance", null, emptySummary.busiest);
check("total is 0 with no data", 0, emptySummary.totalCheckins);

/* Two identical-name services on one day must not merge in the busiest
 * calculation — that is exactly what the old chart did. */
const sameDay = summarise(
  [
    { id: "s1", childId: "a", serviceId: "svc-today-9", serviceName: "09:00 Service", checkInTime: at(2026, 9, 6, 9, 0) },
    { id: "s2", childId: "b", serviceId: "svc-today-9", serviceName: "09:00 Service", checkInTime: at(2026, 9, 6, 9, 1) },
    { id: "s3", childId: "c", serviceId: "svc-prev-9", serviceName: "09:00 Service", checkInTime: at(2026, 8, 30, 9, 0) },
  ],
  services,
  events,
  r30.from,
  r30.to,
);
check("same-named services on different days stay separate instances", 2, sameDay.busiest?.count);

/* -------------------------------------------------------------------------- */
/* serviceDayOf                                                               */
/* -------------------------------------------------------------------------- */

const servicesById = new Map(services.map((s) => [s.id, s]));
const eventsById = new Map(events.map((e) => [e.id, e]));

check("service day comes from service.date", "2026-09-06", serviceDayOf(checkins[0], servicesById, eventsById));
check('empty service.date falls through to event.date', "2026-09-03", serviceDayOf(checkins[7], servicesById, eventsById));
check("missing service falls back to the check-in's own day", "2026-09-01", serviceDayOf(checkins[8], servicesById, eventsById));
check("no serviceId falls back to the check-in's own day", "2026-09-04", serviceDayOf(checkins[9], servicesById, eventsById));

/* -------------------------------------------------------------------------- */
/* buildAttendanceTrend                                                       */
/* -------------------------------------------------------------------------- */

const trend = buildAttendanceTrend(checkins, r7.from, r7.to);

check("trend has one point per day in the range", 7, trend.length);
check("trend starts on the range's first day", "2026-08-31", trend[0].dateISO);
check("trend ends today", "2026-09-06", trend[6].dateISO);
check("today's attendance is bucketed correctly", 5, trend[6].count);
check("a day with no attendance is present, not omitted", 0, trend[5].count);
check("trend label disambiguates the year in the tooltip", "Sun 6 Sep 2026", trend[6].fullLabel);

/* -------------------------------------------------------------------------- */
/* buildServiceComparison                                                     */
/* -------------------------------------------------------------------------- */

const comparison = buildServiceComparison(checkins, services, events, r30.from, r30.to);

check("slots are ordered by startTime, not by name", "09:00 Service", comparison.slots[0]);
check("later slot follows", "11:00 Service", comparison.slots[1]);
check("today appears as its own column", true, comparison.days.some((d) => d.dateISO === "2026-09-06"));
check("last Sunday appears as a separate column", true, comparison.days.some((d) => d.dateISO === "2026-08-30"));

const today = comparison.days.find((d) => d.dateISO === "2026-09-06")!;
check("today's 09:00 slot", 3, today["09:00 Service"]);
check("today's 11:00 slot", 2, today["11:00 Service"]);
check("today's total", 5, today.total);

const lastSunday = comparison.days.find((d) => d.dateISO === "2026-08-30")!;
check("last Sunday's 09:00 slot is separate from today's", 1, lastSunday["09:00 Service"]);

const youthDay = comparison.days.find((d) => d.dateISO === "2026-09-02");
check("a service that ran with no attendance keeps its column", true, youthDay !== undefined);
check("that column reads zero", 0, youthDay?.total);

check("upcoming services do not create a column", false, comparison.days.some((d) => d.dateISO === "2026-09-13"));
check("days are ordered oldest first", true, comparison.days.every((d, i, all) => i === 0 || all[i - 1].dateISO <= d.dateISO));

const totalNine = comparison.totals.find((t) => t.slot === "09:00 Service");
check("totals sum a slot across the range", 4, totalNine?.count);

/* The categorical palette has eight slots and hues are never cycled, so a
 * church running more distinct service names than that folds the tail into
 * "Other" rather than reusing a colour. The day totals must survive it. */
const manySlots = Array.from({ length: 11 }, (_, i) => ({
  id: `many-${i}`,
  name: `Slot ${String(i).padStart(2, "0")}`,
  startTime: `${String(6 + i).padStart(2, "0")}:00`,
  date: "2026-09-06",
  eventId: "evt-today",
  status: "closed",
}));
const manyCheckins = manySlots.map((service, i) => ({
  id: `m${i}`,
  childId: `kid-${i}`,
  serviceId: service.id,
  serviceName: service.name,
  checkInTime: at(2026, 9, 6, 6 + i),
}));
const folded = buildServiceComparison(manyCheckins, manySlots, events, r30.from, r30.to);

check("slots are capped at the palette's eight", 8, folded.slots.length);
check("the tail folds into a named Other bucket", "Other", folded.slots[7]);
check("the first seven keep their identity", "Slot 06", folded.slots[6]);
check("folding preserves the day total", 11, folded.days.find((d) => d.dateISO === "2026-09-06")?.total);
check("Other carries the folded count", 4, folded.days.find((d) => d.dateISO === "2026-09-06")?.["Other"]);
check("eight or fewer slots are left alone", 6, comparison.slots.length);

/* -------------------------------------------------------------------------- */
/* buildRoomOccupancy                                                         */
/* -------------------------------------------------------------------------- */

const occupancy = buildRoomOccupancy(rooms, checkins, "svc-today-11");

check("deleted rooms are excluded", 2, occupancy.length);

const toddlers = occupancy.find((r) => r.id === "room-1")!;
check("occupancy counts every open check-in, not just the active service", 3, toddlers.count);
check("the stale portion is reported separately", 2, toddlers.staleCount);
check("percentage against a numeric capacity", 30, toddlers.percentage);

const juniors = occupancy.find((r) => r.id === "room-2")!;
check("string capacity still parses", 4, juniors.capacity);
check("occupancy with string capacity", 3, juniors.count);
check("percentage against a string capacity", 75, juniors.percentage);

const overCapacity = buildRoomOccupancy(
  [{ id: "room-x", name: "Tiny", capacity: 1 }],
  [
    { id: "o1", roomId: "room-x", status: "checked-in", childId: "a" },
    { id: "o2", roomId: "room-x", status: "checked-in", childId: "b" },
  ],
  null,
);
check("percentage is capped at 100", 100, overCapacity[0].percentage);
check("but the raw count is not capped", 2, overCapacity[0].count);

const noActive = buildRoomOccupancy(rooms, checkins, null);
check("with no active service every open record is stale", 3, noActive.find((r) => r.id === "room-1")!.staleCount);

/* -------------------------------------------------------------------------- */
/* findStaleCheckins                                                          */
/* -------------------------------------------------------------------------- */

const stale = findStaleCheckins(checkins, services, "svc-today-11", NOW);

check("a child in the active service is not stale", false, stale.some((s) => s.id === "c4"));
check("an earlier slot the same day is stale", true, stale.some((s) => s.id === "c2"));
check("a record with no serviceId is stale", true, stale.some((s) => s.id === "c10"));
check("a checked-out record is never stale", false, stale.some((s) => s.id === "c1"));
check("a deleted record is never stale", false, stale.some((s) => s.id === "c11"));
check("stale count with a service running", 4, stale.length);
check("oldest first", "c9", stale[0].id);
check("age in days", 5, stale[0].daysOpen);
check("a deleted service still labels from the record", "Old Service", stale[0].serviceLabel);
check("a missing serviceId is labelled honestly", "Unknown service", stale.find((s) => s.id === "c10")?.serviceLabel);

const allStale = findStaleCheckins(checkins, services, null, NOW);
check("with no active service every open check-in is stale", 6, allStale.length);

/* -------------------------------------------------------------------------- */
/* filterHistorical                                                           */
/* -------------------------------------------------------------------------- */

/* The server never writes `eventId` onto a check-in, so every record here
 * lacks one — the old filter returned nothing at all for any event. */
check("event filter resolves through the service", 5, filterHistorical(checkins, services, "evt-today", "").length);
check("event filter excludes other events", false, filterHistorical(checkins, services, "evt-today", "").some((c) => c.id === "c6"));
check("service filter narrows within an event", 3, filterHistorical(checkins, services, "evt-today", "svc-today-9").length);
check("no filters returns everything live", 10, filterHistorical(checkins, services, "", "").length);

const offline: CheckinRecord[] = [
  { id: "off1", childId: "z", eventId: "evt-today", checkInTime: at(2026, 9, 6, 9, 0) },
];
check("offline records still match on their own eventId", 1, filterHistorical(offline, services, "evt-today", "").length);

/* -------------------------------------------------------------------------- */
/* spanOf                                                                     */
/* -------------------------------------------------------------------------- */

/*
 * Found against real data: the Historical panel showed "Average per service:
 * —" beside "Busiest single service: 1". A service dated 2026-08-30 held a
 * check-in stamped the 27th, and the range was being derived from the stamp
 * alone -- so the service fell outside its own records' range and the
 * denominator came out empty.
 */
const driftService: ServiceRecord[] = [
  { id: "svc-drift", name: "09:00 Service", startTime: "09:00", date: "2026-08-30", eventId: "evt-drift", status: "active" },
];
const driftEvents: EventRecord[] = [{ id: "evt-drift", name: "Sunday Service", date: "2026-08-30" }];
const driftCheckins: CheckinRecord[] = [
  { id: "d1", childId: "kid-x", serviceId: "svc-drift", serviceName: "09:00 Service", checkInTime: at(2026, 8, 27, 9, 30), status: "checked-in" },
];

const driftSpan = spanOf(driftCheckins, driftService, driftEvents)!;
check("span starts at the earlier of stamp and service day", "2026-08-27", isoLocal(driftSpan.from).slice(0, 10));
check("span ends at the later of the two", "2026-08-30", isoLocal(driftSpan.to).slice(0, 10));

const driftSummary = summarise(driftCheckins, driftService, driftEvents, driftSpan.from, driftSpan.to);
check("the service is inside its own records' span", 1, driftSummary.servicesHeld);
check("so the average is a number, not an em dash", 1, driftSummary.averagePerService);
check("and it agrees with the busiest figure beside it", 1, driftSummary.busiest?.count);

check("span of nothing is null", null, spanOf([], [], []));

const stampOnly = spanOf(
  [{ id: "s1", childId: "a", checkInTime: at(2026, 9, 4, 10) }],
  [],
  [],
)!;
check("a record with no service spans its own day", "2026-09-04", isoLocal(stampOnly.from).slice(0, 10));

/* -------------------------------------------------------------------------- */
/* sortByCheckInTimeDesc                                                      */
/* -------------------------------------------------------------------------- */

const sorted = sortByCheckInTimeDesc(checkins);
check("newest check-in first", "c11", sorted[0].id);
check("sort does not mutate the input", "c1", checkins[0].id);
check("sort keeps every record", checkins.length, sorted.length);

/* -------------------------------------------------------------------------- */
/* delta                                                                      */
/* -------------------------------------------------------------------------- */

check("delta absolute change", 5, delta(15, 10).absolute);
check("delta percentage", 50, delta(15, 10).percent);
check("delta direction up", "up", delta(15, 10).direction);
check("delta direction down", "down", delta(5, 10).direction);
check("delta direction flat", "flat", delta(10, 10).direction);
check("delta percent is null when the previous period was zero", null, delta(10, 0).percent);
check("delta still reports the absolute rise from zero", 10, delta(10, 0).absolute);
check("zero to zero is flat, not a division by zero", "flat", delta(0, 0).direction);
check("negative percentage", -50, delta(5, 10).percent);

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Local-time ISO, for asserting on wall-clock boundaries. */
function isoLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function isoOf(date: Date): string {
  return date.toISOString();
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
