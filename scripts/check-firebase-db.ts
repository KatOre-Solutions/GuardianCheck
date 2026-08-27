/**
 * Asserts that `firebase.json` deploys rules to the database the app reads.
 *
 *   npm run check:firebase-db     # runs as part of `npm run build`
 *
 * Why this exists (#75): `firebase deploy --only firestore:rules` reported
 * success while writing to a database nothing reads. The single-database form
 *
 *   "firestore": { "rules": "firestore.rules" }
 *
 * targets `(default)`, and this project does not use `(default)` -- the client
 * (`src/lib/firebase.ts`) and the Admin SDK (`server.ts`) both connect to the
 * named database in `firebase-applet-config.json`. So the #68 privilege-
 * escalation fix and the #65 field allowlist were merged, closed, and never
 * enforced: a green deploy that changed nothing and removed the reason to look
 * again.
 *
 * There is no CLI flag to pick the database for a rules deploy -- it is driven
 * entirely by `firebase.json`. That makes the file the single point of failure,
 * and the database ID now lives in two committed files that can drift apart.
 * This is what makes that drift loud instead of silent.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FIREBASE_JSON = path.join(ROOT, "firebase.json");
const APP_CONFIG = path.join(ROOT, "firebase-applet-config.json");

function fail(message: string): never {
  console.error(`check:firebase-db -- ${message}\n`);
  process.exit(1);
}

const firebaseConfig = JSON.parse(readFileSync(FIREBASE_JSON, "utf8"));
const appConfig = JSON.parse(readFileSync(APP_CONFIG, "utf8"));

const expected = appConfig.firestoreDatabaseId;

if (!expected) {
  fail(
    "firebase-applet-config.json has no `firestoreDatabaseId`.\n" +
      "If the app has genuinely moved to the (default) database, this check " +
      "and firebase.json both need rewriting deliberately -- not bypassing.",
  );
}

const firestore = firebaseConfig.firestore;

// The object form is the bug this check exists to prevent, so name it exactly.
if (!Array.isArray(firestore)) {
  fail(
    "firebase.json uses the single-database `firestore` object form, which " +
      `deploys rules to (default).\nThe app reads ${expected}, so the rules ` +
      "would deploy successfully and protect nothing.\n\n" +
      "Use the array form:\n" +
      `  "firestore": [{ "database": "${expected}", "rules": "firestore.rules" }]`,
  );
}

if (firestore.length === 0) {
  fail("firebase.json has an empty `firestore` array -- no rules would deploy at all.");
}

const targets = firestore.map((entry: { database?: string }) => entry.database);
const missing = targets.some((database: string | undefined) => !database);

if (missing) {
  fail(
    "A `firestore` entry in firebase.json has no `database` key, which means " +
      `(default).\nThe app reads ${expected}.`,
  );
}

if (!targets.includes(expected)) {
  fail(
    `firebase.json deploys rules to ${targets.join(", ")}, but the app reads ` +
      `${expected}.\n(firestoreDatabaseId in firebase-applet-config.json is the ` +
      "source of truth -- it is what src/lib/firebase.ts and server.ts pass to " +
      "Firestore.)\n\nUpdate the `database` key in firebase.json to match.",
  );
}

for (const entry of firestore as Array<{ database: string; rules?: string }>) {
  if (!entry.rules) {
    fail(`The firebase.json entry for ${entry.database} has no \`rules\` key.`);
  }
  if (!existsSync(path.join(ROOT, entry.rules))) {
    fail(
      `firebase.json points ${entry.database} at ${entry.rules}, which does not ` +
        "exist. The deploy would fail, or worse, ship nothing.",
    );
  }
}

console.log(`firebase.json: rules target ${expected} (matches the app)`);
