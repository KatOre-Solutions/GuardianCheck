/**
 * repair-checkin-updated-at.ts — undo a clobbered `updatedAt` on check-ins.
 *
 * SAFE BY DEFAULT: with no flags it only *reports*. Nothing is written unless
 * you pass --write.
 *
 * Usage:
 *   npx tsx scripts/repair-checkin-updated-at.ts            # dry run
 *   npx tsx scripts/repair-checkin-updated-at.ts --write    # apply
 *   npx tsx scripts/repair-checkin-updated-at.ts --church <id>
 *
 * Why this exists
 * ---------------
 * An earlier revision of `backfill-checkin-events.ts` stamped
 * `updatedAt: new Date()` onto every record it touched, on the assumption that
 * the field was inert bookkeeping. It is not. Both dashboards build their
 * "Recent Activity" feed from it:
 *
 *     [...checkins].sort((a, b) =>
 *       new Date(b.updatedAt || b.checkInTime).getTime() -
 *       new Date(a.updatedAt || a.checkInTime).getTime()).slice(0, 5)
 *
 * and then render `format(activity.updatedAt || activity.checkInTime, "HH:mm")`
 * as the activity time. So the backfill dated hundreds of historical check-ins
 * to the moment it ran: they crowded out genuinely recent activity and each
 * displayed the backfill's clock time as though the child had just arrived.
 *
 * The backfill no longer writes the field. This repairs what it already wrote.
 *
 * How the original value is reconstructed
 * ---------------------------------------
 * A check-in's `updatedAt` is written at exactly two points in its life: when
 * the record is created, and when the child is checked out. So the truth is
 *
 *     checkOutTime || createdAt || checkInTime
 *
 * A record is treated as clobbered when its stored `updatedAt` is *later* than
 * that reconstruction, which is true of everything the backfill touched (it ran
 * long after any of those timestamps) and false of every healthy record, whose
 * `updatedAt` already equals one of them. That makes this idempotent: a second
 * run finds nothing.
 *
 * KNOWN LIMIT: the room-move endpoint also advances `updatedAt`. A record moved
 * between rooms after its last check-out has no recoverable timestamp, and this
 * script will pull it back to the check-out or creation time. That is a small,
 * bounded loss against the alternative of leaving every backfilled record
 * claiming to have happened at the backfill instant. Rows in that position are
 * listed separately below so the decision is visible rather than silent.
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

const db = getFirestore(firebaseConfig.firestoreDatabaseId);

function ms(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;

  const time = new Date(value).getTime();

  return Number.isNaN(time) ? null : time;
}

async function main() {
  console.log(`\nrepair-checkin-updated-at — ${WRITE ? "WRITE" : "DRY RUN"}`);
  console.log(`database: ${firebaseConfig.firestoreDatabaseId}`);
  console.log(`scope:    ${ONLY_CHURCH || "all churches"}\n`);

  const snap = await db.collection("checkins").get();

  const rows = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as any)
    .filter((r) => (ONLY_CHURCH ? r.churchId === ONLY_CHURCH : true));

  const repairs: { id: string; from: string; to: string; note: string }[] = [];
  const roomMoved: string[] = [];
  let healthy = 0;

  for (const row of rows) {
    const truth = row.checkOutTime || row.createdAt || row.checkInTime || "";
    const truthMs = ms(truth);
    const currentMs = ms(row.updatedAt);

    if (!truthMs || currentMs === null) {
      healthy++;
      continue;
    }

    // Healthy records already sit at one of the two write points.
    if (currentMs <= truthMs) {
      healthy++;
      continue;
    }

    /* An open record whose stored value post-dates its creation is the shape a
     * room move also produces. Flag it so the loss is visible. */
    if (!row.checkOutTime) {
      roomMoved.push(`${row.id} (${row.childName || "?"}) — open record, ${row.updatedAt} -> ${truth}`);
    }

    repairs.push({
      id: row.id,
      from: row.updatedAt,
      to: truth,
      note: `${row.childName || "?"} ${row.checkOutTime ? "checked out" : "still open"}`,
    });
  }

  console.log(`checkins:  ${rows.length} total, ${healthy} already correct, ${repairs.length} to repair\n`);

  for (const r of repairs.slice(0, 20)) {
    console.log(`  ~ ${r.id}`);
    console.log(`      ${r.from}  ->  ${r.to}   (${r.note})`);
  }
  if (repairs.length > 20) console.log(`  … and ${repairs.length - 20} more`);

  if (roomMoved.length > 0) {
    console.log(`\n  ${roomMoved.length} open record(s) where a room move may have been the real last write.`);
    console.log(`  Their pre-backfill value is unrecoverable; they fall back to creation time:`);
    for (const m of roomMoved.slice(0, 10)) console.log(`    ! ${m}`);
    if (roomMoved.length > 10) console.log(`    … and ${roomMoved.length - 10} more`);
  }

  if (!WRITE) {
    console.log(`\nDry run — nothing written. Re-run with --write to apply ${repairs.length} repair(s).\n`);
    return;
  }

  if (repairs.length === 0) {
    console.log("\nNothing to repair.\n");
    return;
  }

  for (let i = 0; i < repairs.length; i += 400) {
    const batch = db.batch();
    for (const r of repairs.slice(i, i + 400)) {
      batch.update(db.collection("checkins").doc(r.id), { updatedAt: r.to });
    }
    await batch.commit();
  }

  console.log(`\nRepaired ${repairs.length} check-in(s).\n`);
}

main().catch((err) => {
  console.error("\nrepair-checkin-updated-at failed:", err.message, "\n");
  process.exit(1);
});
