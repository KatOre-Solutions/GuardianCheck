import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Shared phone normalisation and validation -- imported by both the client
 * (guardian/profile phone fields) and the server (scripts/report-phone-numbers.ts).
 *
 * Why this exists: `guardians.phone` has never been validated (free text,
 * and the guardian-add form's `pattern="[0-9]*"` actively forbade a leading
 * `+`), and `users.cellNumber` had a hand-rolled South-Africa-only regex
 * that validated a local "0..." or "+27..." string but stored whichever
 * form the user typed -- so the column mixes both formats, plus sentinel
 * placeholders like "Account Holder" and "0000000000" (SetupWizard's demo
 * data). None of it is E.164, so none of it is dialable by a programmatic
 * channel (WhatsApp's Cloud API requires E.164). See
 * docs/whatsapp-communication-plan.md section 1.
 *
 * This module doesn't migrate anything by itself -- see
 * scripts/report-phone-numbers.ts for that, which is dry-run by default,
 * same as scripts/backfill-church-public.ts.
 */

const DEFAULT_COUNTRY = "ZA";

// Free-text placeholders seen in production data, plus the general shape of
// a placeholder: a string of one digit repeated. No real subscriber number
// is "0000000000" or "1111111111" -- these come from demo/seed data
// (SetupWizard.tsx) or a required field someone filled in without a real
// number to give.
const KNOWN_SENTINELS = new Set(["account holder", "n/a", "na", "none", "tbd", "-", "unknown"]);

export function isSentinelPhone(raw: string): boolean {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "") return false; // empty is "invalid", not a sentinel -- see classifyPhone
  if (KNOWN_SENTINELS.has(trimmed)) return true;
  return /^(\d)\1{9,}$/.test(trimmed);
}

export type PhoneCategory = "valid" | "normalizable" | "invalid" | "sentinel" | "needs-user-action";

export interface PhoneClassification {
  category: PhoneCategory;
  /** Present only for "valid" (unchanged) and "normalizable" (the value migration would write). */
  e164?: string;
}

/**
 * Buckets a raw stored value exactly as scripts/report-phone-numbers.ts's
 * report does:
 *
 *   - valid:            already E.164 (starts with "+", parses, real number)
 *   - normalizable:     parses under `defaultCountry` but isn't E.164 yet
 *                        (a local "0..." SA number, most commonly)
 *   - sentinel:         a known placeholder -- never touched by a migration
 *   - needs-user-action: digits that could plausibly be a foreign number
 *                        missing its country code -- a migration should not
 *                        guess; someone has to ask the family
 *   - invalid:          empty, or not phone-number-shaped at all
 */
export function classifyPhone(raw: string | null | undefined, defaultCountry: string = DEFAULT_COUNTRY): PhoneClassification {
  if (raw == null || raw.trim() === "") return { category: "invalid" };
  if (isSentinelPhone(raw)) return { category: "sentinel" };

  const trimmed = raw.trim();

  let parsed;
  try {
    parsed = parsePhoneNumberFromString(trimmed, defaultCountry as any);
  } catch {
    parsed = undefined;
  }

  if (parsed && parsed.isValid()) {
    return trimmed.startsWith("+")
      ? { category: "valid", e164: parsed.number }
      : { category: "normalizable", e164: parsed.number };
  }

  // Didn't parse as a `defaultCountry` number. If it's still plausibly a
  // phone number (digits, optionally a leading +, long enough to be a real
  // subscriber number) it's most likely a foreign number missing its
  // country code -- flag for a human rather than guessing.
  const digitsOnly = trimmed.replace(/[\s\-().]/g, "");
  if (/^\+?\d+$/.test(digitsOnly) && digitsOnly.replace(/^\+/, "").length >= 7) {
    return { category: "needs-user-action" };
  }

  return { category: "invalid" };
}

/** True for a value already in valid E.164 form -- `+` followed by 8-15 digits, no leading zero. */
export function isValidE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

/**
 * Live validation for a phone input as the user types -- e.g. the guardian
 * "add" form. Returns the E.164 form to store on success, or null while the
 * input isn't (yet) a valid number, without throwing on partial input.
 */
export function normalizeToE164(raw: string, defaultCountry: string = DEFAULT_COUNTRY): string | null {
  if (!raw || raw.trim() === "") return null;
  try {
    const parsed = parsePhoneNumberFromString(raw.trim(), defaultCountry as any);
    return parsed && parsed.isValid() ? parsed.number : null;
  } catch {
    return null;
  }
}
