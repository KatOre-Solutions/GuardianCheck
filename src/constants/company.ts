/**
 * Registered-entity facts behind the GuardianCheck brand.
 *
 * Single-sourced so About, Contact, the footer, and the Organization JSON-LD
 * (#33) all quote the same legal name, registration number and address rather
 * than four hand-typed copies drifting apart. Taken from the CIPC Disclosure
 * Certificate (registration 2023/913243/07) — update this file, not its
 * callers, if any of these facts change.
 *
 * Deliberately excludes director names/ID numbers and the tax number: the
 * certificate carries them, but none belong on a public page.
 */

export const COMPANY = {
  /** Registered legal name. Distinct from `SITE_NAME` (the product brand). */
  legalName: "Katore Solutions (Pty) Ltd",
  /** CIPC enterprise registration number. */
  registrationNumber: "2023/913243/07",
  registeredAddress: {
    line1: "57 Erasmus Rd",
    suburb: "Edenvale",
    city: "Edenvale",
    province: "Gauteng",
    postalCode: "1609",
    country: "South Africa",
  },
  /** Also used by `WhatsAppSupport` on the home page. */
  whatsapp: "+27796251393",
  /**
   * The only email address configured anywhere in this codebase (see
   * `RESEND_FROM_EMAIL` in `.env.example`) — currently used as a transactional
   * sender, not confirmed as a monitored inbox. Flagged for the business to
   * verify or replace with a real support address; see Contact page.
   */
  email: "notifications@guardiancheck.co.za",
} as const;

/** `registeredAddress` as one display line, e.g. for the footer and About page. */
export function formatCompanyAddress(): string {
  const a = COMPANY.registeredAddress;
  return `${a.line1}, ${a.suburb}, ${a.province}, ${a.postalCode}, ${a.country}`;
}
