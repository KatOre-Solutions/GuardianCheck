/**
 * close-stale-services.ts — close services left `active` after their day passed.
 *
 * SAFE BY DEFAULT: with no flags it only *reports*. Nothing is written unless
 * you pass --write.
 *
 * Usage:
 *   npx tsx scripts/close-stale-services.ts                     # dry run, all churches
 *   npx tsx scripts/close-stale-services.ts --church <id>       # scope to one church
 *   npx tsx scripts/close-stale-services.ts --church <id> --write
 *
 * Why a service gets stuck active
 * -------------------------------
 * `activateService` closes whatever was active before it activates the next
 * one, so a church never has two. What nothing does is close the *last* one
 * when its service ends — there is no scheduled job and no end-of-service
 * hook. So the final service a church ever activated stays `active` forever.
 *
 * That matters because `useActiveService` picks the active service with no
 * date test at all:
 *
 *     const active = services.find(s => s.status === "active");
 *
 * The `upcoming` branch immediately below it *is* date-guarded — it requires
 * `s.date === todayStr` and a start time within the hour — but the `active`
 * branch short-circuits before that check is ever reached. So a service left
 * active in August is still "the current service" in September, the server
 * still accepts check-ins against it (it only tests `status === "active"`),
 * and every one of those check-ins is filed under August's event.
 *
 * That is how a check-in taken on 6 September ended up reported under
 * "Sunday Service - August 9, 2026".
 *
 * What this does and does not touch
 * ---------------------------------
 * Only services whose `date` is strictly before today and whose status is
 * `active`. A service dated today is left alone whatever the hour, because a
 * service running late is normal and closing one mid-session would stop
 * volunteers checking children in.
 *
 * Services with no `date` are reported but NOT closed: an undated service
 * cannot be shown to be stale, and this script does not guess.
 *
 * Unlike the event backfill, this stamps `updatedAt`. Closing a service is a
 * real state change, not the restoration of a field that should always have
 * been there — and unlike a check-in's, a service's `updatedAt` is not read
 * back by any view.
 *
 * NOTE: this treats the symptom. The cause is that nothing closes a service
 * when it ends, and that `useActiveService` trusts `status` without checking
 * the date. Until one of those is fixed, this will need running again.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { format } from "date-fns";

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

async function main() {
  const today = format(new Date(), "yyyy-MM-dd");

  console.log(`\nclose-stale-services — ${WRITE ? "WRITE" : "DRY RUN"}`);
  console.log(`database: ${firebaseConfig.firestoreDatabaseId}`);
  console.log(`today:    ${today}`);
  console.log(`scope:    ${ONLY_CHURCH || "all churches"}\n`);

  const [serviceSnap, churchSnap] = await Promise.all([
    db.collection("services").where("status", "==", "active").get(),
    db.collection("churches").get(),
  ]);

  const churches = new Map(churchSnap.docs.map((d) => [d.id, (d.data() as any).name]));

  const active = serviceSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((s) => !s.deleted)
    .filter((s) => (ONLY_CHURCH ? s.churchId === ONLY_CHURCH : true));

  const stale = active.filter((s) => s.date && s.date < today);
  const undated = active.filter((s) => !s.date);
  const current = active.filter((s) => s.date && s.date >= today);

  /* A service whose church no longer exists cannot be reached by anyone, so
   * closing it changes nothing a user can see. Separated out so the count of
   * genuinely live fixes is not inflated by orphans. */
  const label = (s: any) =>
    churches.has(s.churchId) ? `${churches.get(s.churchId)}` : `ORPHAN church ${s.churchId} (no church document)`;

  console.log(`active services in scope: ${active.length}`);
  console.log(`  stale (date < today)  : ${stale.length}`);
  console.log(`  dated today or later  : ${current.length}  (left alone)`);
  console.log(`  undated               : ${undated.length}  (reported, not closed)\n`);

  for (const s of stale) {
    console.log(`  ~ ${s.id}`);
    console.log(`      ${s.name || "unnamed"}  dated ${s.date}  (${s.eventName || "no event"})`);
    console.log(`      ${label(s)}`);
  }

  for (const s of undated) {
    console.log(`  ! ${s.id}  ${s.name || "unnamed"} — no date, cannot be shown stale. Left alone.`);
    console.log(`      ${label(s)}`);
  }

  for (const s of current) {
    console.log(`  = ${s.id}  ${s.name || "unnamed"} dated ${s.date} — current, left alone.`);
  }

  if (!WRITE) {
    console.log(`\nDry run — nothing written. Re-run with --write to close ${stale.length} service(s).\n`);
    return;
  }

  if (stale.length === 0) {
    console.log("\nNothing to close.\n");
    return;
  }

  for (let i = 0; i < stale.length; i += 400) {
    const batch = db.batch();
    for (const s of stale.slice(i, i + 400)) {
      batch.update(db.collection("services").doc(s.id), {
        status: "closed",
        updatedAt: new Date().toISOString(),
      });
    }
    await batch.commit();
  }

  console.log(`\nClosed ${stale.length} stale service(s).\n`);
}

main().catch((err) => {
  console.error("\nclose-stale-services failed:", err.message, "\n");
  process.exit(1);
});
