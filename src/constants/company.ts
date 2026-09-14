/**
 * Registered-entity facts behind the GuardianCheck brand.
 *
 * Single-sourced so About, Contact, and the footer all quote the same legal
 * name and registration number rather than three hand-typed copies drifting
 * apart. Taken from the CIPC Disclosure Certificate (registration
 * 2023/913243/07) — update this file, not its callers, if any of these
 * facts change.
 *
 * Deliberately excludes director names/ID numbers, the tax number, and the
 * registered address: the certificate carries them, but the business is
 * online-only with no separate physical office, and the address on file is
 * a director's home address, not something to publish.
 */

export const COMPANY = {
  /** Registered legal name. Distinct from `SITE_NAME` (the product brand). */
  legalName: "Katore Solutions (Pty) Ltd",
  /** CIPC enterprise registration number. */
  registrationNumber: "2023/913243/07",
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
