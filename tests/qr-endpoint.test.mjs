/**
 * Tests for GET /api/qr/:token.
 *
 * Run with `npm run test:qr-endpoint`. No emulator and no Firebase -- plain
 * express plus a fake Firestore, mirroring server.ts's handler the way
 * tests/checkout-endpoints.test.mjs mirrors the checkout routes. SOURCE_GUARD
 * at the end asserts server.ts still matches what is modelled here.
 *
 * Why this endpoint gets its own suite
 * ------------------------------------
 * It is the only route in the app that answers without a session, and it
 * serves a child's pickup QR. Everything protecting it is a property of this
 * handler rather than of an auth middleware, so each property needs its own
 * test:
 *
 *   - a guessed token is refused, uniformly            (ENUMERATION)
 *   - an expired or spent token is refused             (LIFETIME)
 *   - a deactivated guardian's QR stops rendering      (REVOCATION)
 *   - one URL cannot be replayed indefinitely          (RATE_LIMIT)
 *   - the token never reaches a log that ships         (REDACTION)
 *   - the response is not cacheable by anything        (NO_STORE)
 */

import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import crypto from "node:crypto";
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

// Imported rather than re-implemented: the point is to exercise the real
// token logic through an HTTP surface.
const {
  mintQrAccessToken,
  resolveQrAccessToken,
  logQrFetch,
  hashQrToken,
  QR_TOKEN_PATTERN,
  QR_ACCESS_TOKENS_COLLECTION,
  QR_ACCESS_LOG_COLLECTION,
} = await import("../notifications/qr-access.ts");
const { renderGuardianQrPng } = await import("../notifications/qr-image.ts");

// --- Fake Firestore ---------------------------------------------------

function makeFakeDb(guardians = {}) {
  const store = new Map();
  const added = [];
  let txLock = Promise.resolve();

  for (const [id, data] of Object.entries(guardians)) store.set(`guardians/${id}`, { ...data });

  const docRef = (collectionName, id) => ({
    id,
    async get() {
      const data = store.get(`${collectionName}/${id}`);
      return { exists: data !== undefined, id, data: () => (data ? { ...data } : undefined) };
    },
    async set(data) { store.set(`${collectionName}/${id}`, { ...data }); },
    async update(patch) {
      const key = `${collectionName}/${id}`;
      if (!store.has(key)) throw new Error("NOT_FOUND");
      store.set(key, { ...store.get(key), ...patch });
    },
  });

  return {
    store,
    added,
    collection(name) {
      return {
        doc: (id) => docRef(name, id),
        add: async (data) => { added.push({ collection: name, data }); return { id: `x${added.length}` }; },
      };
    },
    async runTransaction(fn) {
      const previous = txLock;
      let release;
      txLock = new Promise((r) => { release = r; });
      await previous;
      try {
        return await fn({ get: (ref) => ref.get(), update: (ref, p) => ref.update(p), set: (ref, d) => ref.set(d) });
      } finally { release(); }
    },
  };
}

const ACTIVE_GUARDIAN = {
  churchId: "churchA", active: true, deleted: false,
  qrToken: "gq_" + "A".repeat(32), firstName: "Naledi", lastName: "Mokoena",
};

// --- The real handler, modelled ---------------------------------------

function makeApp(db, { apiLog } = {}) {
  const app = express();

  // Verbatim shape from server.ts's trace middleware, including the
  // redaction this endpoint made necessary.
  const redactPath = (url) => url.replace(/^(\/api\/qr\/)[^/?]+/, "$1:token");
  app.use((req, res, next) => {
    req.firestoreOps = { reads: 0, writes: 0 };
    req.traceId = "trace-test";
    res.setHeader("Content-Type", "application/json");
    res.on("finish", () => {
      apiLog?.push({ path: redactPath(req.originalUrl), status: res.statusCode });
    });
    next();
  });

  const qrFetchTokenLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => crypto.createHash("sha256").update(String(req.params?.token ?? "")).digest("hex").slice(0, 32),
    message: { error: "Not found" },
  });
  const qrFetchIpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    keyGenerator: (req) => ipKeyGenerator(req.ip),
    message: { error: "Not found" },
  });

  app.get("/api/qr/:token", qrFetchIpLimiter, qrFetchTokenLimiter, async (req, res) => {
    const rawToken = String(req.params.token || "");
    const ip = req.ip || null;
    const userAgent = req.get("user-agent") || null;

    const refuse = async (status, outcome, tokenId) => {
      await logQrFetch(db, { tokenId, outcome, status, ip, userAgent, traceId: req.traceId }, { firestoreOps: req.firestoreOps });
      res.status(status).json({ error: "Not found" });
    };

    if (!QR_TOKEN_PATTERN.test(rawToken)) return refuse(404, "malformed", hashQrToken(rawToken));

    try {
      const resolved = await resolveQrAccessToken(db, rawToken, { firestoreOps: req.firestoreOps });
      if (resolved.outcome === "not_found") return refuse(404, "not_found", resolved.tokenId);
      if (resolved.outcome === "expired") return refuse(410, "expired", resolved.tokenId);
      if (resolved.outcome === "consumed") return refuse(410, "consumed", resolved.tokenId);

      const guardianDoc = await db.collection("guardians").doc(resolved.guardianId).get();
      req.firestoreOps.reads++;
      const guardian = guardianDoc.exists ? guardianDoc.data() : null;

      if (!guardian || guardian.churchId !== resolved.churchId || guardian.deleted === true || guardian.active !== true || !guardian.qrToken) {
        return refuse(410, "guardian_unavailable", resolved.tokenId);
      }

      const png = await renderGuardianQrPng(guardian.qrToken);
      await logQrFetch(db, { tokenId: resolved.tokenId, outcome: "ok", status: 200, ip, userAgent, traceId: req.traceId }, { firestoreOps: req.firestoreOps });

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Length", String(png.length));
      res.setHeader("Cache-Control", "no-store, private");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.status(200).end(png);
    } catch (error) {
      return refuse(500, "error", hashQrToken(rawToken));
    }
  });

  return app;
}

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, "127.0.0.1", () => resolve(server));
});

const get = async (server, route) => {
  const res = await fetch(`http://127.0.0.1:${server.address().port}${route}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    contentType: res.headers.get("content-type"),
    cacheControl: res.headers.get("cache-control"),
    corp: res.headers.get("cross-origin-resource-policy"),
    body: buf,
    text: () => buf.toString("utf8"),
  };
};

const MINT = { guardianId: "g_mom", churchId: "churchA", notificationId: "notif_1" };

console.log("\nGET /api/qr/:token\n");

// --- Happy path -----------------------------------------------------------

{
  const db = makeFakeDb({ g_mom: ACTIVE_GUARDIAN });
  const server = await listen(makeApp(db));
  const { raw } = await mintQrAccessToken(db, MINT);

  const res = await get(server, `/api/qr/${raw}`);
  check("a valid token returns 200", 200, res.status);
  check("...as a PNG", "image/png", res.contentType);
  // PNG magic number -- proves real image bytes, not a JSON error body with
  // the wrong content type.
  check("...with real PNG bytes", "89504e47", res.body.subarray(0, 4).toString("hex"));
  check("...uncacheable by any proxy or CDN", "no-store, private", res.cacheControl);
  // helmet defaults CORP to same-origin, which would block Meta's fetch.
  check("...and fetchable cross-origin, which is the entire point", "cross-origin", res.corp);

  server.close();
}

// --- ENUMERATION ----------------------------------------------------------

{
  const db = makeFakeDb({ g_mom: ACTIVE_GUARDIAN });
  const server = await listen(makeApp(db));

  const short = await get(server, "/api/qr/tooshort");
  check("a malformed token is refused", 404, short.status);

  const wrongCharset = await get(server, `/api/qr/${"!".repeat(43)}`);
  check("a token with an invalid charset is refused", 404, wrongCharset.status);

  const unknown = await get(server, `/api/qr/${"A".repeat(43)}`);
  check("a well-formed but unknown token is refused", 404, unknown.status);

  // Uniform body: a caller must not learn whether a token exists from the
  // response content.
  check("...with the same body as a malformed one", short.text(), unknown.text());
  check("...which says nothing useful", '{"error":"Not found"}', unknown.text());

  server.close();
}

{
  // A sequential scan. Each guess is a different token, so the per-token
  // limiter never fires -- this is what the per-IP limiter and the 2^256
  // keyspace are for. Every one must be refused identically.
  const db = makeFakeDb({ g_mom: ACTIVE_GUARDIAN });
  const server = await listen(makeApp(db));
  await mintQrAccessToken(db, MINT);

  const statuses = new Set();
  const bodies = new Set();
  for (let i = 0; i < 50; i++) {
    const guess = String(i).padStart(43, "A");
    const res = await get(server, `/api/qr/${guess}`);
    statuses.add(res.status);
    bodies.add(res.text());
  }
  check("50 sequential guesses all fail", 1, statuses.size);
  check("...all with 404", true, statuses.has(404));
  check("...and all with an identical body", 1, bodies.size);

  // The point of logging refusals: a scan is visible afterwards.
  const refusals = db.added.filter((a) => a.collection === QR_ACCESS_LOG_COLLECTION && a.data.outcome === "not_found");
  check("every guess is recorded in the audit log", 50, refusals.length);

  server.close();
}

// --- LIFETIME -------------------------------------------------------------

{
  const db = makeFakeDb({ g_mom: ACTIVE_GUARDIAN });
  const server = await listen(makeApp(db));
  const { raw, tokenId } = await mintQrAccessToken(db, MINT);

  const doc = db.store.get(`${QR_ACCESS_TOKENS_COLLECTION}/${tokenId}`);
  db.store.set(`${QR_ACCESS_TOKENS_COLLECTION}/${tokenId}`, { ...doc, expiresAt: new Date(Date.now() - 1000).toISOString() });

  const res = await get(server, `/api/qr/${raw}`);
  // 410 rather than 404: accurate, and it distinguishes "you were too late"
  // from "you guessed" when reading the log later.
  check("an expired token returns 410", 410, res.status);
  check("...revealing nothing in the body", '{"error":"Not found"}', res.text());

  server.close();
}

{
  const db = makeFakeDb({ g_mom: ACTIVE_GUARDIAN });
  const server = await listen(makeApp(db));
  const { raw, tokenId } = await mintQrAccessToken(db, MINT);

  const doc = db.store.get(`${QR_ACCESS_TOKENS_COLLECTION}/${tokenId}`);
  db.store.set(`${QR_ACCESS_TOKENS_COLLECTION}/${tokenId}`, { ...doc, consumedAt: new Date().toISOString() });

  const res = await get(server, `/api/qr/${raw}`);
  check("a spent token returns 410", 410, res.status);

  server.close();
}

// --- REVOCATION -----------------------------------------------------------

{
  // Deactivation is the product's only revocation mechanism, and it has to
  // reach here too: a deactivated guardian's token no longer resolves at
  // checkout, so rendering its QR would hand out a code that cannot work.
  const cases = [
    ["deactivated", { ...ACTIVE_GUARDIAN, active: false }],
    ["deleted", { ...ACTIVE_GUARDIAN, deleted: true }],
    ["moved to another church", { ...ACTIVE_GUARDIAN, churchId: "churchB" }],
    ["stripped of its token", { ...ACTIVE_GUARDIAN, qrToken: null }],
  ];

  for (const [label, guardian] of cases) {
    const db = makeFakeDb({ g_mom: guardian });
    const server = await listen(makeApp(db));
    const { raw } = await mintQrAccessToken(db, MINT);
    const res = await get(server, `/api/qr/${raw}`);
    check(`a guardian ${label} no longer renders`, 410, res.status);
    server.close();
  }

  const missing = makeFakeDb({});
  const server = await listen(makeApp(missing));
  const { raw } = await mintQrAccessToken(missing, MINT);
  check("a deleted guardian document no longer renders", 410, (await get(server, `/api/qr/${raw}`)).status);
  server.close();
}

// --- RATE_LIMIT -----------------------------------------------------------

{
  // Replay of one URL. The token's own fetch cap (8) is lower than the
  // limiter's (10), so the cap is what bites first -- which is the intended
  // ordering: the limiter is a backstop for tokens, not the primary control.
  const db = makeFakeDb({ g_mom: ACTIVE_GUARDIAN });
  const server = await listen(makeApp(db));
  const { raw } = await mintQrAccessToken(db, MINT);

  const statuses = [];
  for (let i = 0; i < 12; i++) statuses.push((await get(server, `/api/qr/${raw}`)).status);

  check("the token's own fetch cap stops replay before the limiter does", 8, statuses.filter((s) => s === 200).length);
  check("...and every subsequent request is refused", true, statuses.slice(8).every((s) => s === 410 || s === 429));

  server.close();
}

// --- REDACTION ------------------------------------------------------------

{
  // [API_LOG] is shipped off-server. A live credential must not be in it.
  const db = makeFakeDb({ g_mom: ACTIVE_GUARDIAN });
  const apiLog = [];
  const server = await listen(makeApp(db, { apiLog }));
  const { raw } = await mintQrAccessToken(db, MINT);

  await get(server, `/api/qr/${raw}`);
  await get(server, `/api/qr/${"A".repeat(43)}`);

  const serialised = JSON.stringify(apiLog);
  check("the request log never contains the token", false, serialised.includes(raw));
  check("...recording a redacted path instead", true, apiLog.every((l) => l.path === "/api/qr/:token"));

  server.close();
}

// --- Source guard ---------------------------------------------------------
// The app above is a model. These assert server.ts has not drifted from it.

const serverSrc = readFileSync(path.join(ROOT, "server.ts"), "utf8");
const qrAccessSrc = readFileSync(path.join(ROOT, "notifications", "qr-access.ts"), "utf8");

const startServerAt = serverSrc.indexOf("async function startServer()");
const qrRouteAt = serverSrc.indexOf('app.get("/api/qr/:token"');

check("the QR route is registered inside startServer()", true, startServerAt !== -1 && qrRouteAt > startServerAt);
// The trap /api/auth/send-verification was in: a route registered at module
// scope dispatches before app.use("/api/", generalLimiter) ever runs.
check(
  "...after the generalLimiter mount, so it is actually rate limited",
  true,
  serverSrc.indexOf('app.use("/api/", generalLimiter)') < qrRouteAt,
);
check(
  "both limiters are applied, in IP-then-token order",
  true,
  /app\.get\("\/api\/qr\/:token", qrFetchIpLimiter, qrFetchTokenLimiter,/.test(serverSrc),
);

const qrHandler = serverSrc.slice(qrRouteAt, serverSrc.indexOf("app.post(\"/api/guardians/:guardianId/qr-token\""));

check("the handler shape-checks the token before touching Firestore", true,
  qrHandler.indexOf("QR_TOKEN_PATTERN.test") < qrHandler.indexOf("resolveQrAccessToken"));
check("it serves image/png", true, /res\.setHeader\("Content-Type", "image\/png"\)/.test(qrHandler));
check("it forbids caching", true, /res\.setHeader\("Cache-Control", "no-store, private"\)/.test(qrHandler));
check("it opts out of helmet's same-origin CORP so Meta can fetch", true,
  /res\.setHeader\("Cross-Origin-Resource-Policy", "cross-origin"\)/.test(qrHandler));
// Whitespace-tolerant: the real condition is a multi-line || chain, and a
// pattern that only matched the one-line form would fail the moment it was
// reformatted rather than when the check was actually removed.
check("it re-checks the guardian is still active at fetch time", true,
  /guardian\.deleted === true\s*\|\|\s*guardian\.active !== true/.test(qrHandler));
check("...and that it still belongs to the token's church", true,
  /guardian\.churchId !== resolved\.churchId/.test(qrHandler));
check("it logs every outcome, including refusals", true, /logQrFetch\(/.test(qrHandler));

// The two ways the token could leak into shipped logs.
check("no console call in the handler references the raw token", false, /console\.[a-z]+\([^)]*req\.params\.token/.test(qrHandler));
check("[API_LOG] redacts the token out of the path", true,
  /const redactPath = \(url: string\) => url\.replace\(\/\^\(\\\/api\\\/qr\\\/\)\[\^\/\?\]\+\/, "\$1:token"\)/.test(serverSrc));
check("...and the cost warning uses the redacted path too", true, /COST_WARNING\][\s\S]{0,80}redactPath\(/.test(serverSrc));

// The stored form is a hash; the raw value is returned to the caller and
// never written.
check("qr-access stores the document under a hash of the token", true, /doc\(tokenId\)/.test(qrAccessSrc));
check("...and the fetch cap is 8, not the original draft's 3", true, /QR_ACCESS_MAX_FETCHES = 8/.test(qrAccessSrc));
check("...with the outstanding live-verification note preserved", true,
  /LIVE VERIFICATION IS OUTSTANDING/.test(qrAccessSrc));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
