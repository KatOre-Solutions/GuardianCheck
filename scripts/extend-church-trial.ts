/**
 * extend-church-trial.ts: move one church's free-trial end date, and with it
 * the date the church locks.
 *
 * SAFE BY DEFAULT: with no flags it only *reports*. Nothing is written unless
 * you pass --write.
 *
 * Usage:
 *   npx tsx scripts/extend-church-trial.ts --church <id> --until 2026-09-21
 *   npx tsx scripts/extend-church-trial.ts --church <id> --until 2026-09-21 --write
 *
 * Why a script and not a console edit
 * -----------------------------------
 * `subscription.trialEndsAt` is a nested field. A hand-edit in the Firebase
 * console is easy to apply to the wrong document, easy to mistype as a
 * non-ISO string that `new Date()` then parses as Invalid Date, and leaves no
 * record of who changed it or why. This prints the before/after, refuses
 * anything it does not recognise, writes exactly one field, and logs an audit
 * row beside it.
 *
 * trialEndsAt and accessUntil
 * ---------------------------
 * `subscription.trialEndsAt` is display only. What locks a church is the
 * root `accessUntil` Timestamp (see src/lib/churchAccess.ts): once it passes,
 * the server and the Firestore rules refuse the church's check-ins and edits.
 *
 * So this writes both. `accessUntil` becomes midnight SAST at the end of
 * --until, and is never moved earlier than it already is unless you pass
 * --allow-shorten: a church that has paid past the new date keeps that access.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { endOfDaySast, getChurchAccess, laterOf, toDate } from "../src/lib/churchAccess";

dotenv.config();

const WRITE = process.argv.includes("--write");
const ALLOW_SHORTEN = process.argv.includes("--allow-shorten");
const argValue = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

const CHURCH_ID = argValue("--church");
const UNTIL = argValue("--until");

if (!CHURCH_ID || !UNTIL) {
  console.error("Both --church <id> and --until <YYYY-MM-DD> are required.");
  process.exit(1);
}

// Parsed strictly. A typo like "2026-19-21" or "21-09-2026" must fail loudly
// here rather than becoming an Invalid Date the UI renders as "Invalid Date".
if (!/^\d{4}-\d{2}-\d{2}$/.test(UNTIL)) {
  console.error(`--until must be YYYY-MM-DD, got "${UNTIL}"`);
  process.exit(1);
}
const target = new Date(`${UNTIL}T00:00:00.000Z`);
if (Number.isNaN(target.getTime())) {
  console.error(`--until is not a real date: "${UNTIL}"`);
  process.exit(1);
}

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
  const ref = db.collection("churches").doc(CHURCH_ID!);
  const doc = await ref.get();

  if (!doc.exists) {
    console.error(`No church document with id "${CHURCH_ID}".`);
    process.exit(1);
  }

  const data = doc.data()!;
  const current = data.subscription?.trialEndsAt ?? null;
  const now = new Date();
  const currentAccessUntil = toDate(data.accessUntil);
  const targetAccessUntil = ALLOW_SHORTEN
    ? endOfDaySast(target)
    : laterOf(currentAccessUntil, endOfDaySast(target))!;

  console.log(`\nChurch          ${data.name}  (${CHURCH_ID})`);
  console.log(`slug            ${data.slug}`);
  console.log(`adminEmail      ${data.adminEmail}`);
  console.log(`status          ${data.status} / subscription.status=${data.subscription?.status}`);
  console.log(`plan            ${data.plan}`);
  console.log(`trialStartedAt  ${data.subscription?.trialStartedAt ?? "(none)"}`);
  console.log(`trialEndsAt     ${current ?? "(none)"}${current && new Date(current) < now ? "   <-- already passed" : ""}`);
  console.log(`accessUntil     ${currentAccessUntil?.toISOString() ?? "(none, unmetered)"}   [${getChurchAccess(data, now).state}]`);
  console.log(`\nwould set       subscription.trialEndsAt = ${target.toISOString()}`);
  console.log(`would set       accessUntil              = ${targetAccessUntil.toISOString()}`);

  if (current && new Date(current) > target) {
    console.log(`\nWARNING: the current end date is LATER than --until. This would SHORTEN the trial.`);
  }
  if (currentAccessUntil && currentAccessUntil > endOfDaySast(target) && !ALLOW_SHORTEN) {
    console.log(`\nNOTE: accessUntil is already later than --until and is kept. Pass --allow-shorten to move it earlier.`);
  }

  if (!WRITE) {
    console.log(`\nDry run. Nothing written. Re-run with --write to apply.\n`);
    return;
  }

  // Dotted path: updates the one nested field and leaves the rest of the
  // subscription map (tier, status, trialStartedAt, any PayFast token)
  // untouched. Writing the whole map would risk dropping a field this script
  // does not know about.
  await ref.update({
    "subscription.trialEndsAt": target.toISOString(),
    accessUntil: Timestamp.fromDate(targetAccessUntil),
    updatedAt: new Date().toISOString(),
  });

  await db.collection("audit_logs").add({
    churchId: CHURCH_ID,
    userId: "script:extend-church-trial",
    action: "trial_extended",
    category: "billing",
    details: {
      from: current,
      to: target.toISOString(),
      accessUntilFrom: currentAccessUntil?.toISOString() ?? null,
      accessUntilTo: targetAccessUntil.toISOString(),
    },
    timestamp: new Date().toISOString(),
    source: "server",
    traceId: null,
  });

  const after = (await ref.get()).data()!;
  console.log(`\nWritten. trialEndsAt is now ${after.subscription?.trialEndsAt}, accessUntil ${toDate(after.accessUntil)?.toISOString()}\n`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
