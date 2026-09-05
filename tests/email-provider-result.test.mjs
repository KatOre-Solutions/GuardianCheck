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
 * Generic Firestore stand-in. Every collection name (email_logs, logs) falls
 * through to a generic add-only collection so the constructor's mock-mode
 * warning write doesn't need its own case.
 */
function makeFakeDb() {
  const logsByCollection = {};
  return {
    logsByCollection,
    collection(name) {
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

// --- Pickup QR in the check-in email ----------------------------------
//
// The QR used to be an <img> pointing at api.qrserver.com with the raw pickup
// token in the query string: the value that identifies who may collect a
// child, handed to a third party on every check-in and fetched again by every
// recipient's mail client. It is now rendered in-process and attached inline.

console.log("\nCheck-in email: pickup QR attachment\n");

const { EmailProvider } = await import("../notifications/providers/email.ts");

const GUARDIAN_TOKEN = "gq_" + "A".repeat(32);

/** Firestore stand-in for the provider's two reads: the recipient, and the guardian. */
function makeProviderDb({ guardian } = {}) {
  return {
    collection(name) {
      return {
        doc: (id) => ({
          get: async () => {
            if (name === "users") {
              return { exists: true, id, data: () => ({ email: "parent@example.com" }) };
            }
            if (name === "guardians") {
              return guardian
                ? { exists: true, id, data: () => guardian }
                : { exists: false, id, data: () => undefined };
            }
            return { exists: false, id, data: () => undefined };
          },
        }),
      };
    },
  };
}

const checkinRecord = (payloadExtra) => ({
  id: "notif_1",
  churchId: "church-a",
  recipientUserId: "parent_1",
  eventType: "check-in",
  payload: {
    childName: "Amahle Mokoena",
    time: "2026-09-02T09:05:00.000Z",
    roomName: "Elephants",
    churchName: "Test Church",
    ...payloadExtra,
  },
});

const activeGuardian = { churchId: "church-a", active: true, deleted: false, qrToken: GUARDIAN_TOKEN };

/** Runs a send with console.warn captured, so the fallback warning is observable. */
async function sendCapturingWarnings(provider, record, db) {
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    const sent = [];
    provider.resend = { emails: { send: async (payload) => { sent.push(payload); return { data: { id: "msg_1" }, error: null }; } } };
    const result = await provider.send(record, { db });
    return { result, warnings, payload: sent[0] };
  } finally {
    console.warn = realWarn;
  }
}

{
  process.env.RESEND_API_KEY = "re_test_dummy_key";
  const provider = new EmailProvider();
  const db = makeProviderDb({ guardian: activeGuardian });

  const { result, warnings, payload } = await sendCapturingWarnings(
    provider, checkinRecord({ guardianId: "g_mom" }), db,
  );

  check("a check-in send with a resolvable guardian succeeds", true, result.ok);
  check("the QR travels as an inline attachment", 1, payload.attachments?.length);
  check("...under the cid the template references", "pickup-qr", payload.attachments?.[0]?.contentId);
  check("...as a PNG", "pickup-qr.png", payload.attachments?.[0]?.filename);
  check("...with real image bytes (base64 PNG magic number)", true,
    typeof payload.attachments?.[0]?.content === "string" && payload.attachments[0].content.startsWith("iVBORw0KGgo"));
  check("the html references the attachment, not a URL", true, payload.html.includes('src="cid:pickup-qr"'));
  check("the third-party QR service appears nowhere in the html", false, payload.html.includes("qrserver.com"));
  // The token authorises collecting a child. It must not travel in the markup
  // even now that the image is inline.
  check("the raw pickup token is not in the html", false, payload.html.includes(GUARDIAN_TOKEN));
  check("no fallback warning on the normal path", 0, warnings.filter((w) => w.includes("[QR_FALLBACK]")).length);
}

{
  // The legacy shape: a record enqueued before payload.guardianId existed,
  // retried by the cron sweep after deploy. Rendering without a QR is the
  // right fallback, but it means a parent got a check-in email with no way to
  // collect their child -- so it must be visible in the logs.
  process.env.RESEND_API_KEY = "re_test_dummy_key";
  const provider = new EmailProvider();
  const db = makeProviderDb({ guardian: activeGuardian });

  const { result, warnings, payload } = await sendCapturingWarnings(
    provider, checkinRecord({ guardianQrToken: "guardian_legacy00001" }), db,
  );

  check("a legacy-shaped record still sends", true, result.ok);
  check("...without an attachment", undefined, payload.attachments);
  check("...and without a QR block in the html", false, payload.html.includes("cid:pickup-qr"));

  const fallback = warnings.filter((w) => w.includes("[QR_FALLBACK]"));
  check("the silent-fallback case warns", 1, fallback.length);
  check("...naming the notification", true, fallback[0].includes("notif_1"));
  check("...and the church", true, fallback[0].includes("church-a"));
  check("...but never the token itself", false, fallback[0].includes("guardian_legacy00001"));
}

{
  // A guardian who was deactivated after enqueue. Their token no longer
  // resolves at checkout (resolveGuardianByToken), so emailing it would hand
  // out a code that cannot work.
  process.env.RESEND_API_KEY = "re_test_dummy_key";
  const provider = new EmailProvider();

  const cases = [
    ["deactivated", { ...activeGuardian, active: false }],
    ["deleted", { ...activeGuardian, deleted: true }],
    ["belonging to another church", { ...activeGuardian, churchId: "church-b" }],
    ["with no token minted yet", { ...activeGuardian, qrToken: null }],
  ];

  for (const [label, guardian] of cases) {
    const { result, payload, warnings } = await sendCapturingWarnings(
      provider, checkinRecord({ guardianId: "g_mom" }), makeProviderDb({ guardian }),
    );
    check(`a guardian ${label} yields no QR, and the email still sends`, true, result.ok && !payload.attachments);
    // No guardianQrToken on the payload, so this is not the legacy case and
    // must not warn -- the warning has to stay a signal, not noise.
    check(`...and does not warn (not the legacy case)`, 0, warnings.filter((w) => w.includes("[QR_FALLBACK]")).length);
  }

  const missing = await sendCapturingWarnings(
    provider, checkinRecord({ guardianId: "g_gone" }), makeProviderDb({ guardian: null }),
  );
  check("a guardian document that no longer exists yields no QR", true, missing.result.ok && !missing.payload.attachments);
}

{
  // Only check-in carries a pickup QR. A checkout email must not.
  process.env.RESEND_API_KEY = "re_test_dummy_key";
  const provider = new EmailProvider();
  const record = { ...checkinRecord({ guardianId: "g_mom" }), eventType: "check-out" };
  const { payload } = await sendCapturingWarnings(provider, record, makeProviderDb({ guardian: activeGuardian }));
  check("a check-out email carries no QR attachment", undefined, payload.attachments);
}

// The whole point of the change: no code path anywhere hands the pickup token
// to a third-party image service.
for (const rel of ["notifications/templates.ts", "notifications/providers/email.ts", "server.ts"]) {
  check(
    `${rel} no longer references api.qrserver.com`,
    false,
    readFileSync(path.join(ROOT, rel), "utf8").includes("qrserver.com"),
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
