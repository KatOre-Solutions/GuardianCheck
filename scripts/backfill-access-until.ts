/**
 * backfill-access-until.ts: give existing churches an `accessUntil`, so the
 * trial lockout applies to them too.
 *
 * SAFE BY DEFAULT: with no flags it only reports what it would write. Nothing
 * is written unless you pass --write.
 *
 * Usage:
 *   npx tsx scripts/backfill-access-until.ts
 *   npx tsx scripts/backfill-access-until.ts --notice-days 14 --write
 *   npx tsx scripts/backfill-access-until.ts --church <id> --write
 *
 * Why a notice period
 * -------------------
 * Churches registered before the lockout existed were never told their trial
 * would end in anything more than a banner. Several are already past
 * `trialEndsAt`, and giving them an `accessUntil` equal to that date would
 * lock them the moment this runs. So no church is given a date earlier than
 * --notice-days from now (default 14): long enough to email them first.
 *
 * What each church gets
 * ---------------------
 *   already has accessUntil   skipped, never overwritten
 *   trialing                  trial end, or the notice date if later
 *   active, has paid          next billing date plus grace, or the notice date if later
 *   active, never paid        skipped: a manual activation from the master
 *                             admin dashboard, left unmetered on purpose
 *   anything else             the notice date, flagged REVIEW for a human
 *
 * Run before or after deploying the rules. A church without the field is
 * unmetered, so the order cannot lock anyone early.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { addDays } from "date-fns";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { accessUntilForBillingDate, endOfDaySast, laterOf, toDate } from "../src/lib/churchAccess";

dotenv.config();

const WRITE = process.argv.includes("--write");
const argValue = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

const ONLY_CHURCH = argValue("--church");
const NOTICE_DAYS = Number(argValue("--notice-days") ?? 14);

if (!Number.isInteger(NOTICE_DAYS) || NOTICE_DAYS < 0) {
  console.error(`--notice-days must be a whole number of days, got "${argValue("--notice-days")}"`);
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

type Plan = { action: "set"; accessUntil: Date; reason: string; review?: boolean } | { action: "skip"; reason: string };

function planFor(data: FirebaseFirestore.DocumentData, noticeDate: Date): Plan {
  if (data.accessUntil != null) {
    return { action: "skip", reason: `already set (${toDate(data.accessUntil)?.toISOString()})` };
  }

  if (data.status === "trialing") {
    const trialEnd = toDate(data.subscription?.trialEndsAt);
    return {
      action: "set",
      accessUntil: laterOf(trialEnd ? endOfDaySast(trialEnd) : null, noticeDate)!,
      reason: trialEnd ? `trial ended/ends ${trialEnd.toISOString()}` : "trialing with no trialEndsAt",
    };
  }

  if (data.status === "active") {
    if (!data.lastPaymentDate) {
      return { action: "skip", reason: "active with no payment: manual activation, left unmetered" };
    }
    const nextBilling = toDate(data.nextBillingDate) ?? toDate(data.subscription?.billingDate);
    return {
      action: "set",
      accessUntil: laterOf(nextBilling ? accessUntilForBillingDate(nextBilling) : null, noticeDate)!,
      reason: nextBilling ? `paid, next billing ${nextBilling.toISOString()}` : "paid, no next billing date",
      review: !nextBilling,
    };
  }

  return { action: "set", accessUntil: noticeDate, reason: `status "${data.status}"`, review: true };
}

async function main() {
  const now = new Date();
  const noticeDate = endOfDaySast(addDays(now, NOTICE_DAYS));

  const docs = ONLY_CHURCH
    ? [await db.collection("churches").doc(ONLY_CHURCH).get()].filter((d) => d.exists)
    : (await db.collection("churches").get()).docs;

  if (docs.length === 0) {
    console.error(ONLY_CHURCH ? `No church document with id "${ONLY_CHURCH}".` : "No churches found.");
    process.exit(1);
  }

  console.log(`\nNotice date     ${noticeDate.toISOString()}  (${NOTICE_DAYS} days)`);
  console.log(`Mode            ${WRITE ? "WRITE" : "dry run"}\n`);

  let written = 0;
  for (const doc of docs) {
    const data = doc.data()!;
    const plan = planFor(data, noticeDate);
    const label = `${data.name ?? "(no name)"}  (${doc.id})`;

    if (plan.action === "skip") {
      console.log(`SKIP    ${label}\n        ${plan.reason}`);
      continue;
    }

    console.log(`${plan.review ? "REVIEW" : "SET   "}  ${label}\n        ${plan.reason}\n        accessUntil = ${plan.accessUntil.toISOString()}`);

    if (!WRITE) continue;

    // Dotted update of one field: the rest of the document, including any
    // PayFast token, is left exactly as it was.
    await doc.ref.update({
      accessUntil: Timestamp.fromDate(plan.accessUntil),
      updatedAt: now.toISOString(),
    });
    await db.collection("audit_logs").add({
      churchId: doc.id,
      userId: "script:backfill-access-until",
      action: "access_until_backfilled",
      category: "billing",
      details: { accessUntil: plan.accessUntil.toISOString(), reason: plan.reason, noticeDays: NOTICE_DAYS },
      timestamp: now.toISOString(),
      source: "server",
      traceId: null,
    });
    written++;
  }

  console.log(WRITE ? `\nWritten: ${written} church(es).\n` : `\nDry run. Nothing written. Re-run with --write to apply.\n`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
