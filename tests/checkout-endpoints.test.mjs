/**
 * Tests for the guardian-QR checkout endpoints.
 *
 * Run with `npm run test:checkout`. Needs no emulator and no Firebase --
 * plain express + a fake in-memory Firestore, both cheap enough to model.
 *
 * These exist because /api/check-out never verified that the guardian named in
 * the request was allowed to collect the child. It took `guardianId` and
 * `guardianName` from the request body and wrote them straight into the pickup
 * record, so any authenticated volunteer could release any child in their
 * church to any name they typed. The guardian<->child check lived only in the
 * browser, where it decides nothing an attacker has to respect.
 *
 * /api/guardian-lookup and /api/check-out-guardian move that decision to the
 * server: the scanned QR token is re-resolved at commit time and the child must
 * appear in that guardian's childIds inside the same transaction that flips the
 * status. The properties worth protecting, and what pins each one down:
 *
 *   - a token from another church resolves to nothing        (CROSS_CHURCH)
 *   - a deactivated guardian cannot collect                  (INACTIVE_GUARDIAN)
 *   - eligibility is server-decided, not client-supplied     (ELIGIBLE_*)
 *   - a child outside childIds is refused even if requested  (NOT_AUTHORIZED)
 *   - one sibling's failure does not abort the family        (PARTIAL)
 *   - repeating a checkout is benign, not an error           (IDEMPOTENT)
 *   - the guardian written to the record comes from the doc  (SERVER_DERIVED)
 *
 * The express app below mirrors the real handlers rather than importing them,
 * because server.ts initialises Firebase on import. SOURCE_GUARD at the end
 * asserts server.ts still matches what is modelled here.
 */

import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let pass = 0;
let fail = 0;

const check = (name, expected, actual) => {
  const ok = expected === actual;
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "} ${name}${ok ? "" : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`);
};

// --- Fixtures --------------------------------------------------------------

const CHURCH_A = "church-a";
const CHURCH_B = "church-b";

const TOKEN_MOM = "guardian_mom00000001";
const TOKEN_GRAN = "guardian_gran0000002";   // deactivated
const TOKEN_OTHER = "guardian_other000003";  // belongs to church B
const TOKEN_NOPHOTO = "guardian_nophoto0004"; // active, but no photo on file

/** What the server expects a volunteer to assert for a guardian with a photo. */
const PHOTO_OK = "photo-confirmed";
/** ...and for one without. */
const NO_PHOTO_OK = "no-photo-acknowledged";

/** Fresh state per test so ordering never matters. */
function seed() {
  return {
    guardians: {
      // g_mom has a photo on file; g_nophoto deliberately does not -- the
      // identityCheck the server requires differs between the two.
      g_mom: { id: "g_mom", churchId: CHURCH_A, qrToken: TOKEN_MOM, active: true, firstName: "Naledi", lastName: "Mokoena", relationship: "Parent", photoUrl: "https://storage.example/naledi.jpg", childIds: ["c_amahle", "c_bongani", "c_chipo"] },
      g_nophoto: { id: "g_nophoto", churchId: CHURCH_A, qrToken: TOKEN_NOPHOTO, active: true, firstName: "Sipho", lastName: "Ndlovu", relationship: "Uncle", childIds: ["c_amahle"] },
      g_gran: { id: "g_gran", churchId: CHURCH_A, qrToken: TOKEN_GRAN, active: false, firstName: "Gogo", lastName: "Mokoena", relationship: "Grandparent", childIds: ["c_amahle"] },
      g_other: { id: "g_other", churchId: CHURCH_B, qrToken: TOKEN_OTHER, active: true, firstName: "Someone", lastName: "Else", relationship: "Parent", childIds: ["c_amahle"] },
    },
    children: {
      c_amahle: { churchId: CHURCH_A, firstName: "Amahle", lastName: "Mokoena" },
      c_bongani: { churchId: CHURCH_A, firstName: "Bongani", lastName: "Mokoena" },
      c_chipo: { churchId: CHURCH_A, firstName: "Chipo", lastName: "Mokoena" },
      c_stranger: { churchId: CHURCH_A, firstName: "Stranger", lastName: "Child" },
    },
    checkins: {
      // Amahle and Bongani are in; Chipo never checked in today.
      ci_amahle: { churchId: CHURCH_A, childId: "c_amahle", childName: "Amahle Mokoena", roomName: "Elephants", checkInTime: "2026-09-02T09:05:00.000Z", status: "checked-in" },
      ci_bongani: { churchId: CHURCH_A, childId: "c_bongani", childName: "Bongani Mokoena", roomName: "Giraffes", checkInTime: "2026-09-02T09:07:00.000Z", status: "checked-in" },
      // Not one of this guardian's children.
      ci_stranger: { churchId: CHURCH_A, childId: "c_stranger", childName: "Stranger Child", roomName: "Elephants", checkInTime: "2026-09-02T09:01:00.000Z", status: "checked-in" },
      // Already collected earlier in the service.
      ci_closed: { churchId: CHURCH_A, childId: "c_chipo", childName: "Chipo Mokoena", roomName: "Lions", checkInTime: "2026-09-02T08:55:00.000Z", status: "checked-out" },
    },
    audit: [],
  };
}

// --- The real wiring, modelled ---------------------------------------------

// Verbatim from server.ts.
const keyGenerator = (req) => req.user?.uid || ipKeyGenerator(req.ip);

function makeApp(db) {
  const app = express();
  app.use(express.json());

  const peakLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    keyGenerator,
    message: { error: "System busy, please try again in a few minutes." },
  });

  // Stub: the bearer token is "<uid>:<churchId>".
  const authenticateToken = (req, res, next) => {
    const header = req.headers.authorization || "";
    const raw = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!raw.includes(":")) return res.status(401).json({ error: "Unauthorized" });
    const [uid, churchId] = raw.split(":");
    req.user = { uid, churchId, role: "volunteer", firstName: "Thandi", lastName: "Volunteer" };
    next();
  };
  const requirePolicyAcceptance = (_req, _res, next) => next();
  const requireVolunteer = (req, res, next) =>
    ["volunteer", "admin", "master_admin"].includes(req.user?.role)
      ? next()
      : res.status(403).json({ error: "Forbidden" });

  // --- handlers, mirroring server.ts ---------------------------------------

  const resolveGuardianByToken = (churchId, qrToken) => {
    const matches = Object.values(db.guardians).filter(
      (g) => g.churchId === churchId && g.qrToken === qrToken,
    );
    if (matches.length !== 1) return null;
    const g = matches[0];
    if (g.deleted === true || g.active !== true) return null;
    return {
      ...g,
      photoUrl: g.photoUrl || g.photoURL || null,
      childIds: Array.isArray(g.childIds) ? g.childIds : [],
    };
  };

  const guardianDisplayName = (g) => `${g.firstName || ""} ${g.lastName || ""}`.trim() || "Guardian";

  app.post("/api/guardian-lookup", authenticateToken, peakLimiter, requirePolicyAcceptance, requireVolunteer, (req, res) => {
    const { qrToken } = req.body;
    if (typeof qrToken !== "string" || qrToken.length < 8) {
      return res.status(400).json({ error: "Validation failed" });
    }
    const { churchId } = req.user;
    const guardian = resolveGuardianByToken(churchId, qrToken);
    if (!guardian) {
      return res.status(404).json({ error: "Guardian not found or not active", code: "GUARDIAN_NOT_FOUND" });
    }

    const eligible = [];
    const checkedInChildIds = new Set();
    for (const [checkinId, c] of Object.entries(db.checkins)) {
      if (c.churchId !== churchId || c.status !== "checked-in") continue;
      if (!guardian.childIds.includes(c.childId)) continue;
      checkedInChildIds.add(c.childId);
      eligible.push({ checkinId, childId: c.childId, childName: c.childName, roomName: c.roomName, checkInTime: c.checkInTime });
    }

    const notCheckedIn = guardian.childIds
      .filter((id) => !checkedInChildIds.has(id))
      .map((id) => {
        const child = db.children[id];
        if (!child || child.churchId !== churchId || child.deleted === true) return null;
        return { childId: id, childName: `${child.firstName} ${child.lastName}`.trim() };
      })
      .filter(Boolean);

    res.json({
      guardian: {
        id: guardian.id,
        firstName: guardian.firstName,
        lastName: guardian.lastName,
        relationship: guardian.relationship,
        photoUrl: guardian.photoUrl,
      },
      eligible,
      notCheckedIn,
    });
  });

  app.post("/api/check-out-guardian", authenticateToken, peakLimiter, requirePolicyAcceptance, requireVolunteer, (req, res) => {
    const { qrToken, checkinIds, identityCheck } = req.body;
    if (typeof qrToken !== "string" || qrToken.length < 8 || !Array.isArray(checkinIds) || checkinIds.length < 1 || checkinIds.length > 20) {
      return res.status(400).json({ error: "Validation failed" });
    }
    // Zod's enum, modelled: an absent or unrecognised value never reaches the
    // handler in the real server.
    if (identityCheck !== "photo-confirmed" && identityCheck !== "no-photo-acknowledged") {
      return res.status(400).json({ error: "Validation failed" });
    }
    const { churchId } = req.user;
    const guardian = resolveGuardianByToken(churchId, qrToken);
    if (!guardian) {
      return res.status(404).json({ error: "Guardian not found or not active", code: "GUARDIAN_NOT_FOUND" });
    }

    // The assertion must match the record. Checked before anything is
    // released -- see the same block in server.ts.
    const hasPhoto = !!guardian.photoUrl;
    const expected = hasPhoto ? "photo-confirmed" : "no-photo-acknowledged";
    if (identityCheck !== expected) {
      return res.status(400).json({ error: "Identity check mismatch", code: "IDENTITY_CHECK_MISMATCH", expected });
    }

    const guardianName = guardianDisplayName(guardian);
    const results = [];

    for (const checkinId of Array.from(new Set(checkinIds))) {
      const c = db.checkins[checkinId];
      if (!c || c.churchId !== churchId) {
        results.push({ checkinId, childName: null, outcome: "not-found" });
        continue;
      }
      if (!guardian.childIds.includes(c.childId)) {
        results.push({ checkinId, childName: c.childName, outcome: "not-authorized" });
        continue;
      }
      if (c.status !== "checked-in") {
        results.push({ checkinId, childName: c.childName, outcome: "already-checked-out" });
        continue;
      }
      Object.assign(c, {
        status: "checked-out",
        checkOutTime: new Date().toISOString(),
        checkOutVolunteerId: req.user.uid,
        checkOutVolunteerName: `${req.user.firstName} ${req.user.lastName}`,
        guardianId: guardian.id,
        guardianName,
        identityCheck,
        overrideReason: null,
      });
      results.push({ checkinId, childName: c.childName, outcome: "checked-out" });
    }

    const countOf = (name) => results.filter((r) => r.outcome === name).length;
    const summary = {
      requested: results.length,
      checkedOut: countOf("checked-out"),
      alreadyOut: countOf("already-checked-out"),
      failed: countOf("not-authorized") + countOf("not-found") + countOf("error"),
    };

    db.audit.push({ action: "guardian_checkout", guardianId: guardian.id, source: "server", identityCheck, guardianHadPhoto: hasPhoto, results, summary });
    res.json({ results, summary });
  });

  return app;
}

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, "127.0.0.1", () => resolve(server));
});

const post = async (server, route, body, auth) => {
  const res = await fetch(`http://127.0.0.1:${server.address().port}${route}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
};

const VOLUNTEER_A = `vol1:${CHURCH_A}`;
const VOLUNTEER_A2 = `vol2:${CHURCH_A}`;
const VOLUNTEER_B = `vol3:${CHURCH_B}`;

console.log("\nGuardian-QR checkout endpoints\n");

// --- Lookup ---------------------------------------------------------------

{
  const db = seed();
  const server = await listen(makeApp(db));

  const ok = await post(server, "/api/guardian-lookup", { qrToken: TOKEN_MOM }, VOLUNTEER_A);
  check("lookup returns the guardian", "Naledi", ok.data?.guardian?.firstName);
  check("eligible lists only checked-in children of this guardian", "ci_amahle,ci_bongani",
    (ok.data?.eligible || []).map((e) => e.checkinId).sort().join(","));
  check("a child of this guardian who is not checked in is reported separately", "Chipo Mokoena",
    (ok.data?.notCheckedIn || []).map((c) => c.childName).join(","));
  check("another family's checked-in child is not eligible", false,
    (ok.data?.eligible || []).some((e) => e.checkinId === "ci_stranger"));
  check("an already-collected child is not eligible", false,
    (ok.data?.eligible || []).some((e) => e.checkinId === "ci_closed"));

  // CROSS_CHURCH: church B's token must not resolve for a church A volunteer,
  // and vice versa -- tenancy comes from the verified token, not the request.
  const foreign = await post(server, "/api/guardian-lookup", { qrToken: TOKEN_OTHER }, VOLUNTEER_A);
  check("a guardian token from another church is not found", 404, foreign.status);
  const reverse = await post(server, "/api/guardian-lookup", { qrToken: TOKEN_MOM }, VOLUNTEER_B);
  check("this church's token does not resolve for another church's volunteer", 404, reverse.status);

  // INACTIVE_GUARDIAN: deactivation is the only revocation the product has, so
  // it has to actually revoke.
  const inactive = await post(server, "/api/guardian-lookup", { qrToken: TOKEN_GRAN }, VOLUNTEER_A);
  check("a deactivated guardian is not found", 404, inactive.status);
  check("...and is not distinguishable from an unknown token", "GUARDIAN_NOT_FOUND", inactive.data?.code);

  const anon = await post(server, "/api/guardian-lookup", { qrToken: TOKEN_MOM }, null);
  check("unauthenticated lookup is rejected", 401, anon.status);

  const short = await post(server, "/api/guardian-lookup", { qrToken: "x" }, VOLUNTEER_A);
  check("a malformed token is rejected before any lookup", 400, short.status);

  // The volunteer app needs the guardian's photo to run the identity check at
  // all. It goes only to the authenticated volunteer client -- never into an
  // email, a WhatsApp payload, or any unauthenticated response.
  check("lookup returns the guardian's photo for the identity check",
    "https://storage.example/naledi.jpg", ok.data?.guardian?.photoUrl);
  const noPhoto = await post(server, "/api/guardian-lookup", { qrToken: TOKEN_NOPHOTO }, VOLUNTEER_A);
  check("a guardian with no photo reports null rather than omitting the field", null,
    noPhoto.data?.guardian?.photoUrl);

  server.close();
}

// --- Identity check -------------------------------------------------------
//
// IDENTITY_CHECK: before this existed, a scanned token plus any volunteer
// session released a child -- the QR was in practice a bearer credential and
// the "visual confirmation" the product advertised was implemented nowhere.
// The server cannot verify a face; what it enforces is that the volunteer's
// assertion was made and is consistent with the guardian record, and that the
// answer is recorded either way.

{
  const db = seed();
  const server = await listen(makeApp(db));

  const missing = await post(server, "/api/check-out-guardian",
    { qrToken: TOKEN_MOM, checkinIds: ["ci_amahle"] }, VOLUNTEER_A);
  check("a checkout with no identityCheck is rejected", 400, missing.status);
  check("...and the child stays checked in", "checked-in", db.checkins.ci_amahle.status);

  const bogus = await post(server, "/api/check-out-guardian",
    { qrToken: TOKEN_MOM, checkinIds: ["ci_amahle"], identityCheck: "sure-whatever" }, VOLUNTEER_A);
  check("an unrecognised identityCheck value is rejected", 400, bogus.status);

  // The mismatch cases are the point: a client cannot just always send the
  // stronger-looking value, because for a guardian with no photo it is not a
  // possible honest answer -- and vice versa.
  const wrongForPhoto = await post(server, "/api/check-out-guardian",
    { qrToken: TOKEN_MOM, checkinIds: ["ci_amahle"], identityCheck: NO_PHOTO_OK }, VOLUNTEER_A);
  check("claiming 'no photo' for a guardian who has one is refused", 400, wrongForPhoto.status);
  check("...with a distinguishable code", "IDENTITY_CHECK_MISMATCH", wrongForPhoto.data?.code);
  check("...naming what was expected", PHOTO_OK, wrongForPhoto.data?.expected);
  check("...and nothing is released", "checked-in", db.checkins.ci_amahle.status);

  const wrongForNoPhoto = await post(server, "/api/check-out-guardian",
    { qrToken: TOKEN_NOPHOTO, checkinIds: ["ci_amahle"], identityCheck: PHOTO_OK }, VOLUNTEER_A);
  check("claiming a photo match for a guardian with no photo is refused", 400, wrongForNoPhoto.status);
  check("...naming what was expected", NO_PHOTO_OK, wrongForNoPhoto.data?.expected);
  check("...and nothing is released", "checked-in", db.checkins.ci_amahle.status);

  // Nothing was refused for lack of authorisation here, so no audit row should
  // exist: a rejected assertion is not a pickup attempt worth recording as one.
  check("a rejected identity check writes no checkout audit row", 0, db.audit.length);

  server.close();
}

{
  // The two honest paths, and what each leaves behind.
  const db = seed();
  const server = await listen(makeApp(db));

  const withPhoto = await post(server, "/api/check-out-guardian",
    { qrToken: TOKEN_MOM, checkinIds: ["ci_amahle"], identityCheck: PHOTO_OK }, VOLUNTEER_A);
  check("photo-confirmed against a guardian with a photo succeeds", 200, withPhoto.status);
  check("the assertion is recorded on the pickup record", PHOTO_OK, db.checkins.ci_amahle.identityCheck);
  check("...and in the audit trail", PHOTO_OK, db.audit[0]?.identityCheck);
  check("...alongside whether a photo existed at all", true, db.audit[0]?.guardianHadPhoto);

  // Passing the identity check does not widen who may collect whom: the
  // childIds authorisation is a separate gate and still applies. g_nophoto is
  // linked to c_amahle only, so Bongani must still be refused.
  const outsideChildIds = await post(server, "/api/check-out-guardian",
    { qrToken: TOKEN_NOPHOTO, checkinIds: ["ci_bongani"], identityCheck: NO_PHOTO_OK }, VOLUNTEER_A);
  check("a satisfied identity check does not bypass the childIds check", "not-authorized",
    outsideChildIds.data?.results?.[0]?.outcome);
  check("...and that child stays checked in", "checked-in", db.checkins.ci_bongani.status);

  server.close();
}

{
  // The weaker path is countable: a church seeing many of these has guardians
  // without photos, which is a gap in their own data they can close.
  const db = seed();
  db.guardians.g_nophoto.childIds = ["c_amahle"];
  const server = await listen(makeApp(db));

  const res = await post(server, "/api/check-out-guardian",
    { qrToken: TOKEN_NOPHOTO, checkinIds: ["ci_amahle"], identityCheck: NO_PHOTO_OK }, VOLUNTEER_A);
  check("no-photo-acknowledged against a photoless guardian succeeds", 200, res.status);
  check("the weaker assertion is recorded as such", NO_PHOTO_OK, db.checkins.ci_amahle.identityCheck);
  check("...and the audit says no photo existed", false, db.audit[0]?.guardianHadPhoto);

  server.close();
}

// --- Checkout -------------------------------------------------------------

{
  const db = seed();
  const server = await listen(makeApp(db));

  const res = await post(server, "/api/check-out-guardian",
    { qrToken: TOKEN_MOM, checkinIds: ["ci_amahle", "ci_bongani"] , identityCheck: PHOTO_OK }, VOLUNTEER_A);
  check("checking out two siblings succeeds", 200, res.status);
  check("both are checked out", 2, res.data?.summary?.checkedOut);
  check("Amahle's record is closed", "checked-out", db.checkins.ci_amahle.status);

  // SERVER_DERIVED: the name on the permanent pickup record comes from the
  // guardian document, never from the request body.
  check("the guardian on the record is resolved server-side", "g_mom", db.checkins.ci_amahle.guardianId);
  check("...including the display name", "Naledi Mokoena", db.checkins.ci_amahle.guardianName);
  check("an audit entry is written server-side", "guardian_checkout", db.audit[0]?.action);

  // IDEMPOTENT: a double tap or a retry must not read as a failure mid-queue.
  const again = await post(server, "/api/check-out-guardian",
    { qrToken: TOKEN_MOM, checkinIds: ["ci_amahle"] , identityCheck: PHOTO_OK }, VOLUNTEER_A);
  check("repeating a checkout is benign, not an error", 200, again.status);
  check("...and is reported as already checked out", "already-checked-out", again.data?.results?.[0]?.outcome);

  server.close();
}

{
  // NOT_AUTHORIZED: the decisive test. The client asks for a child this
  // guardian has no claim to; the server must refuse that child specifically.
  const db = seed();
  const server = await listen(makeApp(db));

  const res = await post(server, "/api/check-out-guardian",
    { qrToken: TOKEN_MOM, checkinIds: ["ci_stranger"] , identityCheck: PHOTO_OK }, VOLUNTEER_A);
  check("a child outside the guardian's childIds is refused", "not-authorized", res.data?.results?.[0]?.outcome);
  check("...and stays checked in", "checked-in", db.checkins.ci_stranger.status);

  // PARTIAL: one refusal must not abort the siblings who are legitimately
  // being collected -- an all-or-nothing batch would stall the queue.
  const mixed = await post(server, "/api/check-out-guardian",
    { qrToken: TOKEN_MOM, checkinIds: ["ci_amahle", "ci_stranger", "ci_bongani"] , identityCheck: PHOTO_OK }, VOLUNTEER_A);
  check("a refused child does not abort the rest of the family", 2, mixed.data?.summary?.checkedOut);
  check("...and the refusal is still reported", 1, mixed.data?.summary?.failed);
  check("Bongani was still released", "checked-out", db.checkins.ci_bongani.status);

  server.close();
}

{
  const db = seed();
  const server = await listen(makeApp(db));

  // A guardian deactivated between the lookup and the confirm tap cannot
  // collect: the token is re-resolved at commit time, so the lookup grants
  // nothing on its own.
  db.guardians.g_mom.active = false;
  const res = await post(server, "/api/check-out-guardian",
    { qrToken: TOKEN_MOM, checkinIds: ["ci_amahle"] , identityCheck: PHOTO_OK }, VOLUNTEER_A);
  check("a guardian deactivated after lookup cannot check out", 404, res.status);
  check("...and the child stays checked in", "checked-in", db.checkins.ci_amahle.status);

  server.close();
}

{
  const db = seed();
  const server = await listen(makeApp(db));

  const foreign = await post(server, "/api/check-out-guardian",
    { qrToken: TOKEN_MOM, checkinIds: ["ci_amahle"] , identityCheck: PHOTO_OK }, VOLUNTEER_B);
  check("a volunteer from another church cannot use this token", 404, foreign.status);
  check("...and the child stays checked in", "checked-in", db.checkins.ci_amahle.status);

  const anon = await post(server, "/api/check-out-guardian",
    { qrToken: TOKEN_MOM, checkinIds: ["ci_amahle"] , identityCheck: PHOTO_OK }, null);
  check("unauthenticated checkout is rejected", 401, anon.status);

  const empty = await post(server, "/api/check-out-guardian",
    { qrToken: TOKEN_MOM, checkinIds: [] , identityCheck: PHOTO_OK }, VOLUNTEER_A);
  check("an empty checkinIds list is rejected", 400, empty.status);

  const huge = await post(server, "/api/check-out-guardian",
    { qrToken: TOKEN_MOM, checkinIds: Array.from({ length: 21 , identityCheck: PHOTO_OK }, (_, i) => `x${i}`) }, VOLUNTEER_A);
  check("an oversized batch is rejected", 400, huge.status);

  const unknown = await post(server, "/api/check-out-guardian",
    { qrToken: TOKEN_MOM, checkinIds: ["ci_does_not_exist"] , identityCheck: PHOTO_OK }, VOLUNTEER_A);
  check("an unknown checkin id is reported, not thrown", "not-found", unknown.data?.results?.[0]?.outcome);

  server.close();
}

{
  // Duplicate ids in one request must not double-process a child.
  const db = seed();
  const server = await listen(makeApp(db));
  const res = await post(server, "/api/check-out-guardian",
    { qrToken: TOKEN_MOM, checkinIds: ["ci_amahle", "ci_amahle"] , identityCheck: PHOTO_OK }, VOLUNTEER_A);
  check("duplicate ids in one request collapse to one", 1, res.data?.results?.length);
  server.close();
}

// --- Source guard ---------------------------------------------------------
// The app above is a model. If server.ts drifts away from it these tests stop
// meaning anything, so assert the properties the model depends on.

const serverSrc = readFileSync(path.join(ROOT, "server.ts"), "utf8");

check(
  "server.ts wires authenticateToken before peakLimiter on /api/guardian-lookup",
  true,
  /app\.post\(\s*"\/api\/guardian-lookup",\s*authenticateToken,\s*peakLimiter,/.test(serverSrc),
);
check(
  "server.ts wires authenticateToken before peakLimiter on /api/check-out-guardian",
  true,
  /app\.post\(\s*"\/api\/check-out-guardian",\s*authenticateToken,\s*peakLimiter,/.test(serverSrc),
);
check(
  "both endpoints require a volunteer role",
  true,
  (serverSrc.match(/requireVolunteer,\s*validate\(GuardianLookupSchema\)/) !== null) &&
    (serverSrc.match(/requireVolunteer,\s*validate\(GuardianCheckOutSchema\)/) !== null),
);
check(
  "the checkout handler re-resolves the guardian from the scanned token",
  true,
  /app\.post\(\s*"\/api\/check-out-guardian"[\s\S]{0,1200}resolveGuardianByToken\(req, churchId, qrToken\)/.test(serverSrc),
);
// Ordering, not proximity: the authorization check must come before the write
// inside the same transaction. Measuring by character distance would break the
// moment a comment is added between them.
const checkoutHandler = serverSrc.slice(serverSrc.indexOf('app.post("/api/check-out-guardian"'));
const authzAt = checkoutHandler.indexOf("guardian.childIds.includes(c.childId)");
const writeAt = checkoutHandler.indexOf("transaction.update(checkinRef");
check(
  "the guardian->child link is checked before the status transition is written",
  true,
  authzAt !== -1 && writeAt !== -1 && authzAt < writeAt,
);
check(
  "the transition is written inside a transaction, not a bare update",
  true,
  /db\.runTransaction\(/.test(checkoutHandler.slice(0, writeAt)),
);
check(
  "guardianId written to the record comes from the resolved doc, not the body",
  true,
  /guardianId: guardian\.id,/.test(serverSrc) && !/guardianId: req\.body\.guardianId/.test(serverSrc),
);
check(
  "the guardian resolver rejects inactive and deleted guardians",
  true,
  /data\.deleted === true \|\| data\.active !== true/.test(serverSrc),
);

// IDENTITY_CHECK guards. The model above enforces the assertion; these pin
// that server.ts still does the same thing, in the same order.
check(
  "GuardianCheckOutSchema requires an identityCheck enum",
  true,
  /GuardianCheckOutSchema = z\.object\(\{[\s\S]{0,400}identityCheck: z\.enum\(\["photo-confirmed", "no-photo-acknowledged"\]\)/.test(serverSrc),
);
check(
  "the guardian resolver returns a photoUrl for the volunteer to check against",
  true,
  /photoUrl: data\.photoUrl \|\| data\.photoURL \|\| null/.test(serverSrc),
);
check(
  "the lookup response includes the guardian's photo",
  true,
  /app\.post\(\s*"\/api\/guardian-lookup"[\s\S]{0,3000}photoUrl: guardian\.photoUrl/.test(serverSrc),
);
// Ordering again, not proximity: an assertion that cannot be true must be
// refused before anything is released.
const mismatchAt = checkoutHandler.indexOf('IDENTITY_CHECK_MISMATCH');
check(
  "the identity check is refused before the status transition is written",
  true,
  mismatchAt !== -1 && writeAt !== -1 && mismatchAt < writeAt,
);
check(
  "the expected assertion is derived from the guardian record, not the request",
  true,
  /const expected = hasPhoto \? "photo-confirmed" : "no-photo-acknowledged";/.test(checkoutHandler) &&
    /identityCheck !== expected/.test(checkoutHandler),
);
check(
  "the assertion is written to the pickup record",
  true,
  /identityCheck,/.test(checkoutHandler.slice(0, writeAt)),
);
check(
  "the assertion and whether a photo existed are both in the audit entry",
  true,
  /identityCheck,\s*\n\s*guardianHadPhoto: hasPhoto,/.test(checkoutHandler),
);
check(
  "a server-side audit entry is written for guardian checkouts",
  true,
  /action: "guardian_checkout"/.test(serverSrc),
);

// Notifications: enqueue-after-audit, and batched rather than one awaited
// send per child. This used to be a `for (const record of checkedOut) { await
// emailService.sendNotification(...) }` loop -- up to ~20 sequential
// awaited network calls on a request a volunteer is standing at a kiosk
// waiting on. It's now one notifyCheckins(...) call across the whole
// family, enqueued and dispatched in parallel -- see notifications/service.ts.
const auditAt = checkoutHandler.indexOf('action: "guardian_checkout"');
const notifyAt = checkoutHandler.indexOf("notifyCheckins(");
check(
  "the notification batch is enqueued after the audit log write, not before",
  true,
  auditAt !== -1 && notifyAt !== -1 && auditAt < notifyAt,
);
check(
  "checkout notifications are dispatched in one batched call across the family, not a per-child loop",
  true,
  notifyAt !== -1 && /checkedOut\.map\(/.test(checkoutHandler.slice(notifyAt - 50, notifyAt + 50)),
);
check(
  "the old serial per-child await loop is gone from the guardian-checkout handler",
  false,
  /for \(const record of checkedOut\)/.test(checkoutHandler),
);

// /api/check-out is now the override path only. Guardian pickups go through
// /api/check-out-guardian, where the guardian is resolved server-side. If
// CheckOutSchema ever re-accepts a caller-supplied guardian, the hole this
// suite exists to close is back open.
const checkOutSchema = serverSrc.slice(
  serverSrc.indexOf("const CheckOutSchema"),
  serverSrc.indexOf("const InviteUserSchema"),
);
check(
  "CheckOutSchema no longer accepts a caller-supplied guardian",
  true,
  checkOutSchema.length > 0 && !/guardianId/.test(checkOutSchema) && !/guardianName/.test(checkOutSchema),
);
check(
  "CheckOutSchema requires a non-empty overrideReason",
  true,
  /overrideReason:\s*z\.string\(\)\.min\(1\)/.test(checkOutSchema),
);

const checkOutHandler = serverSrc.slice(
  serverSrc.indexOf('app.post("/api/check-out",'),
  serverSrc.indexOf('app.post("/api/emergency-alert"'),
);
check(
  "the check-out handler writes the override sentinel, not a caller value",
  true,
  /guardianId:\s*"admin_override"/.test(checkOutHandler) &&
    /guardianName:\s*"Admin Override"/.test(checkOutHandler),
);

// The legacy attendance routes shared one IP-keyed bucket per church because
// the limiter ran before authentication -- the same defect the PIN hotfix
// fixed on /api/verify-pin. Keep them authenticated first.
for (const route of ["check-in", "check-out", "move-room"]) {
  check(
    `server.ts wires authenticateToken before peakLimiter on /api/${route}`,
    true,
    new RegExp(`app\\.post\\(\\s*"/api/${route}",\\s*authenticateToken,\\s*peakLimiter,`).test(serverSrc),
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
