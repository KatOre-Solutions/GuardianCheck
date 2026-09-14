/**
 * Registered-entity facts behind the GuardianCheck brand.
 *
 * Single-sourced so About, Contact, and the footer all quote the same legal
 * name and registration number rather than three hand-typed copies drifting
 * apart. Taken from the CIPC Disclosure Certificate (registration
 * 2023/913243/07). Update this file, not its callers, if any of these
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
  /** Read directly by every marketing WhatsApp entry point (`WhatsAppFloat`, `DemoInvite`, `Hero`, `FinalCta`, `MarketingHeader`) and by `WhatsAppSupport` elsewhere in the app. */
  whatsapp: "+27796251393",
  /**
   * Forwards via ImprovMX to a real inbox (MX records on guardiancheck.co.za
   * point to ImprovMX). Distinct from `RESEND_FROM_EMAIL` in `.env.example`,
   * which is the transactional sender and has no inbox behind it.
   */
  email: "info@guardiancheck.co.za",
} as const;
