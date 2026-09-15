/**
 * The URL slug a newly registered church is given (#143).
 *
 * Pure apart from the `isTaken` lookup it is handed, so it runs in the server
 * and in tests alike.
 *
 * Two things this guarantees that the inline version in server.ts did not:
 *
 *   - The slug is never one of the app's own paths. A church named "About" or
 *     "Login" used to get `/about` or `/login`, which the router renders as its
 *     own page, so parents following the church's link saw the marketing About
 *     page or "Church not found". It also avoids the paths the marketing site
 *     may add after the domain split (#14).
 *   - The slug is actually free. A clash used to get one random suffix that was
 *     never itself checked.
 */

import { UNCLAIMABLE_SLUGS } from "../constants/appRoutes";

/** Lower-case letters, digits and single hyphens, trimmed. May be empty. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function isClaimableSlug(slug: string): boolean {
  return slug.length >= 2 && !UNCLAIMABLE_SLUGS.includes(slug);
}

const MAX_ATTEMPTS = 20;

export async function generateChurchSlug(
  churchName: string,
  isTaken: (slug: string) => Promise<boolean>,
  random: () => number = Math.random,
): Promise<string> {
  const base = slugify(churchName);

  if (base.length >= 2 && isClaimableSlug(base) && !(await isTaken(base))) {
    return base;
  }

  // A short or unusable base (a name made only of punctuation) gets a neutral
  // stem; a reserved or taken one keeps its name and gains a number, which is
  // what the church would recognise.
  const stem = base.length >= 2 ? base : "church";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = `${stem}-${Math.floor(1000 + random() * 9000)}`;
    if (isClaimableSlug(candidate) && !(await isTaken(candidate))) return candidate;
  }

  throw new Error(`Could not find a free slug for "${churchName}" after ${MAX_ATTEMPTS} attempts`);
}
