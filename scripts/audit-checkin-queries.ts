/**
 * audit-checkin-queries.ts — the pre-flight for bounding the check-in stream.
 *
 * READ ONLY. Writes nothing, ever. There is no --write flag.
 *
 *   npx tsx scripts/audit-checkin-queries.ts
 *   npx tsx scripts/audit-checkin-queries.ts --church <churchId>
 *
 * ## Why this has to run before the query change
 *
 * The dashboard is about to stop streaming every check-in a church has ever
 * produced and start asking for a date window instead. Two things have to be
 * true for that to be safe, and neither is safe to assume:
 *
 * 1. **Every timestamp is the same type.** `checkInTime` is written as an ISO
 *    8601 string (`new Date().toISOString()`), and fixed-width UTC ISO strings
 *    sort lexicographically in chronological order, so `where("checkInTime",
 *    ">=", iso)` is a valid range query. But Firestore orders by *type* first:
 *    a single record holding a real `Timestamp` would sort outside the string
 *    range entirely and simply vanish from the dashboard, with no error.
 *
 *    That is not hypothetical here. `repair-checkin-updated-at.ts` exists
 *    because an earlier backfill stamped `updatedAt: new Date()` — a genuine
 *    Timestamp — onto hundreds of historical records.
 *
 * 2. **The composite indexes those queries need exist.** A missing index makes
 *    the query fail rather than return wrong data, which is the better failure
 *    — but `subscribeToCollection` swallowed subscription errors, so in this
 *    app it has been showing up as a permanently empty list instead. This
 *    script runs each planned query shape once and reports what came back.
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
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

  /* Not the (default) database. Same resolution as server.ts, or every read
   * comes back 5 NOT_FOUND. */
  return getFirestore(getApps()[0], firebaseConfig.firestoreDatabaseId || "(default)");
}

/** What a value is, for the purposes of a range query. */
function kindOf(value: unknown): string {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (value instanceof Timestamp) return "Timestamp";
  if (value instanceof Date) return "Date";
  if (typeof value === "number") return "number";
  if (typeof value === "string") {
    // The shape toISOString() produces: fixed width, UTC, millisecond precision.
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
      ? "iso-string"
      : "other-string";
  }
  return typeof value;
}

const TIMESTAMP_FIELDS = ["checkInTime", "checkOutTime", "updatedAt", "createdAt"] as const;

async function main() {
  const churchArgIndex = process.argv.indexOf("--church");
  const churchFilter = churchArgIndex > -1 ? process.argv[churchArgIndex + 1] : null;

  const db = init();

  console.log("\n=== check-in timestamp audit (read only) ===\n");

  let query: FirebaseFirestore.Query = db.collection("checkins");
  if (churchFilter) query = query.where("churchId", "==", churchFilter);

  const snapshot = await query.get();
  console.log(`${snapshot.size} check-in document(s)${churchFilter ? ` for church ${churchFilter}` : " across all churches"}\n`);

  const kinds: Record<string, Record<string, number>> = {};
  const offenders: { id: string; field: string; kind: string; value: string }[] = [];
  const churches = new Set<string>();
  let oldest: string | null = null;
  let newest: string | null = null;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    churches.add(data.churchId || "(none)");

    for (const field of TIMESTAMP_FIELDS) {
      const kind = kindOf(data[field]);
      kinds[field] = kinds[field] || {};
      kinds[field][kind] = (kinds[field][kind] || 0) + 1;

      // checkInTime and updatedAt are the two the new queries range over, so a
      // non-string there is what would silently drop a record.
      if ((field === "checkInTime" || field === "updatedAt") && !["iso-string", "missing", "null"].includes(kind)) {
        offenders.push({ id: doc.id, field, kind, value: String(data[field]) });
      }
    }

    const t = data.checkInTime;
    if (typeof t === "string") {
      if (!oldest || t < oldest) oldest = t;
      if (!newest || t > newest) newest = t;
    }
  }

  for (const field of TIMESTAMP_FIELDS) {
    const counts = kinds[field] || {};
    const summary = Object.entries(counts)
      .map(([kind, n]) => `${kind}: ${n}`)
      .join(", ");
    console.log(`  ${field.padEnd(14)} ${summary || "(no documents)"}`);
  }

  console.log(`\n  churches represented: ${churches.size}`);
  console.log(`  oldest checkInTime:   ${oldest ?? "n/a"}`);
  console.log(`  newest checkInTime:   ${newest ?? "n/a"}`);

  if (offenders.length > 0) {
    console.log(`\n  ⛔ ${offenders.length} record(s) whose checkInTime/updatedAt is not an ISO string.`);
    console.log("     A string range query orders by type first, so these would be");
    console.log("     silently excluded from the dashboard. Fix the data before");
    console.log("     shipping bounded queries.\n");
    for (const o of offenders.slice(0, 20)) {
      console.log(`       ${o.id}  ${o.field}=${o.kind}  ${o.value.slice(0, 40)}`);
    }
    if (offenders.length > 20) console.log(`       ... and ${offenders.length - 20} more`);
  } else {
    console.log("\n  ✅ every checkInTime and updatedAt is an ISO string of uniform shape.");
    console.log("     Lexicographic order matches chronological order, so a string");
    console.log("     range query on these fields is safe.");
  }

  // ---------------------------------------------------------------- indexes

  console.log("\n=== composite-index probe ===\n");

  const sampleChurch = churchFilter || snapshot.docs[0]?.data().churchId;
  if (!sampleChurch) {
    console.log("  no check-ins to probe with.");
    return;
  }

  const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const probes: { name: string; run: () => Promise<FirebaseFirestore.QuerySnapshot> }[] = [
    {
      name: "churchId + status (roster; equality only)",
      run: () =>
        db.collection("checkins").where("churchId", "==", sampleChurch).where("status", "==", "checked-in").limit(1).get(),
    },
    {
      name: "churchId + checkInTime >= (the 7/30/90 window)",
      run: () =>
        db.collection("checkins").where("churchId", "==", sampleChurch).where("checkInTime", ">=", windowStart).limit(1).get(),
    },
    {
      name: "churchId + updatedAt >= (recent activity)",
      run: () =>
        db.collection("checkins").where("churchId", "==", sampleChurch).where("updatedAt", ">=", windowStart).limit(1).get(),
    },
    {
      name: "churchId + childId + orderBy(checkInTime desc) (ChildDetailsModal)",
      run: () =>
        db
          .collection("checkins")
          .where("churchId", "==", sampleChurch)
          .where("childId", "==", snapshot.docs[0]?.data().childId || "none")
          .orderBy("checkInTime", "desc")
          .limit(5)
          .get(),
    },
  ];

  for (const probe of probes) {
    try {
      const result = await probe.run();
      console.log(`  ✅ ${probe.name} — ${result.size} doc(s)`);
    } catch (error: any) {
      const needsIndex = error?.code === 9 || /requires an index/i.test(error?.message || "");
      console.log(`  ${needsIndex ? "⛔ NEEDS INDEX" : "⛔ FAILED"}: ${probe.name}`);
      console.log(`       ${String(error?.message || error).split("\n")[0].slice(0, 200)}`);
    }
  }

  console.log("");
}

main().catch((error) => {
  console.error("audit failed:", error);
  process.exit(1);
});
