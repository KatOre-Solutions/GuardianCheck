/**
 * report-phone-numbers.ts — audit `guardians.phone` and `users.cellNumber`
 * for E.164 readiness.
 *
 * SAFE BY DEFAULT: with no flags it only *reports*. Nothing is written
 * unless you pass --write, and even then only the "normalizable" bucket is
 * ever touched -- see below.
 *
 * Usage:
 *   npx tsx scripts/report-phone-numbers.ts            # dry run, shows the report
 *   npx tsx scripts/report-phone-numbers.ts --write     # normalize what's safe to normalize
 *
 * Why this exists
 * ----------------
 * Neither field has ever been E.164: `guardians.phone` is unvalidated free
 * text (the add-guardian form's `pattern="[0-9]*"` even forbade a leading
 * "+", until this PR), and `users.cellNumber` mixes local "082..." and
 * "+2782..." forms plus sentinel placeholders ("Account Holder" from a
 * guardian record, "0000000000" from SetupWizard's demo data). None of it
 * is dialable by a programmatic channel. See
 * docs/whatsapp-communication-plan.md sections 1 and 12.
 *
 * classifyPhone() (src/lib/phone.ts, shared with the client-side form
 * validation this PR also adds) buckets every value into:
 *
 *   valid            already E.164 -- nothing to do
 *   normalizable     parses under the church's likely country (default ZA)
 *                    but isn't E.164 yet -- e.g. a local "082..." number.
 *                    THE ONLY BUCKET --write TOUCHES.
 *   sentinel         a known placeholder ("Account Holder", "0000000000",
 *                    ...) -- never written, regardless of --write
 *   needs-user-action digits that could plausibly be a real number missing
 *                    a country code -- a migration should not guess which
 *                    country; flagged for a human to resolve
 *   invalid          empty or not phone-shaped at all -- never written
 *
 * This intentionally does not guess a per-church country. Every church in
 * this deployment is South African today, so `ZA` is the default; if that
 * stops being true, classify per-church before trusting the normalizable
 * bucket.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { classifyPhone, type PhoneCategory } from "../src/lib/phone";

dotenv.config();

const WRITE = process.argv.includes("--write");

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

interface Row {
  collection: string;
  id: string;
  field: string;
  raw: string;
  category: PhoneCategory;
  e164?: string;
}

async function classifyCollection(collection: string, field: string): Promise<Row[]> {
  const snap = await db.collection(collection).get();
  const rows: Row[] = [];

  for (const doc of snap.docs) {
    const raw = doc.data()?.[field];
    if (raw === undefined) continue; // field not present at all -- not this report's concern
    const { category, e164 } = classifyPhone(raw);
    rows.push({ collection, id: doc.id, field, raw: String(raw), category, e164 });
  }

  return rows;
}

function summarize(rows: Row[]) {
  const counts: Record<PhoneCategory, number> = { valid: 0, normalizable: 0, invalid: 0, sentinel: 0, "needs-user-action": 0 };
  for (const r of rows) counts[r.category]++;
  return counts;
}

async function main() {
  console.log(`\nreport-phone-numbers — ${WRITE ? "WRITE (normalizable only)" : "DRY RUN"}`);
  console.log(`database: ${firebaseConfig.firestoreDatabaseId}\n`);

  const [guardianRows, userRows] = await Promise.all([
    classifyCollection("guardians", "phone"),
    classifyCollection("users", "cellNumber"),
  ]);

  for (const [label, rows] of [["guardians.phone", guardianRows], ["users.cellNumber", userRows]] as const) {
    const counts = summarize(rows);
    console.log(`${label} — ${rows.length} document(s) with a value`);
    console.log(`  valid:              ${counts.valid}`);
    console.log(`  normalizable:       ${counts.normalizable}`);
    console.log(`  sentinel:           ${counts.sentinel}`);
    console.log(`  needs-user-action:  ${counts["needs-user-action"]}`);
    console.log(`  invalid:            ${counts.invalid}\n`);

    for (const r of rows.filter((r) => r.category === "normalizable")) {
      console.log(`    ~ [${r.collection}/${r.id}] "${r.raw}" -> "${r.e164}"`);
    }
    for (const r of rows.filter((r) => r.category === "needs-user-action")) {
      console.log(`    ? [${r.collection}/${r.id}] "${r.raw}" -- ambiguous, needs a human`);
    }
    for (const r of rows.filter((r) => r.category === "sentinel")) {
      console.log(`    # [${r.collection}/${r.id}] "${r.raw}" -- placeholder, will not be touched`);
    }
    for (const r of rows.filter((r) => r.category === "invalid")) {
      console.log(`    ! [${r.collection}/${r.id}] "${r.raw}" -- not phone-shaped`);
    }
    console.log("");
  }

  const toWrite = [...guardianRows, ...userRows].filter((r) => r.category === "normalizable");

  if (!WRITE) {
    console.log(`Dry run — nothing written. ${toWrite.length} record(s) would be normalized with --write.\n`);
    return;
  }

  if (toWrite.length === 0) {
    console.log("Nothing to normalize.\n");
    return;
  }

  // Firestore caps a batch at 500 writes.
  for (let i = 0; i < toWrite.length; i += 400) {
    const batch = db.batch();
    for (const r of toWrite.slice(i, i + 400)) {
      batch.update(db.collection(r.collection).doc(r.id), { [r.field]: r.e164 });
    }
    await batch.commit();
  }

  console.log(`\nNormalized ${toWrite.length} record(s). Sentinel, invalid and needs-user-action records were left untouched.\n`);
}

main().catch((err) => {
  console.error("\nreport-phone-numbers failed:", err.message, "\n");
  process.exit(1);
});
