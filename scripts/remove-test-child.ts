/**
 * Removes one child record created accidentally during debugging on 2026-09-20.
 *
 * children/24f98a9d-9b69-4f4f-b2b7-4522726db625  ("ZZTest ZZTest", Bryanston
 * Methodist Church) was written by a probe of POST /api/children that was meant
 * to be rejected by validation. Zod's .url() accepts a `data:` URI, so the
 * request was accepted and created the row instead.
 *
 * Run once with `npx tsx scripts/remove-test-child.ts`, confirm the output, then
 * delete this file. It touches exactly the two document ids below and runs no
 * queries.
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

function formatPrivateKey(key: string) {
  let privateKey = key.trim();
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) privateKey = privateKey.slice(1, -1);
  return privateKey.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
}

const CHILD_ID = "24f98a9d-9b69-4f4f-b2b7-4522726db625";

async function main() {
  const cfg = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf8")
  );

  if (getApps().length === 0) {
    initializeApp({
      projectId: cfg.projectId,
      credential: cert({
        projectId: cfg.projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        privateKey: formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY!),
      }),
    });
  }

  const db = getFirestore(cfg.firestoreDatabaseId);
  const childRef = db.collection("children").doc(CHILD_ID);
  const medicalRef = db.collection("child_medical").doc(CHILD_ID);

  const before = await childRef.get();
  if (!before.exists) {
    console.log("children/" + CHILD_ID + " is already gone. Nothing to do.");
  } else {
    const data = before.data()!;
    // Refuse to touch anything that is not the known test row.
    if (data.firstName !== "ZZTest" || data.lastName !== "ZZTest") {
      console.error("Refusing to delete: that id does not hold the ZZTest record.");
      console.error("Found instead:", JSON.stringify(data));
      process.exit(1);
    }
    console.log("Deleting:", JSON.stringify(data));
    await childRef.delete();
  }

  await medicalRef.delete();

  console.log("children/" + CHILD_ID + " exists now:", (await childRef.get()).exists);
  console.log("child_medical/" + CHILD_ID + " exists now:", (await medicalRef.get()).exists);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
