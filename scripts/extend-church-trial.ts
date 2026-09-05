/**
 * extend-church-trial.ts — move one church's free-trial end date.
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
 * What trialEndsAt actually does today
 * ------------------------------------
 * Nothing, functionally. No middleware in server.ts consults it and no
 * route refuses service on it -- `PLAN_LIMITS` caps user and child *counts*,
 * not dates. The field is read in three places, all display:
 *
 *   - MasterAdminDashboard.tsx -- red "Trial Expired" badge once the date passes
 *   - AdminDashboard.tsx       -- "Your trial ends on <date>" banner to the church admin
 *   - ChurchSettings.tsx       -- "Trial Ends" row
 *
 * So an expired trial is a display and billing-conversation problem, not a
 * lockout. Worth keeping in mind before treating a passed date as an outage.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const WRITE = process.argv.includes("--write");
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

  console.log(`\nChurch          ${data.name}  (${CHURCH_ID})`);
  console.log(`slug            ${data.slug}`);
  console.log(`adminEmail      ${data.adminEmail}`);
  console.log(`status          ${data.status} / subscription.status=${data.subscription?.status}`);
  console.log(`plan            ${data.plan}`);
  console.log(`trialStartedAt  ${data.subscription?.trialStartedAt ?? "(none)"}`);
  console.log(`trialEndsAt     ${current ?? "(none)"}${current && new Date(current) < now ? "   <-- already passed" : ""}`);
  console.log(`\nwould set       subscription.trialEndsAt = ${target.toISOString()}`);

  if (current && new Date(current) > target) {
    console.log(`\nWARNING: the current end date is LATER than --until. This would SHORTEN the trial.`);
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
    updatedAt: new Date().toISOString(),
  });

  await db.collection("audit_logs").add({
    churchId: CHURCH_ID,
    userId: "script:extend-church-trial",
    action: "trial_extended",
    category: "billing",
    details: { from: current, to: target.toISOString() },
    timestamp: new Date().toISOString(),
    source: "server",
    traceId: null,
  });

  const after = (await ref.get()).data()!.subscription?.trialEndsAt;
  console.log(`\nWritten. trialEndsAt is now ${after}\n`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
