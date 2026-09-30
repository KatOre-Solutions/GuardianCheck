/**
 * Staged migration of private Firebase download URLs to Storage paths.
 * Dry run by default. Never revokes download tokens or deletes objects.
 * Run only after the server and client changes are deployed and verified.
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { parsePrivateImagePath, privateImagePathFromReference } from "../src/lib/privateStorageAccess";

type FirestoreEntry = { target: "firestore"; collection: string; id: string; field: "photoUrl" | "photoURL"; before: string; after: string };
type AuthEntry = { target: "auth"; uid: string; before: string; after: null };
type Entry = FirestoreEntry | AuthEntry;
type Backup = { projectId: string; databaseId: string; createdAt: string; entries: Entry[] };

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const config = JSON.parse(readFileSync(path.join(root, "firebase-applet-config.json"), "utf8"));
const args = process.argv.slice(2);
const write = args.includes("--write");
const rollback = args.includes("--rollback");
const acknowledged = args.includes("--ack-deployed");
const backupArgIndex = args.indexOf("--backup");
const backupPath = backupArgIndex >= 0 ? args[backupArgIndex + 1] : undefined;

if ((write || rollback) && (!acknowledged || !backupPath || !path.isAbsolute(backupPath))) {
  throw new Error("Writes require --ack-deployed and --backup with an absolute path outside this repository");
}
if (backupPath && path.resolve(backupPath).toLowerCase().startsWith(root.toLowerCase() + path.sep)) {
  throw new Error("The sensitive backup must be outside this repository");
}
if (write && rollback) throw new Error("Choose --write or --rollback");

const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const credential = process.env.FIREBASE_CLIENT_EMAIL && privateKey
  ? cert({ projectId: config.projectId, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey })
  : undefined;
const app = initializeApp({ projectId: config.projectId, credential });
const db = getFirestore(app, config.firestoreDatabaseId);
const auth = getAuth(app);

if (rollback) {
  const backup = JSON.parse(readFileSync(backupPath!, "utf8")) as Backup;
  if (backup.projectId !== config.projectId || backup.databaseId !== config.firestoreDatabaseId) {
    throw new Error("Backup project or database does not match");
  }
  let restored = 0;
  for (const entry of backup.entries) {
    if (entry.target === "firestore") {
      const reference = db.collection(entry.collection).doc(entry.id);
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw new Error("Firestore rollback conflict");
        if (snapshot.get(entry.field) === entry.before) return;
        if (snapshot.get(entry.field) !== entry.after) throw new Error("Firestore rollback conflict");
        transaction.update(reference, { [entry.field]: entry.before });
      });
    } else {
      const user = await auth.getUser(entry.uid);
      if (user.photoURL === entry.before) continue;
      if (user.photoURL != null) throw new Error("Auth rollback conflict");
      await auth.updateUser(entry.uid, { photoURL: entry.before });
    }
    restored++;
  }
  console.log(JSON.stringify({ mode: "rollback", restored }));
} else {
  const entries: Entry[] = [];
  let mismatched = 0;
  for (const collection of ["users", "children", "guardians"] as const) {
    const snapshot = await db.collection(collection).get();
    for (const doc of snapshot.docs) {
      for (const field of ["photoUrl", "photoURL"] as const) {
        const before = doc.get(field);
        if (typeof before !== "string" || !before.includes("firebasestorage.googleapis.com")) continue;
        const objectPath = privateImagePathFromReference(before, config.storageBucket);
        if (!objectPath) continue;
        const target = parsePrivateImagePath(objectPath)!;
        const expectedOwner = collection === "users" ? doc.id : doc.get("parentId");
        const kindMatches = collection === "users" ? target.kind === "profiles"
          : collection === "children" ? target.kind === "children"
          : target.kind === "guardians" || target.kind === "profiles";
        if (!kindMatches || target.ownerUid !== expectedOwner || (target.churchId && target.churchId !== doc.get("churchId"))) {
          mismatched++;
          continue;
        }
        entries.push({ target: "firestore", collection, id: doc.id, field, before, after: `storage://${objectPath}` });
      }
    }
  }

  let nextPageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, nextPageToken);
    for (const user of page.users) {
      const before = user.photoURL;
      if (!before || !before.includes("firebasestorage.googleapis.com")) continue;
      const objectPath = privateImagePathFromReference(before, config.storageBucket);
      if (!objectPath) continue;
      const target = parsePrivateImagePath(objectPath)!;
      if (target.kind !== "profiles" || target.ownerUid !== user.uid) {
        mismatched++;
        continue;
      }
      entries.push({ target: "auth", uid: user.uid, before, after: null });
    }
    nextPageToken = page.pageToken;
  } while (nextPageToken);

  const counts = {
    firestore: entries.filter((entry) => entry.target === "firestore").length,
    auth: entries.filter((entry) => entry.target === "auth").length,
    mismatched,
  };
  console.log(JSON.stringify({ mode: write ? "write" : "dry-run", ...counts }));
  if (write) {
    if (mismatched) throw new Error("Unresolved reference ownership mismatches. No writes made");
    const backup: Backup = { projectId: config.projectId, databaseId: config.firestoreDatabaseId, createdAt: new Date().toISOString(), entries };
    writeFileSync(backupPath!, JSON.stringify(backup), { flag: "wx", mode: 0o600 });
    let updated = 0;
    for (const entry of entries) {
      if (entry.target === "firestore") {
        const reference = db.collection(entry.collection).doc(entry.id);
        await db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(reference);
          if (!snapshot.exists || snapshot.get(entry.field) !== entry.before) throw new Error("Firestore migration conflict");
          transaction.update(reference, { [entry.field]: entry.after });
        });
      } else {
        const user = await auth.getUser(entry.uid);
        if (user.photoURL !== entry.before) throw new Error("Auth migration conflict");
        await auth.updateUser(entry.uid, { photoURL: null });
      }
      updated++;
    }
    console.log(JSON.stringify({ mode: "write-complete", updated }));
  }
}
