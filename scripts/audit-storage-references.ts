/** Read-only inventory. Prints counts only, never image URLs, tokens, or names. */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { parsePrivateImagePath, privateImagePathFromReference } from "../src/lib/privateStorageAccess";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config = JSON.parse(readFileSync(path.join(root, "firebase-applet-config.json"), "utf8"));
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const credential = process.env.FIREBASE_CLIENT_EMAIL && privateKey
  ? cert({ projectId: config.projectId, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey })
  : undefined;
const app = initializeApp({ projectId: config.projectId, storageBucket: config.storageBucket, credential });
const db = getFirestore(app, config.firestoreDatabaseId);

type Count = Record<string, number>;
const report: Record<string, Count> = {};

function count(group: string, value: unknown) {
  const counts = report[group] ??= {};
  let category = "empty";
  if (typeof value === "string" && value) {
    if (value.startsWith("storage://")) {
      category = parsePrivateImagePath(value.slice(10)) ? "privatePath" : "otherPath";
    } else if (value.includes("firebasestorage.googleapis.com")) {
      category = privateImagePathFromReference(value, config.storageBucket) ? "privateTokenUrl" : "otherFirebaseUrl";
    } else {
      category = "externalUrl";
    }
  }
  counts[category] = (counts[category] || 0) + 1;
}

for (const collectionName of ["users", "children", "guardians"]) {
  const snapshot = await db.collection(collectionName).get();
  report[collectionName] = { documents: snapshot.size };
  for (const doc of snapshot.docs) {
    count(`${collectionName}.photoUrl`, doc.get("photoUrl"));
    count(`${collectionName}.photoURL`, doc.get("photoURL"));
  }
}

for (const collectionName of ["churches", "church_public"]) {
  const snapshot = await db.collection(collectionName).get();
  report[collectionName] = { documents: snapshot.size };
  for (const doc of snapshot.docs) count(`${collectionName}.branding.logoUrl`, doc.get("branding.logoUrl"));
}

let nextPageToken: string | undefined;
do {
  const page = await getAuth(app).listUsers(1000, nextPageToken);
  for (const user of page.users) count("auth.photoURL", user.photoURL);
  nextPageToken = page.pageToken;
} while (nextPageToken);

console.log(JSON.stringify({ projectId: config.projectId, databaseId: config.firestoreDatabaseId, report }, null, 2));
