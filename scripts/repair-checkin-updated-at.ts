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
 * A check-in's `updatedAt` is written at three points in its life, and two of
 * them are recoverable from fields still on the record:
 *
 *     checkOutTime || createdAt || checkInTime
 *
 * A record is treated as clobbered when its stored `updatedAt` is *later* than
 * that reconstruction, which is true of everything the backfill touched (it ran
 * long after any of those timestamps) and false of every healthy record, whose
 * `updatedAt` already equals one of them. That makes this idempotent: a second
 * run finds nothing.
 *
 * Every write point was enumerated from the code before trusting that:
 *
 *   - creation      - server `transaction.set`, client `addDocument`/`setDocument`
 *                     write `updatedAt` alongside `createdAt`
 *   - check-out     - all four paths (server `/api/check-out`, the guardian bulk
 *                     checkout, `AdminOverrideModal`, `CheckOutTab`'s offline
 *                     fallback) set `checkOutTime` and `updatedAt` in the *same*
 *                     object, so the two differ by under a millisecond
 *   - room move     - `/api/move-room`, the one path that advances `updatedAt`
 *                     without touching either of the above
 *
 * A room move is therefore the only unrecoverable case - and it leaves a marker.
 * It writes `lastMoveVolunteerId` onto the record, so those rows are identified
 * exactly and SKIPPED rather than guessed at. A record that was moved and later
 * checked out is still exact, because the check-out was the later write.
 *
 * The result: every row this script touches is reconstructed to the millisecond,
 * and every row it cannot reconstruct is left alone and reported.
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

    /* A room move is the one write this cannot reconstruct, and it marks the
     * record. Skip those rather than pulling them back to creation time - an
     * unknown timestamp is not improved by replacing it with a wrong one.
     * Only matters while the record is open: if it was later checked out, the
     * check-out is the later write and `checkOutTime` is exact regardless. */
    if (!row.checkOutTime && row.lastMoveVolunteerId) {
      roomMoved.push(`${row.id} (${row.childName || "?"}) - room-moved, last real value unknown`);
      continue;
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
    console.log(`\n  ${roomMoved.length} open record(s) SKIPPED - a room move was the last write and`);
    console.log(`  its timestamp is unrecoverable. Left exactly as they are:`);
    for (const m of roomMoved.slice(0, 10)) console.log(`    - ${m}`);
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
