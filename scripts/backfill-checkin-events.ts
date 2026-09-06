/**
 * backfill-checkin-events.ts — put the event back onto check-ins and services (#106).
 *
 * SAFE BY DEFAULT: with no flags it only *reports*. Nothing is written unless
 * you pass --write.
 *
 * Usage:
 *   npx tsx scripts/backfill-checkin-events.ts                    # dry run, shows the plan
 *   npx tsx scripts/backfill-checkin-events.ts --write            # apply
 *   npx tsx scripts/backfill-checkin-events.ts --church <id>      # scope to one church
 *
 * Why this exists
 * ---------------
 * The trusted server check-in path wrote neither `eventId` nor `eventName`.
 * Only the offline client fallback set them, and that is the rare path, so in
 * practice almost every real check-in has no event on it. The Admin Dashboard's
 * event filter matched the field directly and therefore returned nothing, and
 * the attendance report's Event column read "N/A" on every row.
 *
 * Both are fixed going forward — server.ts now denormalises the event off the
 * service at write time, and `ensureSundayEvents` stamps `eventName` onto the
 * services it creates. This script is for everything written before that.
 *
 * Two collections need it, for different reasons:
 *
 *   1. `services` created by `ensureSundayEvents` carry `eventId` but no
 *      `eventName`. They are the bulk of every church's services. Filling this
 *      is what lets a check-in copy the name without a second read.
 *   2. `checkins` carry neither. They are resolved here through their service,
 *      which is the same join `filterHistorical` does at read time — the
 *      difference being that once the value is written down it survives the
 *      service document being deleted, which the join does not.
 *
 * Records whose service is already gone cannot be recovered: nothing anywhere
 * still records which event they belonged to. They are counted and listed as
 * unresolvable rather than guessed at.
 *
 * Only missing fields are filled. A record that already carries an event — an
 * offline-created one, say — is left exactly as it is, so this is safe to run
 * repeatedly and safe to run after the fix is deployed.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const WRITE = process.argv.includes("--write");

const churchFlag = process.argv.indexOf("--church");
const ONLY_CHURCH = churchFlag !== -1 ? process.argv[churchFlag + 1] : null;

const firebaseConfig = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf8")
);

function formatPrivateKey(key: string) {
  return key.trim().replace(/\\n/g, "\n").replace(/^"|"$/g, "");
}

if (getApps().length === 0) {
  const options: any = { projectId: firebaseConfig.projectId };
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    options.credential = cert({
      projectId: firebaseConfig.projectId,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY),
    });
  }
  initializeApp(options);
}

// The named database, resolved the way server.ts resolves it. Against
// `(default)` every read here returns 5 NOT_FOUND — the same trap #75 describes.
const db = getFirestore(firebaseConfig.firestoreDatabaseId);

/** A write we intend to make, kept as a plan so --write applies exactly what
 *  the dry run printed. */
interface Patch {
  collection: string;
  id: string;
  data: Record<string, string>;
  /** For the printed plan only. */
  note: string;
}

function scoped<T extends { churchId?: string }>(rows: T[]): T[] {
  return ONLY_CHURCH ? rows.filter((r) => r.churchId === ONLY_CHURCH) : rows;
}

async function main() {
  console.log(`\nbackfill-checkin-events — ${WRITE ? "WRITE" : "DRY RUN"}`);
  console.log(`database: ${firebaseConfig.firestoreDatabaseId}`);
  console.log(`scope:    ${ONLY_CHURCH || "all churches"}\n`);

  const [eventSnap, serviceSnap, checkinSnap] = await Promise.all([
    db.collection("events").get(),
    db.collection("services").get(),
    db.collection("checkins").get(),
  ]);

  const events = scoped(eventSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as any));
  const services = scoped(serviceSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as any));
  const checkins = scoped(checkinSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as any));

  const eventsById = new Map(events.map((e) => [e.id, e]));
  const servicesById = new Map(services.map((s) => [s.id, s]));

  const patches: Patch[] = [];

  /* ---- 1. Services missing the denormalised event name ------------------ */

  let servicesOk = 0;
  const servicesOrphaned: string[] = [];

  for (const service of services) {
    if (service.deleted) continue;
    if (service.eventName) {
      servicesOk++;
      continue;
    }
    if (!service.eventId) {
      servicesOrphaned.push(`${service.id} (${service.name || "unnamed"}) — no eventId`);
      continue;
    }

    const event = eventsById.get(service.eventId);

    if (!event?.name) {
      servicesOrphaned.push(`${service.id} (${service.name || "unnamed"}) — event ${service.eventId} missing`);
      continue;
    }

    patches.push({
      collection: "services",
      id: service.id,
      data: { eventName: event.name },
      note: `${service.name || "unnamed"} ${service.date || ""} -> ${event.name}`,
    });
  }

  /* ---- 2. Check-ins missing the event altogether ------------------------ */

  let checkinsOk = 0;
  const checkinsOrphaned: string[] = [];

  for (const checkin of checkins) {
    if (checkin.deleted) continue;

    // Already carries both — an offline-created record, or one written since
    // the server fix. Leave it alone.
    if (checkin.eventId && checkin.eventName) {
      checkinsOk++;
      continue;
    }

    const service = checkin.serviceId ? servicesById.get(checkin.serviceId) : undefined;

    // The record's own eventId survives even when the service is gone.
    const eventId = service?.eventId || checkin.eventId || "";
    const eventName =
      checkin.eventName || service?.eventName || eventsById.get(eventId)?.name || "";

    if (!eventId && !eventName) {
      checkinsOrphaned.push(
        `${checkin.id} (${checkin.childName || "?"}, ${checkin.checkInTime || "no time"}) — service ${checkin.serviceId || "none"} unresolvable`,
      );
      continue;
    }

    // Write only what is actually missing.
    const data: Record<string, string> = {};
    if (eventId && !checkin.eventId) data.eventId = eventId;
    if (eventName && !checkin.eventName) data.eventName = eventName;

    if (Object.keys(data).length === 0) {
      checkinsOk++;
      continue;
    }

    patches.push({
      collection: "checkins",
      id: checkin.id,
      data,
      note: `${checkin.childName || "?"} ${checkin.checkInTime || ""} -> ${eventName || eventId}`,
    });
  }

  /* ---- Report ----------------------------------------------------------- */

  const servicePatches = patches.filter((p) => p.collection === "services");
  const checkinPatches = patches.filter((p) => p.collection === "checkins");

  console.log(`services:  ${services.length} total, ${servicesOk} already named, ${servicePatches.length} to fill, ${servicesOrphaned.length} unresolvable`);
  console.log(`checkins:  ${checkins.length} total, ${checkinsOk} already carry an event, ${checkinPatches.length} to fill, ${checkinsOrphaned.length} unresolvable\n`);

  for (const p of servicePatches.slice(0, 20)) console.log(`  ~ services/${p.id}  ${p.note}`);
  if (servicePatches.length > 20) console.log(`  … and ${servicePatches.length - 20} more services`);

  for (const p of checkinPatches.slice(0, 20)) console.log(`  ~ checkins/${p.id}  ${p.note}`);
  if (checkinPatches.length > 20) console.log(`  … and ${checkinPatches.length - 20} more check-ins`);

  if (servicesOrphaned.length || checkinsOrphaned.length) {
    console.log(`\n  Unresolvable — nothing records which event these belonged to:`);
    for (const o of servicesOrphaned.slice(0, 10)) console.log(`    ! services/${o}`);
    if (servicesOrphaned.length > 10) console.log(`    … and ${servicesOrphaned.length - 10} more`);
    for (const o of checkinsOrphaned.slice(0, 10)) console.log(`    ! checkins/${o}`);
    if (checkinsOrphaned.length > 10) console.log(`    … and ${checkinsOrphaned.length - 10} more`);
  }

  if (!WRITE) {
    console.log(`\nDry run — nothing written. Re-run with --write to apply ${patches.length} update(s).\n`);
    return;
  }

  if (patches.length === 0) {
    console.log("\nNothing to write.\n");
    return;
  }

  /* Firestore caps a batch at 500 writes. `update` rather than `set`, so a
   * field this script does not know about is never dropped.
   *
   * `updatedAt` is deliberately NOT stamped. On a check-in that field is not
   * inert metadata — both dashboards sort "Recent Activity" by
   * `updatedAt || checkInTime` and render it as the activity time — so writing
   * it here would date every backfilled record to the moment the script ran
   * and push real activity out of the feed. This script is restoring a field
   * that should always have been present, not recording an edit. */
  for (let i = 0; i < patches.length; i += 400) {
    const batch = db.batch();
    for (const p of patches.slice(i, i + 400)) {
      batch.update(db.collection(p.collection).doc(p.id), { ...p.data });
    }
    await batch.commit();
  }

  console.log(`\nWrote ${servicePatches.length} service(s) and ${checkinPatches.length} check-in(s).\n`);
}

main().catch((err) => {
  console.error("\nbackfill-checkin-events failed:", err.message, "\n");
  process.exit(1);
});
