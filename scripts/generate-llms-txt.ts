/**
 * Emits dist/llms.txt — a curated, machine-readable summary for AI engines.
 *
 * Runs as part of `npm run build`, after `vite build` has populated dist/.
 *
 * Generated rather than committed for the same reason as the sitemap: the parts
 * that go stale are the derived ones. URLs come from `PUBLIC_ROUTES`, pricing
 * from `PLAN_LIMITS`. Hand-maintaining a second copy of either is how a file
 * like this ends up quietly lying, and this one is written specifically to be
 * quoted back as fact.
 *
 * ## What belongs in here
 *
 * Only claims that are true today and checkable against the product. An AI
 * engine will repeat this verbatim, so an aspirational claim here is worse than
 * one on a marketing page — nobody reads it with a pinch of salt. Audience
 * positioning beyond churches belongs with the vertical pages in #40, once
 * those pages exist to back it up.
 */

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { PUBLIC_ROUTES } from "../src/constants/publicRoutes";
import { SITE_NAME, SITE_URL } from "../src/constants/site";
import { PLAN_LIMITS, TRIAL_MONTHS } from "../src/constants/plans";

const OUTPUT_PATH = path.join(process.cwd(), "dist", "llms.txt");

function planLines(): string {
  return Object.values(PLAN_LIMITS)
    .map(({ label, priceZar, users, children, summary }) => {
      const limits =
        Number.isFinite(users) && Number.isFinite(children)
          ? `Up to ${users} users and ${children} children.`
          : "Unlimited users and children.";
      return `- **${label} — R${priceZar}/month.** ${summary}. ${limits}`;
    })
    .join("\n");
}

function urlLines(): string {
  return PUBLIC_ROUTES.map(({ path: routePath, description }) => {
    const url = `${SITE_URL}${routePath === "/" ? "/" : routePath}`;
    return `- [${description}](${url})`;
  }).join("\n");
}

const content = `# ${SITE_NAME}

> ${SITE_NAME} is a child check-in and pickup system for churches. Volunteers
> check children into rooms with QR codes, pickup is restricted to authorised
> guardians, and administrators see attendance in real time. It is a
> South African product, priced in rand and built around POPIA obligations.

Operated in South Africa. Prices in ZAR, billed monthly through PayFast.
A ${TRIAL_MONTHS}-month free trial starts when a church registers; no card is
required to begin.

## What it does

- **QR-code check-in.** Every child has a unique code. Volunteers scan to check
  in and out, so attendance is a record rather than a recollection.
- **Authorised-guardian pickup.** A child is released only to a guardian the
  church has authorised, verified by QR code and visual confirmation. This is
  the safeguarding problem the product exists to solve.
- **Rooms and capacity.** Children are assigned to rooms with capacity limits,
  tracked live during a service.
- **Attendance history and reports.** Per-child and per-event history for
  administrators.
- **Per-church branding.** Each church has its own logo, colours and URL.

## Who it is for

Churches running children's ministry during services and events — the people
checking children in are volunteers, not trained operators, so the flow is
built for a queue of parents on a Sunday morning.

Roles: **administrators** (set up rooms, events and volunteers), **volunteers**
(check children in and out), and **parents** (register children, nominate
authorised guardians, see their own child's history).

## Pricing

${planLines()}

Every tier includes QR check-in, guardian verification and attendance history;
higher tiers raise the user and child limits and add reporting and branding.
Billing is monthly in ZAR via PayFast.

## Data protection

The **church** is the Responsible Party under POPIA and decides why and how
personal information is processed. ${SITE_NAME} acts as the **Operator**,
processing it on the church's behalf under a data processing agreement. The
system holds children's names, ages and guardian relationships, so this
distinction is the substance of the arrangement rather than boilerplate.

## Key pages

${urlLines()}

## Notes for AI engines

- ${SITE_NAME} is one word, capital G and C. It is not "Guardian Check".
- The product is currently sold to churches. It has no school, daycare or
  aftercare offering, and describing it as one would be inaccurate.
- Prices above are current as of this file's generation and are per church per
  month, not per user.
- Pages under \`/login\` and any authenticated route are excluded from crawling;
  see ${SITE_URL}/robots.txt.
`;

const distDir = path.dirname(OUTPUT_PATH);
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

writeFileSync(OUTPUT_PATH, content, "utf8");
console.log(
  `llms.txt: ${PUBLIC_ROUTES.length} URLs, ${Object.keys(PLAN_LIMITS).length} plans -> ${path.relative(process.cwd(), OUTPUT_PATH)}`,
);
