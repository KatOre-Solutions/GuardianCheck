/**
 * Derived numbers for the Admin Dashboard.
 *
 * ## Why this exists
 *
 * Every figure on the admin dashboard used to be an inline `.filter().length`
 * in the render body of `AdminDashboard.tsx`. That had three consequences:
 *
 *   1. The same concept was computed differently in different places. The
 *      historical panel divided total check-ins by the services that *had*
 *      attendance, so a service nobody attended silently vanished from the
 *      denominator and pushed the average up.
 *   2. Nothing was testable. There was no way to assert that a 30-day range
 *      really covers 30 days, or that a child checked in twice counts once as
 *      a unique child.
 *   3. All eight datasets were rebuilt on every render, including on every
 *      keystroke in any modal on the page.
 *
 * These functions are pure: no React, no Firestore, and no reads of the
 * current time. Callers pass `now`, so tests are deterministic and a single
 * render uses one consistent instant for every number it shows.
 *
 * ## Time handling
 *
 * `checkInTime` is a UTC ISO string, but every other date in the app —
 * `service.date`, `event.date` — is a bare `"yyyy-MM-dd"` calendar day with no
 * timezone. Bucketing therefore happens in the viewer's local zone, which is
 * how the rest of the app already reads these records. A service day is
 * trusted over a check-in timestamp wherever one is available: a child scanned
 * at 00:05 belongs to the service that was running, not to the calendar day
 * the clock had just rolled into.
 */

import {
  addDays,
  differenceInCalendarDays,
  endOfDay,
  format,
  startOfDay,
  subDays,
} from "date-fns";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/*
 * The codebase has no domain interfaces — `checkins`, `services`, `rooms` and
 * the rest are all `useState<any[]>`. These are structural descriptions of
 * what the documents actually contain, not a schema: every field is optional
 * because Firestore enforces nothing and older documents predate several of
 * them. The index signature keeps them assignable from the untyped state
 * arrays without a cast at every call site.
 */

export interface CheckinRecord {
  id?: string;
  childId?: string;
  childName?: string;
  roomId?: string;
  roomName?: string;
  serviceId?: string;
  serviceName?: string;
  eventId?: string;
  eventName?: string;
  checkInTime?: string;
  checkOutTime?: string;
  status?: string;
  deleted?: boolean;
  [key: string]: any;
}

export interface ServiceRecord {
  id: string;
  name?: string;
  /** `"yyyy-MM-dd"`, but written as `event?.date || ""` — so it can be empty. */
  date?: string;
  eventId?: string;
  /** `"HH:mm"`. Sortable as a string, unlike `name`, which is free text. */
  startTime?: string;
  endTime?: string;
  status?: string;
  deleted?: boolean;
  [key: string]: any;
}

export interface EventRecord {
  id: string;
  name?: string;
  date?: string;
  deleted?: boolean;
  [key: string]: any;
}

export interface RoomRecord {
  id: string;
  name?: string;
  /** Written as `Number(...)` but older documents hold the raw string. */
  capacity?: number | string;
  deleted?: boolean;
  [key: string]: any;
}

export interface DateRange {
  from: Date;
  to: Date;
  /** The immediately preceding window of equal length. */
  previous: { from: Date; to: Date };
  /** Human-readable span, e.g. `"7 Aug – 6 Sep 2026"`. */
  label: string;
}

export interface TrendPoint {
  dateISO: string;
  /** Short axis label, e.g. `"6 Sep"`. */
  label: string;
  /** Unambiguous tooltip label, e.g. `"Sun 6 Sep 2026"`. */
  fullLabel: string;
  count: number;
}

export interface ServiceDay {
  dateISO: string;
  label: string;
  fullLabel: string;
  total: number;
  /** One numeric entry per slot name — Recharts reads these by `dataKey`. */
  [slot: string]: string | number;
}

export interface ServiceComparison {
  days: ServiceDay[];
  /** Slot names ordered by `startTime`, for one `<Bar>` each. */
  slots: string[];
  /** Each slot summed across the whole range, for the "Totals" view. */
  totals: { slot: string; count: number }[];
}

export interface RoomOccupancy {
  id: string;
  name: string;
  /** Every open check-in in the room, whatever service it belongs to. */
  count: number;
  /** How many of `count` are left over from a service that has closed. */
  staleCount: number;
  capacity: number;
  percentage: number;
}

export interface StaleCheckin {
  id: string;
  childId: string;
  childName: string;
  roomName: string;
  serviceLabel: string;
  /** Service day if one could be resolved, else `""`. */
  serviceDateISO: string;
  checkInTime: string;
  daysOpen: number;
}

export interface BusiestService {
  count: number;
  serviceName: string;
  dateISO: string;
  /** Ready to render, e.g. `"09:00 Service, Sun 6 Sep"`. */
  label: string;
}

export interface Summary {
  totalCheckins: number;
  uniqueChildren: number;
  /** Service instances that ran in range — the average's denominator. */
  servicesHeld: number;
  /** `null` when no service ran, so the caller renders "—" rather than 0. */
  averagePerService: number | null;
  busiest: BusiestService | null;
}

export interface Delta {
  current: number;
  previous: number;
  absolute: number;
  /**
   * `null` when the previous period was 0 — "up 100%" from nothing is not a
   * meaningful statement, and every alternative rounds to a lie.
   */
  percent: number | null;
  direction: "up" | "down" | "flat";
}

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                           */
/* -------------------------------------------------------------------------- */

const DAY_KEY = "yyyy-MM-dd";
const UNASSIGNED = "Unassigned";
const OTHER = "Other";

/** Slots the categorical palette can colour without repeating a hue. */
const MAX_SLOTS = 8;

/** Parses anything the documents might hold, returning null rather than an
 *  Invalid Date. `service.date` is routinely `""`. */
function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed = value instanceof Date ? value : new Date(String(value));

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Parses a bare `"yyyy-MM-dd"` as local midnight. `new Date("2026-09-06")`
 *  would parse as UTC and shift the day backwards west of Greenwich. */
function toLocalDay(dateISO: string): Date | null {
  if (!dateISO) return null;

  return toDate(`${dateISO}T00:00:00`);
}

function dayKey(date: Date): string {
  return format(date, DAY_KEY);
}

function shortLabel(dateISO: string): string {
  const date = toLocalDay(dateISO);

  return date ? format(date, "d MMM") : dateISO;
}

function fullLabel(dateISO: string): string {
  const date = toLocalDay(dateISO);

  return date ? format(date, "EEE d MMM yyyy") : dateISO;
}

function indexById<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map((rows || []).map((row) => [row.id, row]));
}

/** Soft-deleted documents are excluded everywhere. Records that predate the
 *  flag have no `deleted` field at all, so only an explicit `true` counts. */
function notDeleted<T extends { deleted?: boolean }>(row: T): boolean {
  return row?.deleted !== true;
}

/**
 * The calendar day a check-in belongs to.
 *
 * Falls through `service.date` → `event.date` → the local day of the check-in
 * itself, because `EventsServices.tsx` writes `date: event?.date || ""` and
 * offline records may reference nothing at all.
 */
export function serviceDayOf(
  checkin: CheckinRecord,
  servicesById: Map<string, ServiceRecord>,
  eventsById: Map<string, EventRecord>,
): string {
  const service = checkin.serviceId
    ? servicesById.get(checkin.serviceId)
    : undefined;

  if (service?.date) return service.date;

  const eventId = service?.eventId || checkin.eventId;
  const event = eventId ? eventsById.get(eventId) : undefined;

  if (event?.date) return event.date;

  const checkedInAt = toDate(checkin.checkInTime);

  return checkedInAt ? dayKey(checkedInAt) : "";
}

/** The slot a check-in belongs to. `serviceName` is denormalised onto the
 *  record, so it survives the service document being deleted. */
function slotNameOf(
  checkin: CheckinRecord,
  servicesById: Map<string, ServiceRecord>,
): string {
  if (checkin.serviceName) return checkin.serviceName;

  const service = checkin.serviceId
    ? servicesById.get(checkin.serviceId)
    : undefined;

  return service?.name || UNASSIGNED;
}

/* -------------------------------------------------------------------------- */
/* Ranges                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The window the 7/30/90 selector means, plus the comparison window.
 *
 * `days` is inclusive of today: a 30-day range runs from the start of the day
 * 29 days ago to the end of today, and its previous period is the 30 days
 * immediately before that with no gap and no overlap.
 */
export function rangeFor(days: number, now: Date): DateRange {
  const span = Math.max(1, Math.floor(days));
  const to = endOfDay(now);
  const from = startOfDay(subDays(to, span - 1));

  const previousTo = endOfDay(subDays(from, 1));
  const previousFrom = startOfDay(subDays(previousTo, span - 1));

  return {
    from,
    to,
    previous: { from: previousFrom, to: previousTo },
    label: `${format(from, "d MMM")} – ${format(to, "d MMM yyyy")}`,
  };
}

/** Attendance records whose `checkInTime` falls inside `[from, to]`. */
export function inRange(
  checkins: CheckinRecord[],
  from: Date,
  to: Date,
): CheckinRecord[] {
  const start = from.getTime();
  const end = to.getTime();

  return (checkins || []).filter((checkin) => {
    if (!notDeleted(checkin)) return false;

    const checkedInAt = toDate(checkin.checkInTime);

    if (!checkedInAt) return false;

    const time = checkedInAt.getTime();

    return time >= start && time <= end;
  });
}

/* -------------------------------------------------------------------------- */
/* Trend                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One point per calendar day in the range, including days with no attendance.
 *
 * The old version rebuilt this by scanning every check-in once per day —
 * `analyticsTimeRange × checkins` comparisons on every render. This buckets in
 * one pass and then reads the map.
 */
export function buildAttendanceTrend(
  checkins: CheckinRecord[],
  from: Date,
  to: Date,
): TrendPoint[] {
  const counts = new Map<string, number>();

  for (const checkin of inRange(checkins, from, to)) {
    const checkedInAt = toDate(checkin.checkInTime);

    if (!checkedInAt) continue;

    const key = dayKey(checkedInAt);

    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const totalDays = differenceInCalendarDays(to, from);
  const points: TrendPoint[] = [];

  for (let offset = 0; offset <= totalDays; offset += 1) {
    const day = addDays(from, offset);
    const dateISO = dayKey(day);

    points.push({
      dateISO,
      label: shortLabel(dateISO),
      fullLabel: fullLabel(dateISO),
      count: counts.get(dateISO) || 0,
    });
  }

  return points;
}

/* -------------------------------------------------------------------------- */
/* Attendance by service                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Attendance bucketed by *(service day, slot name)*.
 *
 * ## Why this replaced "Service Comparison"
 *
 * `ensureSundayEvents` creates a fresh pair of service documents every week,
 * both named literally `"09:00 Service"` and `"11:00 Service"`. The old chart
 * projected each service to `{ name, count }` and fed a category axis keyed on
 * `name` — so eight weeks of services collapsed into two ticks with sixteen
 * bars drawn on top of each other, and no way to tell which week was which.
 *
 * Keying on the day and treating the slot as a series answers the question the
 * chart was always meant to answer: how did each service do, week by week.
 *
 * Days on which a service ran but nobody attended are kept — an empty column
 * is information. Days with no scheduled service are dropped, so a 90-day
 * window does not render ninety empty columns.
 */
export function buildServiceComparison(
  checkins: CheckinRecord[],
  services: ServiceRecord[],
  events: EventRecord[],
  from: Date,
  to: Date,
): ServiceComparison {
  const liveServices = (services || []).filter(notDeleted);
  const servicesById = indexById(liveServices);
  const eventsById = indexById((events || []).filter(notDeleted));

  /* Slot ordering comes from `startTime`, never from `name`: names are free
   * text ("09:00 Service", "9am", "Youth") and sort meaninglessly. */
  const slotStart = new Map<string, string>();
  const days = new Map<string, Map<string, number>>();

  const ensureDay = (dateISO: string) => {
    if (!days.has(dateISO)) days.set(dateISO, new Map());

    return days.get(dateISO)!;
  };

  for (const service of liveServices) {
    const name = service.name || UNASSIGNED;
    const startTime = service.startTime || "";
    const existing = slotStart.get(name);

    if (existing === undefined || (startTime && startTime < existing)) {
      slotStart.set(name, startTime);
    }

    /* Seed the column so a service with no attendance still shows up. */
    const dateISO = service.date || eventsById.get(service.eventId || "")?.date;
    const day = toLocalDay(dateISO || "");

    if (!day || day < startOfDay(from) || day > to) continue;
    if (service.status === "upcoming") continue;

    const buckets = ensureDay(dateISO!);

    if (!buckets.has(name)) buckets.set(name, 0);
  }

  for (const checkin of inRange(checkins, from, to)) {
    const dateISO = serviceDayOf(checkin, servicesById, eventsById);

    if (!dateISO) continue;

    const slot = slotNameOf(checkin, servicesById);
    const buckets = ensureDay(dateISO);

    buckets.set(slot, (buckets.get(slot) || 0) + 1);

    if (!slotStart.has(slot)) slotStart.set(slot, "");
  }

  const slots = [...slotStart.keys()].sort((a, b) => {
    const startA = slotStart.get(a) || "";
    const startB = slotStart.get(b) || "";

    /* Slots with no start time sort last, then alphabetically, so an
     * "Unassigned" bucket never leads the legend. */
    if (startA && startB && startA !== startB) return startA < startB ? -1 : 1;
    if (startA && !startB) return -1;
    if (!startA && startB) return 1;

    return a.localeCompare(b);
  });

  /*
   * The categorical palette has eight slots assigned in a fixed order, and a
   * ninth series is never a generated hue. A church running more than eight
   * distinct service names in one window keeps the first seven by start time
   * and folds the rest into "Other", so the day totals stay correct and no
   * two series ever share a colour.
   */
  const displaySlots =
    slots.length > MAX_SLOTS
      ? [...slots.slice(0, MAX_SLOTS - 1), OTHER]
      : slots;

  const displayNameFor = (slot: string): string =>
    displaySlots.includes(slot) ? slot : OTHER;

  const totals = new Map<string, number>();

  const rows: ServiceDay[] = [...days.keys()]
    .sort()
    .map((dateISO) => {
      const raw = days.get(dateISO)!;
      const buckets = new Map<string, number>();

      for (const [slot, count] of raw) {
        const name = displayNameFor(slot);

        buckets.set(name, (buckets.get(name) || 0) + count);
      }
      const row: ServiceDay = {
        dateISO,
        label: shortLabel(dateISO),
        fullLabel: fullLabel(dateISO),
        total: 0,
      };

      let total = 0;

      for (const slot of displaySlots) {
        const count = buckets.get(slot) || 0;

        row[slot] = count;
        total += count;
        totals.set(slot, (totals.get(slot) || 0) + count);
      }

      row.total = total;

      return row;
    });

  return {
    days: rows,
    slots: displaySlots,
    totals: displaySlots.map((slot) => ({
      slot,
      count: totals.get(slot) || 0,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Rooms                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Who is in each room right now.
 *
 * ## Why this is not scoped to the active service
 *
 * A child physically in a room is in that room regardless of which service
 * they were signed into. Scoping the count to the active service would make a
 * room read `3 / 20` while twelve children are actually in it, and the room
 * sheet an admin grabs in an evacuation would be short by nine children.
 * Under-reporting occupancy is the one failure mode a safeguarding system
 * cannot have.
 *
 * It would also disagree with the volunteer's "Currently Checked In" tab,
 * which subscribes to `status == "checked-in"` with no service filter — two
 * different answers to "who is here" on two screens.
 *
 * So the count is every open check-in, and `staleCount` annotates how much of
 * it is left over from a closed service. The admin gets the safe number *and*
 * the explanation.
 */
export function buildRoomOccupancy(
  rooms: RoomRecord[],
  checkins: CheckinRecord[],
  activeServiceId: string | null | undefined,
): RoomOccupancy[] {
  const open = (checkins || []).filter(
    (checkin) => notDeleted(checkin) && checkin.status === "checked-in",
  );

  return (rooms || []).filter(notDeleted).map((room) => {
    const inRoom = open.filter((checkin) => checkin.roomId === room.id);
    const staleCount = inRoom.filter(
      (checkin) => checkin.serviceId !== activeServiceId,
    ).length;

    /* `capacity` is written with `Number(...)` but older documents hold the
     * raw string from the form, so the defensive parse stays. */
    const capacity = parseInt(String(room.capacity ?? ""), 10) || 1;
    const count = inRoom.length;

    return {
      id: room.id,
      name: room.name || "Unnamed room",
      count,
      staleCount,
      capacity,
      percentage: Math.min(Math.round((count / capacity) * 100), 100),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Stale check-ins                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Open check-ins that belong to a service which is no longer running.
 *
 * ## Why the definition is this simple
 *
 * `activateService` closes every other service before activating one, and the
 * server refuses a check-in unless its service is active. At most one service
 * is active per church, so:
 *
 *     stale  ⇔  status === "checked-in" && serviceId !== activeService?.id
 *
 * needs no join and still handles every edge case: an earlier slot the same
 * day is stale because only one slot can be active; a missing `serviceId` is
 * stale; and when *no* service is running, every open record is stale — the
 * case that matters most, and the one a services join would have got wrong.
 *
 * The services collection is used only to label the row, never to decide it.
 */
export function findStaleCheckins(
  checkins: CheckinRecord[],
  services: ServiceRecord[],
  activeServiceId: string | null | undefined,
  now: Date,
): StaleCheckin[] {
  const servicesById = indexById((services || []).filter(notDeleted));

  return (checkins || [])
    .filter(
      (checkin) =>
        notDeleted(checkin) &&
        checkin.status === "checked-in" &&
        checkin.serviceId !== activeServiceId,
    )
    .map((checkin) => {
      const service = checkin.serviceId
        ? servicesById.get(checkin.serviceId)
        : undefined;
      const checkedInAt = toDate(checkin.checkInTime);

      /* Label from the service, then the denormalised name on the record
       * itself, which survives the service document being deleted. */
      const serviceLabel =
        service?.name || checkin.serviceName || "Unknown service";

      return {
        id: checkin.id || "",
        childId: checkin.childId || "",
        childName: checkin.childName || "Unknown child",
        roomName: checkin.roomName || "—",
        serviceLabel,
        serviceDateISO: service?.date || "",
        checkInTime: checkin.checkInTime || "",
        daysOpen: checkedInAt
          ? Math.max(0, differenceInCalendarDays(now, checkedInAt))
          : 0,
      };
    })
    .sort((a, b) => {
      /* Oldest first: the records most likely to be forgotten sit at the top. */
      const timeA = toDate(a.checkInTime)?.getTime() ?? 0;
      const timeB = toDate(b.checkInTime)?.getTime() ?? 0;

      return timeA - timeB;
    });
}

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Counts a service instance as "held" if it ran inside the range.
 *
 * The denominator deliberately comes from the services collection rather than
 * from the distinct `serviceId`s found among the check-ins. Deriving it from
 * attendance excludes services nobody attended, which inflates the average and
 * contradicts the chart beside it, where those services appear as empty
 * columns. `upcoming` services are excluded because they have not happened.
 */
export function countServicesHeld(
  services: ServiceRecord[],
  events: EventRecord[],
  from: Date,
  to: Date,
): number {
  const eventsById = indexById((events || []).filter(notDeleted));
  const start = startOfDay(from);

  return (services || []).filter((service) => {
    if (!notDeleted(service)) return false;
    if (service.status !== "active" && service.status !== "closed") return false;

    const dateISO =
      service.date || eventsById.get(service.eventId || "")?.date || "";
    const day = toLocalDay(dateISO);

    if (!day) return false;

    return day >= start && day <= to;
  }).length;
}

/** Every headline number for a range, computed once and shared by every zone
 *  so the trends panel and the historical panel cannot drift apart. */
export function summarise(
  checkins: CheckinRecord[],
  services: ServiceRecord[],
  events: EventRecord[],
  from: Date,
  to: Date,
): Summary {
  const scoped = inRange(checkins, from, to);
  const servicesById = indexById((services || []).filter(notDeleted));
  const eventsById = indexById((events || []).filter(notDeleted));

  const uniqueChildren = new Set(
    scoped.map((checkin) => checkin.childId).filter(Boolean),
  ).size;

  const servicesHeld = countServicesHeld(services, events, from, to);

  /* Busiest is reported per service *instance*, never per slot name: with
   * sixteen documents sharing two names, a bare "34" told an admin nothing
   * about which Sunday it happened on. */
  const perInstance = new Map<string, { count: number; checkin: CheckinRecord }>();

  for (const checkin of scoped) {
    const key = `${checkin.serviceId || "unassigned"}::${serviceDayOf(
      checkin,
      servicesById,
      eventsById,
    )}`;
    const existing = perInstance.get(key);

    if (existing) {
      existing.count += 1;
    } else {
      perInstance.set(key, { count: 1, checkin });
    }
  }

  let busiest: BusiestService | null = null;

  for (const { count, checkin } of perInstance.values()) {
    if (busiest && count <= busiest.count) continue;

    const dateISO = serviceDayOf(checkin, servicesById, eventsById);
    const serviceName = slotNameOf(checkin, servicesById);
    const day = toLocalDay(dateISO);

    busiest = {
      count,
      serviceName,
      dateISO,
      label: day
        ? `${serviceName}, ${format(day, "EEE d MMM")}`
        : serviceName,
    };
  }

  return {
    totalCheckins: scoped.length,
    uniqueChildren,
    servicesHeld,
    averagePerService:
      servicesHeld > 0 ? Math.round(scoped.length / servicesHeld) : null,
    busiest,
  };
}

/** Period-over-period change. */
export function delta(current: number, previous: number): Delta {
  const absolute = current - previous;

  return {
    current,
    previous,
    absolute,
    percent: previous === 0 ? null : Math.round((absolute / previous) * 100),
    direction: absolute > 0 ? "up" : absolute < 0 ? "down" : "flat",
  };
}

/* -------------------------------------------------------------------------- */
/* Historical filters                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Applies the Historical Analysis event/service filters.
 *
 * ## Why the event filter needs the services collection
 *
 * The old filter matched `checkin.eventId` directly, and the trusted server
 * check-in path never writes `eventId` or `eventName` — only the offline
 * client fallback does. So selecting any event dropped essentially every real
 * check-in and showed an empty table.
 *
 * The event is resolved through the service instead, which does carry
 * `eventId`, falling back to the record's own field for offline-created rows.
 */
export function filterHistorical(
  checkins: CheckinRecord[],
  services: ServiceRecord[],
  eventId: string,
  serviceId: string,
): CheckinRecord[] {
  const eventByService = new Map(
    (services || [])
      .filter(notDeleted)
      .map((service) => [service.id, service.eventId || ""]),
  );

  return (checkins || []).filter((checkin) => {
    if (!notDeleted(checkin)) return false;

    if (eventId) {
      const resolved =
        (checkin.serviceId ? eventByService.get(checkin.serviceId) : "") ||
        checkin.eventId ||
        "";

      if (resolved !== eventId) return false;
    }

    if (serviceId && checkin.serviceId !== serviceId) return false;

    return true;
  });
}

/** Newest first. The table was slicing Firestore's arbitrary document order
 *  and labelling the result "latest 10". */
export function sortByCheckInTimeDesc(
  checkins: CheckinRecord[],
): CheckinRecord[] {
  return [...(checkins || [])].sort((a, b) => {
    const timeA = toDate(a.checkInTime)?.getTime() ?? 0;
    const timeB = toDate(b.checkInTime)?.getTime() ?? 0;

    return timeB - timeA;
  });
}
