/**
 * rotate-guardian-qr-tokens.ts — report on, and optionally replace, guardian
 * pickup QR tokens that were minted in the browser.
 *
 * SAFE BY DEFAULT: with no flags it only *reports*. Nothing is written unless
 * you pass --write.
 *
 * Usage:
 *   npx tsx scripts/rotate-guardian-qr-tokens.ts                    # dry run
 *   npx tsx scripts/rotate-guardian-qr-tokens.ts --church <id>      # scope to one church
 *   npx tsx scripts/rotate-guardian-qr-tokens.ts --guardian <id>    # scope to one guardian
 *   npx tsx scripts/rotate-guardian-qr-tokens.ts --write            # apply
 *
 * Why this exists
 * ---------------
 * Tokens used to be generated client-side as
 * `guardian_${Math.random().toString(36).substr(2, 12)}` -- non-cryptographic,
 * and chosen by the browser rather than the server. From the change that added
 * this script, firestore.rules refuses a client-supplied `qrToken` and
 * POST /api/guardians/:id/qr-token mints it with a CSPRNG.
 *
 * That closes the hole for everything new. It does not rewrite what exists,
 * deliberately: rotating a token invalidates every printed and saved copy of
 * that family's QR, so it is a decision with a communications plan attached,
 * not a deploy step. Legacy tokens keep resolving at checkout until someone
 * runs this with --write.
 *
 * `--guardian` exists for the single-family case: someone reports a QR was
 * photographed or shared, and you want that one replaced now. The parent can
 * also do this themselves from their dashboard ("Regenerate").
 *
 * What --write does NOT do: touch a token this system already minted (prefix
 * `gq_`), or any guardian that is deleted. Both are skipped and counted.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { mintGuardianQrToken, isLegacyGuardianToken, isServerMintedToken } from "../guardian-tokens.js";

dotenv.config();

const WRITE = process.argv.includes("--write");
const argValue = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const ONLY_CHURCH = argValue("--church");
const ONLY_GUARDIAN = argValue("--guardian");

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

type Bucket = "legacy" | "missing" | "server-minted" | "unrecognised" | "deleted";

function classify(data: any): Bucket {
  if (data.deleted === true) return "deleted";
  const token = data.qrToken;
  if (!token || typeof token !== "string") return "missing";
  if (isServerMintedToken(token)) return "server-minted";
  if (isLegacyGuardianToken(token)) return "legacy";
  // Neither shape. Hand-edited in the console, or seeded by something else.
  // Rotated by --write alongside legacy: anything not provably server-minted
  // is not provably unguessable.
  return "unrecognised";
}

/** Rotated by --write. `deleted` and `server-minted` are left alone. */
const ROTATABLE: Bucket[] = ["legacy", "missing", "unrecognised"];

async function main() {
  let query: any = db.collection("guardians");
  if (ONLY_CHURCH) query = query.where("churchId", "==", ONLY_CHURCH);

  const snapshot = ONLY_GUARDIAN
    ? { docs: [await db.collection("guardians").doc(ONLY_GUARDIAN).get()].filter((d) => d.exists) }
    : await query.get();

  const perChurch = new Map<string, Record<Bucket, number>>();
  const rotate: Array<{ id: string; churchId: string; bucket: Bucket }> = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (ONLY_CHURCH && data.churchId !== ONLY_CHURCH) continue;

    const churchId = data.churchId || "(no churchId)";
    const bucket = classify(data);

    const counts = perChurch.get(churchId)
      || { legacy: 0, missing: 0, "server-minted": 0, unrecognised: 0, deleted: 0 };
    counts[bucket]++;
    perChurch.set(churchId, counts);

    if (ROTATABLE.includes(bucket)) rotate.push({ id: doc.id, churchId, bucket });
  }

  console.log(`\nGuardian QR tokens — ${WRITE ? "APPLYING" : "dry run, nothing will be written"}`);
  if (ONLY_CHURCH) console.log(`Scoped to church: ${ONLY_CHURCH}`);
  if (ONLY_GUARDIAN) console.log(`Scoped to guardian: ${ONLY_GUARDIAN}`);
  console.log();

  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(`${pad("church", 30)} ${pad("legacy", 8)} ${pad("missing", 8)} ${pad("server", 8)} ${pad("other", 8)} ${pad("deleted", 8)}`);
  console.log("-".repeat(74));
  for (const [churchId, c] of [...perChurch.entries()].sort()) {
    console.log(
      `${pad(churchId.slice(0, 29), 30)} ${pad(String(c.legacy), 8)} ${pad(String(c.missing), 8)} ` +
      `${pad(String(c["server-minted"]), 8)} ${pad(String(c.unrecognised), 8)} ${pad(String(c.deleted), 8)}`
    );
  }

  console.log(`\n${rotate.length} guardian(s) would be rotated (legacy + missing + other).`);

  if (!WRITE) {
    console.log("\nDry run. Re-run with --write to apply.");
    console.log("NOTE: rotating invalidates every printed or saved copy of those QR codes.\n");
    return;
  }

  console.log("\nRotating...");
  let done = 0;
  for (const entry of rotate) {
    const now = new Date().toISOString();
    await db.collection("guardians").doc(entry.id).update({
      qrToken: mintGuardianQrToken(),
      qrTokenIssuedAt: now,
      qrTokenSource: "server",
      updatedAt: now,
    });
    // Mirrors the audit row the endpoint writes, so a bulk rotation is as
    // traceable as a parent tapping "Regenerate". Never logs the token.
    await db.collection("audit_logs").add({
      churchId: entry.churchId,
      userId: "script:rotate-guardian-qr-tokens",
      action: "guardian_qr_token_issued",
      category: "security",
      details: { guardianId: entry.id, reissued: entry.bucket !== "missing", previousSource: entry.bucket },
      timestamp: now,
      source: "server",
      traceId: null,
    });
    done++;
    if (done % 25 === 0) console.log(`  ${done}/${rotate.length}`);
  }

  console.log(`\nRotated ${done} guardian(s).\n`);
}

main().catch((err) => {
  console.error("Rotation failed:", err);
  process.exit(1);
});
