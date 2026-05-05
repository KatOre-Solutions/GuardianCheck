
import crypto from "crypto";

const data: any = {
  "m_payment_id": "SUB-aeZ8BIL4njwzJKglkWEX-1777997265590",
  "pf_payment_id": "3140525",
  "payment_status": "COMPLETE",
  "item_name": "GuardianCheck Starter Subscription",
  "item_description": "Subscription for GuardianCheck Starter Subscription",
  "amount_gross": "249.00",
  "amount_fee": "-5.73",
  "amount_net": "243.27",
  "custom_str1": "aeZ8BIL4njwzJKglkWEX",
  "custom_str2": "starter",
  "name_first": "Church",
  "name_last": "Admin",
  "email_address": "admin@church.com",
  "merchant_id": "10047420",
  "token": "ca19b407-4f74-491f-af15-1943e3891f99",
  "billing_date": "2026-05-30"
};

const receivedHash = "5bac1ce2f2cb43d8988a9e0dfefd1a8f";

function md5(str: string) {
  return crypto.createHash("md5").update(str).digest("hex");
}

function test(name: string, keys: string[], encodeMode: string, passphrase = "") {
  let qs = "";
  keys.forEach(key => {
    if (key === "signature") return;
    const val = data[key];
    if (val === undefined || val === null || val === "") return;
    
    let encodedVal = val;
    if (encodeMode === "urlencode") {
      encodedVal = encodeURIComponent(val).replace(/%20/g, "+");
    } else if (encodeMode === "raw") {
      encodedVal = val;
    }
    
    qs += `${key}=${encodedVal}&`;
  });
  
  if (qs.endsWith("&")) qs = qs.substring(0, qs.length - 1);
  if (passphrase) qs += `&passphrase=${passphrase}`;
  
  const hash = md5(qs);
  if (hash === receivedHash) {
    console.log(`MATCH FOUND! [${name}] [Mode: ${encodeMode}] String: ${qs}`);
  } else {
    // console.log(`No match: [${name}] [Mode: ${encodeMode}] Hash: ${hash}`);
  }
}

const keysOriginal = [
  "m_payment_id",
  "pf_payment_id",
  "payment_status",
  "item_name",
  "item_description",
  "amount_gross",
  "amount_fee",
  "amount_net",
  "custom_str1",
  "custom_str2",
  "custom_str3",
  "custom_str4",
  "custom_str5",
  "custom_int1",
  "custom_int2",
  "custom_int3",
  "custom_int4",
  "custom_int5",
  "name_first",
  "name_last",
  "email_address",
  "merchant_id",
  "token",
  "billing_date"
];

console.log("Testing variations...");
test("Original Order", keysOriginal, "urlencode");
test("Original Order", keysOriginal, "raw");

// PayFast standard order usually starts with merchant_id?
const keysStandard = [
  "merchant_id",
  "merchant_key",
  "return_url",
  "cancel_url",
  "notify_url",
  "name_first",
  "name_last",
  "email_address",
  "m_payment_id",
  "amount_gross",
  "item_name",
  "item_description",
  "custom_str1",
  "custom_str2",
  "custom_str3",
  "custom_str4",
  "custom_str5"
];
// But ITN has extra fields...

// Try alphabetical
const keysAlpha = [...keysOriginal].sort();
test("Alphabetical", keysAlpha, "urlencode");
test("Alphabetical", keysAlpha, "raw");

// What if merchant_id is first?
const keysMerchantFirst = ["merchant_id", ...keysOriginal.filter(k => k !== "merchant_id")];
test("Merchant First", keysMerchantFirst, "urlencode");
test("Merchant First", keysMerchantFirst, "raw");

// What if token is involved differently?

// Maybe amount_fee contains something else?
// Let's try with different passphrase just in case
// test("Passphrase 'test'", keysOriginal, "urlencode", "test");

console.log("Variations complete.");
