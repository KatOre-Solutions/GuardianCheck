/**
 * Unit tests for EmailService's provider-result handling (PR: email provider
 * truthfulness).
 *
 * Run with `npm run test:email-provider`. Needs no emulator and no live
 * Resend key -- `emailService.ts` is imported directly (via tsx, since it has
 * no Firebase-init side effects, unlike server.ts) and its `resend` client is
 * swapped for a fake after construction.
 *
 * Why this exists
 * ----------------
 * `Resend.emails.send()` returns `{ data, error }` and never throws. Every
 * send method in this file used to discard that return value and log
 * `status: "success"` regardless -- a rejected send (bad address, exhausted
 * quota, Resend's own outage) looked identical in `email_logs` to a delivered
 * one. `sendViaResend()` is the one place that return value is read; these
 * tests pin that it is read correctly, that the message id it captures on
 * success actually reaches `email_logs`, that Resend's retryable error codes
 * are classified the way `RETRYABLE_RESEND_ERROR_CODES` intends, that mock
 * mode (no RESEND_API_KEY) is distinguishable from a real send, that a caller
 * never sees an exception -- and that the per-request `traceId` /
 * `firestoreOps` context that used to stop at this class's boundary now
 * actually reaches `email_logs` and the op counters.
 */

import { EmailService } from "../emailService.ts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let pass = 0;
let fail = 0;

const check = (name, expected, actual) => {
  const ok = JSON.stringify(expected) === JSON.stringify(actual);
  if (ok) pass++;
  else fail++;
  console.log(
    `${ok ? "  ok  " : "FAIL  "} ${name}${ok ? "" : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`,
  );
};

// --- Fakes ------------------------------------------------------------

/**
 * Generic Firestore stand-in. `children` / `users` / `guardians` are modeled
 * because sendNotification's recipient resolution reads them; every other
 * collection name (email_logs, logs) falls through to a generic add-only
 * collection so the constructor's mock-mode warning write doesn't need its
 * own case.
 */
function makeFakeDb({ child, parent, guardians = [] } = {}) {
  const logsByCollection = {};
  return {
    logsByCollection,
    collection(name) {
      if (name === "children") {
        return { doc: () => ({ get: async () => ({ exists: !!child, data: () => child }) }) };
      }
      if (name === "users") {
        return { doc: () => ({ get: async () => ({ exists: !!parent, data: () => parent }) }) };
      }
      if (name === "guardians") {
        const query = {
          where: () => query,
          get: async () => ({ forEach: (fn) => guardians.forEach((g) => fn({ data: () => g })) }),
        };
        return query;
      }
      return {
        add: async (data) => {
          (logsByCollection[name] ??= []).push(data);
          return { id: `${name}_${logsByCollection[name].length}` };
        },
      };
    },
  };
}

/** Stands in for the Resend SDK client, keyed by recipient. */
function makeFakeResend(responsesByRecipient) {
  return {
    emails: {
      send: async (payload) => {
        const r = responsesByRecipient[payload.to];
        if (!r) throw new Error(`no fixture configured for recipient ${payload.to}`);
        if (r.throw) throw r.throw;
        return { data: r.data ?? null, error: r.error ?? null };
      },
    },
  };
}

const invitePayload = { firstName: "Alex", lastName: "Doe", role: "volunteer", churchName: "Test Church", inviteLink: "https://x/invite" };

// --- Success parsing + message-ID capture ------------------------------

console.log("\nResend result parsing\n");

{
  const db = makeFakeDb();
  process.env.RESEND_API_KEY = "re_test_dummy_key";
  const svc = new EmailService(db);
  svc.resend = makeFakeResend({ "person@example.com": { data: { id: "msg_abc123" } } });

  const result = await svc.sendInvitation("person@example.com", invitePayload, { traceId: "trace-1" });

  check("successful send reports ok:true", true, result.ok);
  check("successful send captures the provider message id", "msg_abc123", result.providerMessageId);
  check("successful send is not retryable", false, result.retryable);

  const logged = db.logsByCollection.email_logs?.[0];
  check("email_logs records status success", "success", logged?.status);
  check("email_logs records the provider message id", "msg_abc123", logged?.providerMessageId);
  check("email_logs records the request's traceId", "trace-1", logged?.traceId);
}

// --- Failure parsing -----------------------------------------------------

{
  const db = makeFakeDb();
  process.env.RESEND_API_KEY = "re_test_dummy_key";
  const svc = new EmailService(db);
  svc.resend = makeFakeResend({
    "bad@example.com": { error: { name: "validation_error", message: "Invalid `to` field" } },
  });

  const result = await svc.sendVerificationEmail("bad@example.com", "Alex", "Test Church", "https://x/verify", { traceId: "trace-2" });

  check("a provider-rejected send reports ok:false (not thrown as success)", false, result.ok);
  check("the error code is captured", "validation_error", result.errorCode);
  check("a validation error is not classified as retryable", false, result.retryable);

  const logged = db.logsByCollection.email_logs?.[0];
  check("email_logs records status failed", "failed", logged?.status);
  check("email_logs records the error code", "validation_error", logged?.errorCode);
  check("email_logs records retryable:false", false, logged?.retryable);
}

// --- Retryable classification --------------------------------------------

console.log("\nRetryable error classification\n");

const RETRYABLE_CODES = ["rate_limit_exceeded", "daily_quota_exceeded", "monthly_quota_exceeded", "internal_server_error", "concurrent_idempotent_requests"];
const NON_RETRYABLE_CODES = ["validation_error", "invalid_api_key", "missing_api_key", "invalid_from_address"];

for (const code of RETRYABLE_CODES) {
  const db = makeFakeDb();
  process.env.RESEND_API_KEY = "re_test_dummy_key";
  const svc = new EmailService(db);
  svc.resend = makeFakeResend({ "r@example.com": { error: { name: code, message: "transient" } } });
  const result = await svc.sendInvitation("r@example.com", invitePayload);
  check(`"${code}" is classified retryable`, true, result.retryable);
}

for (const code of NON_RETRYABLE_CODES) {
  const db = makeFakeDb();
  process.env.RESEND_API_KEY = "re_test_dummy_key";
  const svc = new EmailService(db);
  svc.resend = makeFakeResend({ "r@example.com": { error: { name: code, message: "permanent" } } });
  const result = await svc.sendInvitation("r@example.com", invitePayload);
  check(`"${code}" is classified not retryable`, false, result.retryable);
}

// --- Mock mode is distinguishable from a real send ------------------------

console.log("\nMock mode\n");

{
  const db = makeFakeDb();
  delete process.env.RESEND_API_KEY;
  const svc = new EmailService(db); // no key -> this.resend stays null

  const result = await svc.sendInvitation("nobody@example.com", invitePayload);

  check("mock-mode send still reports ok:true (nothing to fail)", true, result.ok);
  check("mock-mode send is flagged mocked, not silently folded into a real success", true, result.mocked);
  check("mock-mode send has no provider message id", undefined, result.providerMessageId);

  const logged = db.logsByCollection.email_logs?.[0];
  check('mock-mode send logs status "mock", distinct from "success"', "mock", logged?.status);
}

// --- Never throws, even when the SDK itself throws ------------------------

console.log("\nSDK-level failures are absorbed, not thrown\n");

{
  const db = makeFakeDb();
  process.env.RESEND_API_KEY = "re_test_dummy_key";
  const svc = new EmailService(db);
  svc.resend = makeFakeResend({ "flaky@example.com": { throw: new Error("ECONNRESET") } });

  let threw = false;
  let result;
  try {
    result = await svc.sendInvitation("flaky@example.com", invitePayload);
  } catch {
    threw = true;
  }
  check("sendInvitation does not throw when the SDK call itself throws", false, threw);
  check("...and instead reports ok:false", false, result?.ok);
}

{
  const db = makeFakeDb();
  process.env.RESEND_API_KEY = "re_test_dummy_key";
  const svc = new EmailService(db);
  svc.resend = makeFakeResend({ "flaky2@example.com": { throw: new Error("ECONNRESET") } });

  let threw = false;
  try {
    await svc.sendVerificationEmail("flaky2@example.com", "Alex", "Test Church", "https://x/verify");
  } catch {
    threw = true;
  }
  check("sendVerificationEmail does not throw when the SDK call itself throws", false, threw);
}

// --- sendNotification: mixed results, dedupe, context threading -----------

console.log("\nsendNotification: aggregation, dedupe, traceId/firestoreOps threading\n");

{
  const db = makeFakeDb({
    child: { parentId: "parent1" },
    parent: { email: "parent@example.com" },
    // Same address twice -- must collapse to one send, not two.
    guardians: [{ email: "guardian@example.com" }, { email: "guardian@example.com" }],
  });
  process.env.RESEND_API_KEY = "re_test_dummy_key";
  const svc = new EmailService(db);
  svc.resend = makeFakeResend({
    "parent@example.com": { data: { id: "msg_ok" } },
    "guardian@example.com": { error: { name: "rate_limit_exceeded", message: "slow down" } },
  });

  const ctx = { traceId: "trace-3", firestoreOps: { reads: 0, writes: 0 } };
  const result = await svc.sendNotification(
    "church1",
    "child1",
    { childName: "Kid", time: new Date().toISOString(), roomName: "Room A", churchName: "Test Church", eventType: "check-in" },
    ctx,
  );

  check("mixed results: one sent, one failed (duplicate guardian collapsed)", { sent: 1, failed: 1 }, result);
  check("firestoreOps reads counted (child + parent + guardians query)", 3, ctx.firestoreOps.reads);
  check("firestoreOps writes counted (one email_logs write per unique recipient)", 2, ctx.firestoreOps.writes);

  const logs = db.logsByCollection.email_logs || [];
  const ok = logs.find((l) => l.recipientEmail === "parent@example.com");
  const failed = logs.find((l) => l.recipientEmail === "guardian@example.com");
  check("the successful recipient's log carries the provider message id", "msg_ok", ok?.providerMessageId);
  check("the failed recipient's log is retryable (rate_limit_exceeded)", true, failed?.retryable);
  check("both log entries carry the request's traceId", ["trace-3", "trace-3"], [ok?.traceId, failed?.traceId]);
}

// --- Source guards ----------------------------------------------------
// The behavior above is proven against emailService.ts directly. These pin
// the server.ts wiring decisions from the same PR that can't be exercised
// without a running Firebase Admin app: routing, decoupled failure handling,
// and the outbound-request timeout. If server.ts drifts from what's asserted
// here, these tests stop meaning anything.

console.log("\nSource guards (server.ts)\n");

const serverSrc = readFileSync(path.join(ROOT, "server.ts"), "utf8");
const startServerBody = serverSrc.slice(serverSrc.indexOf("async function startServer()"));

check(
  "/api/auth/send-verification is registered inside startServer(), after generalLimiter is mounted (not at module scope, unlimited)",
  true,
  startServerBody.indexOf('app.use("/api/", generalLimiter)') < startServerBody.indexOf('app.post("/api/auth/send-verification"'),
);
check(
  "/api/auth/send-verification returns 502 on a failed send instead of relying on a throw",
  true,
  /if \(!result\.ok\) \{\s*return res\.status\(502\)/.test(startServerBody),
);
check(
  "the Discord webhook call has an explicit timeout (was unbounded)",
  true,
  /await axios\.post\(webhookUrl,[\s\S]{0,800}\{ timeout: 15000 \}/.test(serverSrc),
);

// accept-invite: from the "Send Verification Email" step through its
// response. A large-but-bounded window, scoped by section comments unique to
// this handler, so it can't accidentally match register-church's identical
// pattern instead.
const acceptInviteSection = serverSrc.slice(
  serverSrc.indexOf("// 6. Send Verification Email"),
  serverSrc.indexOf("// 6. Send Verification Email") + 3000,
);
check(
  "accept-invite's verification-email step no longer throws into the outer catch",
  false,
  /throw new Error/.test(acceptInviteSection),
);
check(
  "accept-invite no longer throws after a failed verification send (would burn the invitation and 500)",
  true,
  /verificationSent = emailResult\.ok;[\s\S]*res\.json\(\{\s*success: true,/.test(acceptInviteSection),
);

const registerChurchSection = serverSrc.slice(
  serverSrc.indexOf("// 4. Send Verification Email"),
  serverSrc.indexOf("// 4. Send Verification Email") + 2500,
);
check(
  "register-church's verification-email step no longer throws into the rollback catch",
  false,
  /throw new Error/.test(registerChurchSection),
);
check(
  "register-church no longer throws after a failed verification send (would trigger the rollback that deletes the church/Auth user)",
  true,
  /verificationSent = emailResult\.ok;[\s\S]*res\.json\(\{\s*success: true,\s*churchId: churchRef\.id/.test(registerChurchSection),
);

const emailServiceSrc = readFileSync(path.join(ROOT, "emailService.ts"), "utf8");
check(
  "sendViaResend destructures Resend's actual {data, error} return instead of discarding it",
  true,
  /const \{ data, error \} = await this\.resend\.emails\.send\(payload\)/.test(emailServiceSrc),
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
