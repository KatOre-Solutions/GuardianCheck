/**
 * Read-only diagnostic for the "Quick Setup Wizard will not go away" problem.
 *
 * `AdminDashboard` renders the wizard whenever `!churchData?.setupCompleted`,
 * so an established church that is missing (or has a falsy) `setupCompleted`
 * gets the wizard on top of its dashboard on every load. This prints the
 * fields that decide that, for every church or for one slug.
 *
 * Usage:
 *   npx tsx scripts/inspect-church-setup.ts            # all churches
 *   npx tsx scripts/inspect-church-setup.ts randmeth   # one slug
 *
 * Writes nothing.
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
  if (privateKey.startsWith("'") && privateKey.endsWith("'")) privateKey = privateKey.slice(1, -1);
  privateKey = privateKey.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
  if (!privateKey.includes("-----BEGIN PRIVATE KEY-----")) {
    const rawKey = privateKey.replace(/\s/g, "");
    let formattedKey = "-----BEGIN PRIVATE KEY-----\n";
    for (let i = 0; i < rawKey.length; i += 64) {
      formattedKey += rawKey.substring(i, i + 64) + "\n";
    }
    formattedKey += "-----END PRIVATE KEY-----";
    privateKey = formattedKey;
  }
  return privateKey;
}

function init() {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

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

  /* The app does not use the (default) database -- see the rules-deploy issue.
   * Same resolution as server.ts, or every read comes back 5 NOT_FOUND. */
  return getFirestore(getApps()[0], firebaseConfig.firestoreDatabaseId || "(default)");
}

async function main() {
  const slugFilter = process.argv[2];
  const db = init();

  const snapshot = await db.collection("churches").get();

  console.log(`\n${snapshot.size} church document(s)\n`);

  for (const doc of snapshot.docs) {
    const data = doc.data();

    if (slugFilter && data.slug !== slugFilter) continue;

    const [rooms, services, children] = await Promise.all([
      db.collection("rooms").where("churchId", "==", doc.id).get(),
      db.collection("services").where("churchId", "==", doc.id).get(),
      db.collection("children").where("churchId", "==", doc.id).get(),
    ]);

    console.log(`--- ${data.name ?? "(unnamed)"}  [slug: ${data.slug ?? "-"}]`);
    console.log(`    id             : ${doc.id}`);
    console.log(`    setupCompleted : ${JSON.stringify(data.setupCompleted)}  <-- wizard shows when falsy`);
    console.log(`    status         : ${JSON.stringify(data.status)}`);
    console.log(`    plan           : ${JSON.stringify(data.plan)}`);
    console.log(`    adminEmail     : ${JSON.stringify(data.adminEmail)}`);
    console.log(`    createdAt      : ${JSON.stringify(data.createdAt)}`);
    console.log(`    updatedAt      : ${JSON.stringify(data.updatedAt)}`);
    console.log(`    rooms/services/children: ${rooms.size} / ${services.size} / ${children.size}`);
    console.log("");
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
