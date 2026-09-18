/**
 * Security-rules tests for the church access lock (`churchAccessOpen()`).
 *
 * Run with `npm run test:rules`. Requires the Firestore emulator.
 *
 * A church whose `accessUntil` has passed is locked: its trial or paid period
 * ended without a payment. The lock is a billing measure, not a data deletion,
 * so the suite pins three things:
 *
 *   - DENY: a locked church's members cannot create or change their data.
 *   - ALLOW: they can still read it, and a child already checked in can still
 *     be checked out. A lock that stranded a child in a room would be a
 *     safeguarding failure, not a billing one.
 *   - ALLOW: an open church and an unmetered one (no `accessUntil`) are
 *     untouched, so a rule that denied everything cannot pass this suite.
 */

import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, getDoc, getDocs, deleteDoc, collection, query, where, Timestamp } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const env = await initializeTestEnvironment({
  projectId: "gc-rules-test",
  firestore: {
    rules: readFileSync(path.join(ROOT, "firestore.rules"), "utf8"),
    host: "127.0.0.1",
    port: 8571,
  },
});

const LOCKED = "lockedChurch";
const OPEN = "openChurch";
const UNMETERED = "unmeteredChurch";

const DAY_MS = 24 * 60 * 60 * 1000;
const yesterday = Timestamp.fromMillis(Date.now() - DAY_MS);
const nextWeek = Timestamp.fromMillis(Date.now() + 7 * DAY_MS);
const nextYear = Timestamp.fromMillis(Date.now() + 365 * DAY_MS);

// None of these uids or emails may match the hard-coded master admin in
// `isMasterAdmin()`, or every test would pass for the wrong reason.
const users = {
  adminL:     { uid: "adminL",     email: "al@x.com", role: "admin",     roles: ["admin"],     churchId: LOCKED,    status: "approved" },
  volunteerL: { uid: "volunteerL", email: "vl@x.com", role: "volunteer", roles: ["volunteer"], churchId: LOCKED,    status: "approved" },
  parentL:    { uid: "parentL",    email: "pl@x.com", role: "parent",    roles: ["parent"],    churchId: LOCKED,    status: "approved" },
  adminO:     { uid: "adminO",     email: "ao@x.com", role: "admin",     roles: ["admin"],     churchId: OPEN,      status: "approved" },
  volunteerO: { uid: "volunteerO", email: "vo@x.com", role: "volunteer", roles: ["volunteer"], churchId: OPEN,      status: "approved" },
  parentO:    { uid: "parentO",    email: "po@x.com", role: "parent",    roles: ["parent"],    churchId: OPEN,      status: "approved" },
  adminU:     { uid: "adminU",     email: "au@x.com", role: "admin",     roles: ["admin"],     churchId: UNMETERED, status: "approved" },
};

/** A checkin document that satisfies isValidCheckin(). */
const checkin = (churchId, over = {}) => ({
  childId: `child-${churchId}`,
  childName: "Ayanda Dube",
  roomId: `room-${churchId}`,
  roomName: "Elephants",
  checkInTime: "2026-09-13T09:05:00.000Z",
  status: "checked-in",
  churchId,
  serviceId: `svc-${churchId}`,
  parentId: "parentL",
  createdAt: "2026-09-13T09:05:00.000Z",
  updatedAt: "2026-09-13T09:05:00.000Z",
  ...over,
});

const room = (churchId) => ({ name: "Lions", capacity: "20", minAge: "0", maxAge: "12", churchId });

// A pending invitation that satisfies isValidInvitation(). The invitee has no
// user document: that is the point of an invitation, and it is why the accept
// branch of the rule asks about the invitation's own churchId rather than the
// caller's.
const INVITEE_EMAIL = "invitee@x.com";
const invitation = (churchId) => ({
  email: INVITEE_EMAIL,
  firstName: "Thandi",
  lastName: "Nkosi",
  role: "volunteer",
  churchId,
  status: "pending",
  token: "t".repeat(64),
  expiresAt: "2030-01-01T00:00:00.000Z",
});

/** The invitee's own accept write: the four keys the rule allows them to change. */
const acceptedBy = (uid) => ({
  status: "accepted",
  acceptedAt: "2026-09-15T10:00:00.000Z",
  acceptedBy: uid,
  updatedAt: "2026-09-15T10:00:00.000Z",
});

// Chained after the other suites in `npm run test:rules`; see the note in
// firestore-checkins.test.mjs.
async function clearFirestoreWithRetry(attempts = 5) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await env.clearFirestore();
      return;
    } catch (err) {
      if (i === attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 250 * i));
    }
  }
}

await clearFirestoreWithRetry();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();

  for (const [id, data] of Object.entries(users)) {
    await setDoc(doc(db, "users", id), data);
  }

  await setDoc(doc(db, "churches", LOCKED), { name: "Locked", slug: "locked", status: "trialing", plan: "starter", accessUntil: yesterday });
  await setDoc(doc(db, "churches", OPEN), { name: "Open", slug: "open", status: "trialing", plan: "starter", accessUntil: nextWeek });
  await setDoc(doc(db, "churches", UNMETERED), { name: "Unmetered", slug: "unmetered", status: "active", plan: "starter" });

  for (const churchId of [LOCKED, OPEN]) {
    await setDoc(doc(db, "children", `child-${churchId}`), {
      firstName: "Ayanda", lastName: "Dube", age: 7, churchId,
      parentId: churchId === LOCKED ? "parentL" : "parentO", deleted: false,
    });
    await setDoc(doc(db, "rooms", `room-${churchId}`), room(churchId));
    await setDoc(doc(db, "checkins", `ci-${churchId}`), checkin(churchId));
    await setDoc(doc(db, "invitations", `inv-${churchId}`), invitation(churchId));
  }
});

const as = (uid) => env.authenticatedContext(uid, { email: users[uid]?.email }).firestore();

/** Signed in with an email but no user document, as an invitee is. */
const asInvitee = (uid) => env.authenticatedContext(uid, { email: INVITEE_EMAIL }).firestore();

let pass = 0;
let fail = 0;

async function check(label, mode, fn) {
  try {
    await (mode === "deny" ? assertFails(fn()) : assertSucceeds(fn()));
    console.log(`  PASS  [${mode.toUpperCase()}] ${label}`);
    pass++;
  } catch (e) {
    console.log(`  FAIL  [${mode.toUpperCase()}] ${label}\n        ${String(e.message).split("\n")[0]}`);
    fail++;
  }
}

console.log("\nChurch access lock\n");

// ---------------------------------------------------------------- DENY ----

await check("locked: volunteer cannot create a check-in", "deny", () =>
  setDoc(doc(as("volunteerL"), "checkins", "ciNewLocked"), checkin(LOCKED)));

await check("locked: admin cannot create a room", "deny", () =>
  setDoc(doc(as("adminL"), "rooms", "roomNewLocked"), room(LOCKED)));

await check("locked: admin cannot edit a room", "deny", () =>
  updateDoc(doc(as("adminL"), "rooms", `room-${LOCKED}`), { name: "Tigers" }));

await check("locked: admin cannot delete a room", "deny", () =>
  deleteDoc(doc(as("adminL"), "rooms", `room-${LOCKED}`)));

await check("locked: parent cannot register a child", "deny", () =>
  setDoc(doc(as("parentL"), "children", "childNewLocked"), {
    firstName: "Lwazi", lastName: "Dube", age: 4, churchId: LOCKED, parentId: "parentL",
  }));

await check("locked: parent cannot edit their child", "deny", () =>
  updateDoc(doc(as("parentL"), "children", `child-${LOCKED}`), { allergies: "None" }));

await check("locked: admin cannot create an event", "deny", () =>
  setDoc(doc(as("adminL"), "events", "evLocked"), { name: "Sunday", date: "2026-09-20", churchId: LOCKED }));

await check("locked: admin cannot write church_security", "deny", () =>
  setDoc(doc(as("adminL"), "church_security", LOCKED), { adminOverridePinHash: "x" }));

// The unlock itself must be server-only, or the lock is a suggestion.
await check("locked: admin cannot move accessUntil forward", "deny", () =>
  updateDoc(doc(as("adminL"), "churches", LOCKED), { accessUntil: nextWeek }));

// A different value from the seeded one: rewriting the same value changes no
// keys, and the rules rightly allow a no-op.
await check("open: admin cannot write accessUntil either", "deny", () =>
  updateDoc(doc(as("adminO"), "churches", OPEN), { accessUntil: nextYear }));

// An invitation is the one write whose subject is a church the caller does not
// belong to yet, so it is the one the lock is easiest to miss on. The server
// route checks it too; this pins the rules, which any client can reach directly.
await check("locked: invitee cannot accept an invitation", "deny", () =>
  updateDoc(doc(asInvitee("inviteeL"), "invitations", `inv-${LOCKED}`), acceptedBy("inviteeL")));

await check("locked: admin cannot invite anyone new", "deny", () =>
  setDoc(doc(as("adminL"), "invitations", "invNewLocked"), invitation(LOCKED)));

// --------------------------------------------------------------- ALLOW ----

await check("locked: volunteer still reads the church's children", "allow", () =>
  getDoc(doc(as("volunteerL"), "children", `child-${LOCKED}`)));

await check("locked: volunteer still lists open check-ins (the roster query)", "allow", () =>
  getDocs(query(collection(as("volunteerL"), "checkins"),
    where("churchId", "==", LOCKED), where("status", "==", "checked-in"))));

await check("locked: admin still reads the church document (lock screen)", "allow", () =>
  getDoc(doc(as("adminL"), "churches", LOCKED)));

await check("locked: a child already checked in can still be checked out", "allow", () =>
  updateDoc(doc(as("volunteerL"), "checkins", `ci-${LOCKED}`), { ...checkin(LOCKED), status: "checked-out" }));

await check("open: volunteer creates a check-in", "allow", () =>
  setDoc(doc(as("volunteerO"), "checkins", "ciNewOpen"), checkin(OPEN)));

// The children update rule is the most expensive in the file (it walks the
// role helpers several times), so this is the case most likely to run out of
// expression budget once the access check is added.
await check("open: parent edits their own child", "allow", () =>
  updateDoc(doc(as("parentO"), "children", `child-${OPEN}`), { allergies: "None" }));

await check("open: parent registers a child", "allow", () =>
  setDoc(doc(as("parentO"), "children", "childNewOpen"), {
    firstName: "Lwazi", lastName: "Dube", age: 4, churchId: OPEN, parentId: "parentO",
  }));

await check("open: admin creates a room", "allow", () =>
  setDoc(doc(as("adminO"), "rooms", "roomNewOpen"), room(OPEN)));

await check("open: invitee accepts an invitation", "allow", () =>
  updateDoc(doc(asInvitee("inviteeO"), "invitations", `inv-${OPEN}`), acceptedBy("inviteeO")));

await check("unmetered: admin creates a room", "allow", () =>
  setDoc(doc(as("adminU"), "rooms", "roomNewUnmetered"), room(UNMETERED)));

console.log(`\n${pass} passed, ${fail} failed\n`);

await env.cleanup();
process.exit(fail === 0 ? 0 : 1);
