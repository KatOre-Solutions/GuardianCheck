/**
 * Unit tests for the WhatsApp OTP verification flow
 * (notifications/whatsapp-verification.ts) and the Cloud API sender
 * (notifications/providers/whatsapp.ts).
 *
 * Run with `npm run test:whatsapp`. Needs no emulator and no live WhatsApp
 * credentials -- axios is monkey-patched per test, same pattern as
 * tests/email-provider-result.test.mjs uses for Resend.
 */

import axios from "axios";
import {
  startWhatsappVerification,
  confirmWhatsappVerification,
  OTP_CHALLENGES_COLLECTION,
} from "../notifications/whatsapp-verification.ts";
import { sendWhatsAppTemplate, buildOtpTemplateComponents, WhatsAppProvider } from "../notifications/providers/whatsapp.ts";
import { whatsappSummaryText, maskPhone } from "../notifications/templates.ts";

let pass = 0;
let fail = 0;

const check = (name, expected, actual) => {
  const ok = JSON.stringify(expected) === JSON.stringify(actual);
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "  ok  " : "FAIL  "} ${name}${ok ? "" : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`);
};

// --- Fake Firestore (same shape as tests/notifications-service.test.mjs) ---

class FakeDocRef {
  constructor(store, collectionName, id) {
    this.store = store;
    this.collectionName = collectionName;
    this.id = id;
  }
  key() { return `${this.collectionName}/${this.id}`; }
  async get() {
    const data = this.store.get(this.key());
    return { exists: data !== undefined, id: this.id, data: () => (data ? { ...data } : undefined) };
  }
  async set(data, options) {
    if (options?.merge && this.store.has(this.key())) {
      this.store.set(this.key(), { ...this.store.get(this.key()), ...data });
    } else {
      this.store.set(this.key(), { ...data });
    }
  }
  async update(patch) {
    if (!this.store.has(this.key())) throw new Error("NOT_FOUND");
    this.store.set(this.key(), { ...this.store.get(this.key()), ...patch });
  }
  async delete() { this.store.delete(this.key()); }
}

function makeFakeDb(seed = {}) {
  const store = new Map();
  for (const [collectionName, docs] of Object.entries(seed)) {
    for (const [id, data] of Object.entries(docs)) store.set(`${collectionName}/${id}`, { ...data });
  }
  return { store, collection: (name) => ({ doc: (id) => new FakeDocRef(store, name, id) }) };
}

// --- Fixture env ------------------------------------------------------

process.env.WHATSAPP_OTP_PEPPER = "test-pepper-do-not-use-in-prod";
process.env.WHATSAPP_OTP_TEMPLATE_NAME = "otp_verification";

async function withMockSend(fn) {
  // No WHATSAPP_ACCESS_TOKEN -> mock mode -> every send reports ok:true
  // without an HTTP call. Isolate startWhatsappVerification's own logic
  // (challenge storage, reset-on-number-change) from provider behavior,
  // which providers/whatsapp.ts's own tests below cover directly.
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  return fn();
}

// --- startWhatsappVerification -------------------------------------------

console.log("\nstartWhatsappVerification\n");

await withMockSend(async () => {
  const db = makeFakeDb();
  const result = await startWhatsappVerification(db, "uid1", "0821234567");
  check("a valid local number starts a challenge successfully", true, result.ok);

  const stored = (await db.collection(OTP_CHALLENGES_COLLECTION).doc("uid1").get()).data();
  check("the challenge stores the normalized E.164 number", "+27821234567", stored.phone);
  check("the challenge never stores the code in the clear", false, "codeHash" in stored && /^\d{6}$/.test(stored.codeHash));
  check("the challenge stores a 64-char hex HMAC, not a raw code", true, /^[0-9a-f]{64}$/.test(stored.codeHash));
  check("attempts starts at 0", 0, stored.attempts);
});

await withMockSend(async () => {
  const db = makeFakeDb();
  const result = await startWhatsappVerification(db, "uid1", "not a phone number");
  check("an invalid number is rejected before anything is written", false, result.ok);
  check("no challenge was created for the invalid number", false, (await db.collection(OTP_CHALLENGES_COLLECTION).doc("uid1").get()).exists);
});

await withMockSend(async () => {
  // "Reset on number change": already verified for +27821234567, now
  // starting a challenge for a *different* number must un-verify
  // immediately, not wait for the new number to be confirmed.
  const db = makeFakeDb({
    users: { uid1: { whatsappNumber: "+27821234567", whatsappVerifiedAt: "2026-01-01T00:00:00.000Z" } },
  });
  await startWhatsappVerification(db, "uid1", "0731112222");

  const user = (await db.collection("users").doc("uid1").get()).data();
  check("starting a challenge for a different number clears whatsappVerifiedAt immediately", null, user.whatsappVerifiedAt);
});

await withMockSend(async () => {
  // Re-verifying the SAME already-verified number should not un-verify it
  // mid-flight (a family re-confirming their own number shouldn't see
  // "unverified" while they're in the middle of doing exactly that).
  const db = makeFakeDb({
    users: { uid1: { whatsappNumber: "+27821234567", whatsappVerifiedAt: "2026-01-01T00:00:00.000Z" } },
  });
  await startWhatsappVerification(db, "uid1", "0821234567"); // same number, local format

  const user = (await db.collection("users").doc("uid1").get()).data();
  check("re-verifying the same number leaves whatsappVerifiedAt untouched until confirm", "2026-01-01T00:00:00.000Z", user.whatsappVerifiedAt);
});

await withMockSend(async () => {
  // A repeat /start call ("resend") overwrites the pending challenge rather
  // than erroring or stacking up multiple pending codes.
  const db = makeFakeDb();
  await startWhatsappVerification(db, "uid1", "0821234567");
  const first = (await db.collection(OTP_CHALLENGES_COLLECTION).doc("uid1").get()).data();
  await startWhatsappVerification(db, "uid1", "0821234567");
  const second = (await db.collection(OTP_CHALLENGES_COLLECTION).doc("uid1").get()).data();

  check("a resend produces a fresh hash, not the same code reused", true, first.codeHash !== second.codeHash);
});

// --- confirmWhatsappVerification ------------------------------------------

console.log("\nconfirmWhatsappVerification\n");

// Reach into the module's own hashing to build a fixture without depending
// on knowing a generated code -- exercised indirectly via start+confirm in
// most tests below, but this one needs a known-good hash to test the
// success path deterministically.
async function seedChallenge(db, uid, code, overrides = {}) {
  const crypto = await import("node:crypto");
  const codeHash = crypto.createHmac("sha256", process.env.WHATSAPP_OTP_PEPPER).update(code).digest("hex");
  await db.collection(OTP_CHALLENGES_COLLECTION).doc(uid).set({
    codeHash,
    phone: "+27821234567",
    attempts: 0,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    ...overrides,
  });
}

{
  const db = makeFakeDb();
  await seedChallenge(db, "uid1", "123456");

  const result = await confirmWhatsappVerification(db, "uid1", "123456");
  check("the correct code verifies successfully", "verified", result.outcome);

  const user = (await db.collection("users").doc("uid1").get()).data();
  check("the user doc is stamped with the verified number", "+27821234567", user.whatsappNumber);
  check("whatsappVerifiedAt is set to a real timestamp, not just truthy", true, typeof user.whatsappVerifiedAt === "string" && !isNaN(Date.parse(user.whatsappVerifiedAt)));

  check("the challenge is deleted after a successful verification", false, (await db.collection(OTP_CHALLENGES_COLLECTION).doc("uid1").get()).exists);
}

{
  const db = makeFakeDb();
  await seedChallenge(db, "uid1", "123456");

  const result = await confirmWhatsappVerification(db, "uid1", "999999");
  check("a wrong code is rejected", "invalid", result.outcome);

  const remaining = (await db.collection(OTP_CHALLENGES_COLLECTION).doc("uid1").get()).data();
  check("a wrong guess increments the persisted attempt counter", 1, remaining.attempts);
  check("the user doc is not touched by a failed attempt", undefined, (await db.collection("users").doc("uid1").get()).data());
}

{
  const db = makeFakeDb();
  const result = await confirmWhatsappVerification(db, "uid-with-no-challenge", "123456");
  check("confirming with no pending challenge fails cleanly, not throwing", "no_pending_challenge", result.outcome);
}

{
  const db = makeFakeDb();
  await seedChallenge(db, "uid1", "123456", { expiresAt: new Date(Date.now() - 1000).toISOString() });

  const result = await confirmWhatsappVerification(db, "uid1", "123456");
  check("an expired code is rejected even though it's correct", "expired", result.outcome);
  check("an expired challenge is cleaned up", false, (await db.collection(OTP_CHALLENGES_COLLECTION).doc("uid1").get()).exists);
}

{
  const db = makeFakeDb();
  await seedChallenge(db, "uid1", "123456", { attempts: 5 });

  const result = await confirmWhatsappVerification(db, "uid1", "123456");
  check("hitting the attempt cap rejects even the correct code (persisted counter, not just the express-rate-limit window)", "too_many_attempts", result.outcome);
}

{
  // Constant-time comparison must not throw on garbage input of an
  // unexpected shape -- the route's zod schema normally guarantees 6
  // digits, but this module shouldn't crash if called with anything else.
  const db = makeFakeDb();
  await seedChallenge(db, "uid1", "123456");

  let threw = false;
  let result;
  try {
    result = await confirmWhatsappVerification(db, "uid1", "not-six-digits-at-all");
  } catch {
    threw = true;
  }
  check("garbage input does not throw", false, threw);
  check("...and is treated as an invalid guess", "invalid", result?.outcome);
}

// --- providers/whatsapp.ts: mock mode and error classification -----------

console.log("\nWhatsApp provider: mock mode and error classification\n");

{
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  const result = await sendWhatsAppTemplate({ to: "+27821234567", templateName: "otp_verification", languageCode: "en_US" });
  check("mock mode (no access token) reports success without a real call", true, result.ok);
  check("mock mode is not retryable (nothing to retry)", false, result.retryable);
}

{
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123456";

  const originalPost = axios.post;
  axios.post = async () => ({ data: { messages: [{ id: "wamid.test123" }] } });

  const result = await sendWhatsAppTemplate({ to: "+27821234567", templateName: "otp_verification", languageCode: "en_US" });
  check("a successful send captures the provider message id", "wamid.test123", result.providerMessageId);
  check("a successful send reports ok:true", true, result.ok);

  axios.post = originalPost;
}

{
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123456";

  const originalPost = axios.post;
  axios.post = async () => {
    const err = new Error("Request failed");
    err.response = { data: { error: { code: 130429, message: "Rate limit hit" } } };
    throw err;
  };

  const result = await sendWhatsAppTemplate({ to: "+27821234567", templateName: "otp_verification", languageCode: "en_US" });
  check("error code 130429 (rate limit) is classified retryable", true, result.retryable);
  check("the error code is captured", "130429", result.errorCode);

  axios.post = originalPost;
}

{
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123456";

  const originalPost = axios.post;
  axios.post = async () => {
    const err = new Error("Request failed");
    err.response = { data: { error: { code: 131026, message: "Recipient not on WhatsApp" } } };
    throw err;
  };

  const result = await sendWhatsAppTemplate({ to: "+27821234567", templateName: "otp_verification", languageCode: "en_US" });
  check("error code 131026 (invalid recipient) is not retryable", false, result.retryable);

  axios.post = originalPost;
}

{
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123456";

  const originalPost = axios.post;
  axios.post = async () => { throw new Error("ECONNRESET"); };

  let threw = false;
  let result;
  try {
    result = await sendWhatsAppTemplate({ to: "+27821234567", templateName: "otp_verification", languageCode: "en_US" });
  } catch {
    threw = true;
  }
  check("a network-level throw (not an API rejection) does not propagate", false, threw);
  check("...and is reported as a non-ok, non-retryable result (unknown codes default safe)", false, result?.ok);

  axios.post = originalPost;
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
}

{
  const components = buildOtpTemplateComponents("482913");
  const body = components.find((c) => c.type === "body");
  const button = components.find((c) => c.type === "button");
  check("the OTP code appears in the body parameters", "482913", body?.parameters?.[0]?.text);
  check("the OTP code also appears in the button's coupon_code parameter (Meta requires it twice)", "482913", button?.parameters?.[0]?.coupon_code);
  check("the button uses the copy_code sub_type", "copy_code", button?.sub_type);
}

// --- whatsappSummaryText / maskPhone (templates.ts) ------------------------

console.log("\nwhatsappSummaryText and maskPhone\n");

{
  const payload = { childName: "Amahle", time: "2026-09-03T09:00:00.000Z", roomName: "Elephants", churchName: "Church A" };
  check("single-child check-in reads naturally in the singular", true, /^Amahle has been checked in at Church A/.test(whatsappSummaryText(payload, "check-in")));
  check("single-child check-out", true, /^Amahle has been checked out of Church A/.test(whatsappSummaryText(payload, "check-out")));
  check("room move names the new room", true, whatsappSummaryText(payload, "room_move").includes("moved to Elephants"));
  check("emergency doesn't need a child name at all", true, whatsappSummaryText(payload, "emergency").startsWith("Emergency alert at Church A"));
}

{
  const consolidatedPayload = {
    childName: "Amahle", time: "2026-09-03T14:00:00.000Z", roomName: "Elephants", churchName: "Church A",
    children: [{ childName: "Amahle", roomName: "Elephants" }, { childName: "Bongani", roomName: "Giraffes" }, { childName: "Chipo", roomName: "Lions" }],
  };
  const text = whatsappSummaryText(consolidatedPayload, "check-out");
  check("a consolidated message names every child, Oxford-comma style", true, text.startsWith("Amahle, Bongani and Chipo have been checked out"));
  check("a consolidated message uses the plural verb", true, text.includes(" have been "));
}

{
  check("maskEmail-equivalent for phone: country code + last 2 digits visible", true, maskPhone("+27821234567").startsWith("+27") && maskPhone("+27821234567").endsWith("67"));
  check("the middle of the number is starred, not present", false, maskPhone("+27821234567").includes("8212345"));
}

// --- WhatsAppProvider (business notifications) ----------------------------

console.log("\nWhatsAppProvider: business notification send\n");

{
  process.env.WHATSAPP_UTILITY_TEMPLATE_CHECKIN = "checkin_utility";
  delete process.env.WHATSAPP_ACCESS_TOKEN; // mock mode

  const db = makeFakeDb({
    users: { parent1: { whatsappNumber: "+27821234567", whatsappVerifiedAt: "2026-01-01T00:00:00.000Z" } },
  });
  const provider = new WhatsAppProvider();
  const record = {
    id: "n1", recipientUserId: "parent1", eventType: "check-in",
    payload: { childName: "Amahle", time: "2026-09-03T09:00:00.000Z", roomName: "Elephants", churchName: "Church A" },
  };
  const result = await provider.send(record, { db });
  check("a verified recipient with a configured template sends (mock mode) successfully", true, result.ok);

  delete process.env.WHATSAPP_UTILITY_TEMPLATE_CHECKIN;
}

{
  // No WHATSAPP_UTILITY_TEMPLATE_CHECKOUT configured -- the safe default
  // (this event type just never goes out over WhatsApp) rather than
  // sending with a guessed or empty template name.
  delete process.env.WHATSAPP_UTILITY_TEMPLATE_CHECKOUT;
  const db = makeFakeDb({ users: { parent1: { whatsappNumber: "+27821234567", whatsappVerifiedAt: "2026-01-01T00:00:00.000Z" } } });
  const provider = new WhatsAppProvider();
  const result = await provider.send({ id: "n1", recipientUserId: "parent1", eventType: "check-out", payload: {} }, { db });
  check("no configured template for this event type -> not ok, not retryable (won't loop forever)", false, result.ok);
  check("...and doesn't retry a config problem", false, result.retryable);
}

{
  process.env.WHATSAPP_UTILITY_TEMPLATE_CHECKIN = "checkin_utility";
  // The record was eligible when enqueued, but the recipient has since
  // un-verified (or never was) -- re-checked live at send time, same
  // principle as EmailProvider re-reading the live email address.
  const db = makeFakeDb({ users: { parent1: { email: "p@x.com" } } }); // no whatsappVerifiedAt
  const provider = new WhatsAppProvider();
  const result = await provider.send({ id: "n1", recipientUserId: "parent1", eventType: "check-in", payload: {} }, { db });
  check("a recipient who is no longer verified is rejected at send time, not just at enqueue", false, result.ok);
  check("...and not retried (the condition won't fix itself)", false, result.retryable);
  delete process.env.WHATSAPP_UTILITY_TEMPLATE_CHECKIN;
}

{
  process.env.WHATSAPP_UTILITY_TEMPLATE_CHECKIN = "checkin_utility";
  const db = makeFakeDb();
  const provider = new WhatsAppProvider();
  const result = await provider.send({ id: "n1", recipientUserId: "guardian:g1", eventType: "check-in", payload: {} }, { db });
  check("guardian recipients are explicitly unsupported for WhatsApp (no verification flow exists for them)", false, result.ok);
  delete process.env.WHATSAPP_UTILITY_TEMPLATE_CHECKIN;
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
