/** Read-only signing preflight. Reports metadata and HTTP status, never image bytes or URLs. */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { privateImagePathFromReference } from "../src/lib/privateStorageAccess";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config = JSON.parse(readFileSync(path.join(root, "firebase-applet-config.json"), "utf8"));
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const credential = process.env.FIREBASE_CLIENT_EMAIL && privateKey
  ? cert({ projectId: config.projectId, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey })
  : undefined;
const app = initializeApp({ projectId: config.projectId, storageBucket: config.storageBucket, credential });
const db = getFirestore(app, config.firestoreDatabaseId);

const churches = await db.collection("churches").get();
const normalized = (value: unknown) => typeof value === "string" ? value.replace(/\s+/g, "").toLowerCase() : "";
const testChurches = churches.docs.filter((doc) =>
  [doc.id, doc.get("name"), doc.get("slug")].some((value) => normalized(value) === "123testchurch"));
if (testChurches.length !== 1) throw new Error("123TestChurch could not be resolved uniquely; no image was tested");
const testChurchId = testChurches[0].id;

let objectPath: string | null = null;
let kind: string | null = null;
for (const collectionName of ["users", "children", "guardians"]) {
  const snapshot = await db.collection(collectionName).where("churchId", "==", testChurchId).get();
  for (const doc of snapshot.docs) {
    for (const field of ["photoUrl", "photoURL"]) {
      const reference = doc.get(field);
      if (typeof reference !== "string") continue;
      objectPath = privateImagePathFromReference(reference, config.storageBucket);
      if (objectPath) {
        kind = collectionName;
        break;
      }
    }
    if (objectPath) break;
  }
  if (objectPath) break;
}
if (!objectPath) throw new Error("No private Firebase image reference found for signing preflight");

try {
  const file = getStorage(app).bucket(config.storageBucket).file(objectPath);
  const [metadata] = await file.getMetadata();
  const [signedUrl] = await file.getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 60_000, responseDisposition: "inline" });
  const response = await fetch(signedUrl, { headers: { Range: "bytes=0-0" } });
  await response.body?.cancel();
  console.log(JSON.stringify({ kind, metadataFound: true, contentType: metadata.contentType, signedReadStatus: response.status }));
  if (!response.ok) process.exitCode = 1;
} catch (error: any) {
  console.error(JSON.stringify({ kind, preflight: "failed", code: error?.code ?? "unknown", reason: error?.errors?.[0]?.reason ?? "unknown" }));
  process.exitCode = 1;
}
