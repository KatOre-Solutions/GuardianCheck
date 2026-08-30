/**
 * Regression tests for the Admin Override PIN rate limiter (`pinLimiter`).
 *
 * Run with `npm run test:pin-limiter`. Needs no emulator and no Firebase --
 * plain express + express-rate-limit, both already dependencies.
 *
 * These exist because the limiter blocked the flow it was meant to protect.
 * `POST /api/verify-pin` is the Admin Override PIN check used to check a child
 * out, and it was wired as:
 *
 *   app.post("/api/verify-pin", pinLimiter, authenticateToken, ...)
 *
 * Two defects fell out of that single line:
 *
 *   1. `pinLimiter` ran *before* `authenticateToken`, so the shared keyGenerator
 *      (`req.user?.uid || ipKeyGenerator(req.ip)`) never saw a user and always
 *      keyed on the IP. Behind `trust proxy`, every volunteer on a church's
 *      shared WiFi shared ONE bucket of 5 attempts per 15 minutes.
 *   2. Correct PINs consumed that budget, so five successful overrides exhausted
 *      the window and the sixth legitimate checkout was refused.
 *
 * The fix authenticates first (per-volunteer keying) and adds
 * `skipSuccessfulRequests`. The subtle part -- and the reason for the
 * `requestWasSuccessful` override that CORRECT_PIN_DOES_NOT_CONSUME_BUDGET and
 * WRONG_PIN_STILL_LIMITED pin down together -- is that the endpoint answers
 * 200 {isValid:false} for a WRONG pin. The default success test is
 * `res.statusCode < 400`, so `skipSuccessfulRequests` alone would have skipped
 * wrong guesses too and disabled brute-force protection entirely.
 *
 * The express app below mirrors the real middleware chain rather than importing
 * it, because server.ts initialises Firebase on import. SOURCE_GUARD at the end
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
  console.log(`${ok ? "  ok  " : "FAIL  "} ${name}${ok ? "" : `  (expected ${expected}, got ${actual})`}`);
};

// --- The real PIN, and the real wiring ------------------------------------

const REAL_PIN = "1234";
const MAX = 5; // must track server.ts pinLimiter.max

// Verbatim from server.ts.
const keyGenerator = (req) => req.user?.uid || ipKeyGenerator(req.ip);

const makeApp = () => {
  const app = express();
  app.use(express.json());

  const pinLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: MAX,
    keyGenerator,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (_req, res) => res.statusCode < 400 && res.locals.pinValid === true,
    message: { error: "Too many PIN attempts. Please try again later." },
  });

  // Stands in for authenticateToken: attaches req.user from a bearer token.
  const authenticateToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Access denied. No token provided." });
    req.user = { uid: token, churchId: "church1", role: "volunteer" };
    next();
  };

  const requireVolunteer = (req, res, next) =>
    ["volunteer", "admin", "master_admin"].includes(req.user?.role)
      ? next()
      : res.status(403).json({ error: "Volunteer access required" });

  // Order under test: authenticateToken BEFORE pinLimiter.
  app.post("/api/verify-pin", authenticateToken, pinLimiter, requireVolunteer, (req, res) => {
    const isValid = req.body.pin === REAL_PIN;
    res.locals.pinValid = isValid;
    res.json({ isValid });
  });

  return app;
};

const listen = (app) =>
  new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });

const verify = async (server, { uid, pin }) => {
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/verify-pin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${uid}` },
    body: JSON.stringify({ pin }),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, isValid: data?.isValid };
};

// --- Behaviour ------------------------------------------------------------

console.log("\nAdmin Override PIN rate limiter\n");

{
  // The production symptom: an admin checks out more children than the window
  // allowed and the limiter refused a valid PIN. All requests share one IP.
  const server = await listen(makeApp());
  const results = [];
  for (let i = 0; i < MAX * 3; i++) results.push(await verify(server, { uid: "volunteer-a", pin: REAL_PIN }));
  check(
    `valid PIN succeeds ${MAX * 3}x in a row (was blocked at ${MAX + 1})`,
    true,
    results.every((r) => r.status === 200 && r.isValid === true),
  );
  server.close();
}

{
  // The control that must survive: guessing is still capped.
  const server = await listen(makeApp());
  const results = [];
  for (let i = 0; i < MAX + 1; i++) results.push(await verify(server, { uid: "guesser", pin: "9999" }));
  check(`wrong PIN rejected as invalid, not accepted`, true, results[0].status === 200 && results[0].isValid === false);
  check(`wrong PIN still limited after ${MAX} guesses`, 429, results[MAX].status);
  server.close();
}

{
  // The keying fix: volunteers on one church IP no longer share a budget.
  const server = await listen(makeApp());
  for (let i = 0; i < MAX + 1; i++) await verify(server, { uid: "volunteer-a", pin: "9999" });
  const exhausted = await verify(server, { uid: "volunteer-a", pin: REAL_PIN });
  const bystander = await verify(server, { uid: "volunteer-b", pin: REAL_PIN });
  check("a volunteer who exhausts the budget is limited", 429, exhausted.status);
  check("a second volunteer on the same IP is unaffected", 200, bystander.status);
  check("...and can still check a child out", true, bystander.isValid);
}

{
  // Authentication and authorization are unchanged by the reorder.
  const app = makeApp();
  const server = await listen(app);
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/verify-pin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: REAL_PIN }),
  });
  check("unauthenticated request is still rejected", 401, res.status);
  server.close();
}

// --- Source guard ---------------------------------------------------------
// The app above is a model. If server.ts drifts away from it these tests stop
// meaning anything, so assert the two properties the model depends on.

const serverSrc = readFileSync(path.join(ROOT, "server.ts"), "utf8");

check(
  "server.ts wires authenticateToken before pinLimiter on /api/verify-pin",
  true,
  /app\.post\(\s*"\/api\/verify-pin",\s*authenticateToken,\s*pinLimiter,/.test(serverSrc),
);
check(
  "server.ts pinLimiter overrides requestWasSuccessful (not status code alone)",
  true,
  /skipSuccessfulRequests:\s*true/.test(serverSrc) && /requestWasSuccessful:.*res\.locals\.pinValid === true/.test(serverSrc),
);
check(
  "server.ts sets res.locals.pinValid before responding",
  true,
  /res\.locals\.pinValid = isValid;/.test(serverSrc),
);
check(
  "other limiters still applied (general, peak, sensitive, registration)",
  true,
  ["generalLimiter", "peakLimiter", "sensitiveLimiter", "registrationLimiter"].every((l) =>
    new RegExp(`\\b${l}\\b`).test(serverSrc),
  ),
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
