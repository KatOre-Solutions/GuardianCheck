/**
 * Tests for `src/lib/planPricing.ts`, the amount a PayFast ITN must carry
 * before it extends a church's access.
 *
 * Run with `npm run test:plan-pricing`. Needs no emulator: the module is pure.
 *
 * The case that matters most is the one that is invisible today and expensive
 * later: a tier's price goes up, and the churches already subscribed at the old
 * price keep renewing at it. Their bank keeps sending the old amount, and if
 * the handler measured that against the new price it would refuse to extend
 * access and lock out a paying church.
 */

import { strict as assert } from "node:assert";
import { agreedPlanPrice, currentPlanPrice, pricingForPayment } from "../src/lib/planPricing";

let pass = 0;
let fail = 0;

function test(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${label}`);
    pass++;
  } catch (e) {
    console.log(`  FAIL  ${label}\n        ${(e as Error).message.split("\n")[0]}`);
    fail++;
  }
}

const STARTER = currentPlanPrice("starter")!;
const PROFESSIONAL = currentPlanPrice("professional")!;

console.log("\nplanPricing\n");

test("a new church pays the current list price", () => {
  const p = pricingForPayment({}, "starter", STARTER);
  assert.equal(p.requiredAmount, STARTER);
  assert.equal(p.covers, true);
});

test("a new church underpaying is refused", () => {
  assert.equal(pricingForPayment({}, "professional", 1).covers, false);
});

test("cent rounding still covers the price", () => {
  assert.equal(pricingForPayment({}, "starter", STARTER - 0.004).covers, true);
  assert.equal(pricingForPayment({}, "starter", STARTER - 0.02).covers, false);
});

test("an unknown tier is never covered", () => {
  const p = pricingForPayment({}, "enterprise", 100000);
  assert.equal(p.requiredAmount, null);
  assert.equal(p.covers, false);
  assert.equal(p.priceToRecord, null);
});

test("the first payment records the price agreed to", () => {
  assert.equal(pricingForPayment({}, "starter", STARTER).priceToRecord, STARTER);
});

test("a subscription set up during the trial records it too (amount 0)", () => {
  assert.equal(pricingForPayment({}, "growth", 0).priceToRecord, currentPlanPrice("growth"));
});

// The regression this module exists for.
test("a price rise does not lock out a church that agreed to the old price", () => {
  const church = { subscription: { priceTier: "starter", priceZar: STARTER - 100, payfast_token: "tok" } };
  const p = pricingForPayment(church, "starter", STARTER - 100);
  assert.equal(p.requiredAmount, STARTER - 100);
  assert.equal(p.covers, true);
});

test("the recorded price is never rewritten, so it cannot drift up to a new one", () => {
  const church = { subscription: { priceTier: "starter", priceZar: STARTER - 100, payfast_token: "tok" } };
  assert.equal(pricingForPayment(church, "starter", STARTER - 100).priceToRecord, null);
});

test("a subscription from before recording is grandfathered on its token", () => {
  const church = { subscription: { payfast_token: "tok" } };
  const p = pricingForPayment(church, "starter", STARTER);
  assert.equal(p.requiredAmount, STARTER);
  assert.equal(p.covers, true);
  assert.equal(p.priceToRecord, STARTER);
});

test("a church with no subscription at all is not grandfathered", () => {
  assert.equal(agreedPlanPrice({ subscription: {} }, "starter"), null);
  assert.equal(agreedPlanPrice(null, "starter"), null);
});

test("a price cut is honoured at once, even against a higher recorded price", () => {
  const church = { subscription: { priceTier: "starter", priceZar: STARTER + 100, payfast_token: "tok" } };
  const p = pricingForPayment(church, "starter", STARTER);
  assert.equal(p.requiredAmount, STARTER);
  assert.equal(p.covers, true);
});

test("an upgrade pays the new tier's current price, not the old tier's", () => {
  const church = { subscription: { priceTier: "starter", priceZar: STARTER, payfast_token: "tok" } };
  const p = pricingForPayment(church, "professional", STARTER);
  assert.equal(p.requiredAmount, PROFESSIONAL);
  assert.equal(p.covers, false);
  assert.equal(pricingForPayment(church, "professional", PROFESSIONAL).priceToRecord, PROFESSIONAL);
});

test("a recorded price for one tier is not read as another tier's", () => {
  const church = { subscription: { priceTier: "professional", priceZar: 1 } };
  assert.equal(agreedPlanPrice(church, "starter"), null);
  assert.equal(pricingForPayment(church, "starter", 1).covers, false);
});

test("a junk recorded price is ignored rather than trusted", () => {
  for (const priceZar of [0, -1, "free", null, undefined, NaN]) {
    const church = { subscription: { priceTier: "starter", priceZar } };
    assert.equal(pricingForPayment(church, "starter", 1).covers, false, `priceZar=${String(priceZar)}`);
  }
});

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
