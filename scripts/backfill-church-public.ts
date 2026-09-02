/**
 * backfill-church-public.ts — populate and repair the `church_public` mirror.
 *
 * SAFE BY DEFAULT: with no flags it only *reports*. Nothing is written unless
 * you pass --write.
 *
 * Usage:
 *   npx tsx scripts/backfill-church-public.ts            # dry run, shows the plan
 *   npx tsx scripts/backfill-church-public.ts --write    # apply
 *   npx tsx scripts/backfill-church-public.ts --write --prune   # also delete orphans
 *
 * Why this exists
 * ---------------
 * `church_public` holds the three fields a church's landing page needs -- name,
 * slug, branding -- so that `churches`, which carries adminEmail, plan, the
 * subscription map and the PayFast subscription token, never has to be readable
 * by an anonymous visitor.
 *
 * server.ts writes the mirror on registration and on every settings save, so
 * new and edited churches keep themselves in sync. This script is for the two
 * cases that leaves:
 *
 *   1. Backfill. Every church that existed before the mirror did has no public
 *      document, and its landing page will 404 the moment the client switches
 *      over. RUN THIS BEFORE DEPLOYING THAT CLIENT CHANGE.
 *   2. Repair. If a settings write half-failed, or a church was edited by hand
 *      in the console, the mirror drifts. This resets it from `churches`.
 *
 * --prune deletes public documents whose church no longer exists. Left alone
 * they are harmless but they keep a dead slug resolving, so a purged church's
 * URL would still render a name.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// Keep in step with CHURCH_PUBLIC_FIELDS in server.ts. Adding a field here
// publishes it to the internet.
const CHURCH_PUBLIC_FIELDS = ["name", "slug", "branding"] as const;

const WRITE = process.argv.includes("--write");
const PRUNE = process.argv.includes("--prune");

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

/** Identical shape to buildChurchPublic() in server.ts. */
function buildChurchPublic(churchId: string, source: any) {
  const projection: any = { churchId, updatedAt: new Date().toISOString() };
  for (const field of CHURCH_PUBLIC_FIELDS) {
    projection[field] = source?.[field] ?? null;
  }
  return projection;
}

/** Compares only the mirrored fields; updatedAt always differs. */
function isUpToDate(existing: any, desired: any) {
  if (!existing) return false;
  if (existing.churchId !== desired.churchId) return false;
  return CHURCH_PUBLIC_FIELDS.every(
    (f) => JSON.stringify(existing[f] ?? null) === JSON.stringify(desired[f] ?? null)
  );
}

async function main() {
  console.log(`\nbackfill-church-public — ${WRITE ? "WRITE" : "DRY RUN"}${PRUNE ? " --prune" : ""}`);
  console.log(`database: ${firebaseConfig.firestoreDatabaseId}\n`);

  const [churches, publics] = await Promise.all([
    db.collection("churches").get(),
    db.collection("church_public").get(),
  ]);

  const publicById = new Map(publics.docs.map((d) => [d.id, d.data()]));

  const toCreate: any[] = [];
  const toUpdate: any[] = [];
  let unchanged = 0;

  for (const doc of churches.docs) {
    const desired = buildChurchPublic(doc.id, doc.data());
    const existing = publicById.get(doc.id);

    if (!existing) toCreate.push({ id: doc.id, desired, slug: desired.slug });
    else if (!isUpToDate(existing, desired)) toUpdate.push({ id: doc.id, desired, slug: desired.slug });
    else unchanged++;

    // A church with no slug can never be reached by the landing page. Worth
    // seeing rather than silently mirroring a null.
    if (!desired.slug) console.warn(`  !  church ${doc.id} has no slug — its public page cannot resolve`);
  }

  const orphans = publics.docs.filter((d) => !churches.docs.some((c) => c.id === d.id));

  console.log(`churches:        ${churches.size}`);
  console.log(`already correct: ${unchanged}`);
  console.log(`to create:       ${toCreate.length}`);
  console.log(`to update:       ${toUpdate.length}`);
  console.log(`orphaned public: ${orphans.length}${PRUNE ? " (will delete)" : " (use --prune to delete)"}\n`);

  for (const c of toCreate) console.log(`  + ${c.id}  ${c.slug ?? "(no slug)"}`);
  for (const c of toUpdate) console.log(`  ~ ${c.id}  ${c.slug ?? "(no slug)"}`);
  for (const o of orphans) console.log(`  - ${o.id}`);

  if (!WRITE) {
    console.log("\nDry run — nothing written. Re-run with --write to apply.\n");
    return;
  }

  const pending = [...toCreate, ...toUpdate];
  // Firestore caps a batch at 500 writes.
  for (let i = 0; i < pending.length; i += 400) {
    const batch = db.batch();
    for (const c of pending.slice(i, i + 400)) {
      batch.set(db.collection("church_public").doc(c.id), c.desired);
    }
    await batch.commit();
  }

  if (PRUNE && orphans.length > 0) {
    for (let i = 0; i < orphans.length; i += 400) {
      const batch = db.batch();
      for (const o of orphans.slice(i, i + 400)) {
        batch.delete(db.collection("church_public").doc(o.id));
      }
      await batch.commit();
    }
  }

  console.log(`\nWrote ${pending.length} document(s)${PRUNE ? `, deleted ${orphans.length}` : ""}.\n`);
}

main().catch((err) => {
  console.error("\nbackfill-church-public failed:", err.message, "\n");
  process.exit(1);
});
