/**
 * Emits dist/sitemap.xml from the route manifest in src/constants/publicRoutes.ts.
 *
 * Runs as part of `npm run build`, after `vite build` has populated dist/.
 * Generating rather than committing a static file means the sitemap cannot
 * drift from the manifest, and the manifest is the thing a developer actually
 * edits when a page lands.
 *
 * Before writing, every URL is checked against the Disallow rules in
 * public/robots.txt and the build fails on a contradiction — telling crawlers
 * to index a page you have also told them not to crawl is the one error in a
 * sitemap that is both easy to make and silent in production.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { PUBLIC_ROUTES, SITE_URL } from "../src/constants/publicRoutes";

const ROOT = process.cwd();
const ROBOTS_PATH = path.join(ROOT, "public", "robots.txt");
const OUTPUT_PATH = path.join(ROOT, "dist", "sitemap.xml");

/** Reads `Disallow:` paths out of robots.txt. */
function readDisallowRules(): string[] {
  if (!existsSync(ROBOTS_PATH)) {
    throw new Error(`robots.txt not found at ${ROBOTS_PATH}`);
  }

  return readFileSync(ROBOTS_PATH, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().startsWith("disallow:"))
    .map((line) => line.slice("disallow:".length).trim())
    .filter(Boolean);
}

/**
 * Applies robots.txt matching: `*` is any run of characters, `$` anchors the
 * end, and an unanchored rule is a prefix match.
 */
function isDisallowed(routePath: string, rule: string): boolean {
  const anchored = rule.endsWith("$");
  const body = anchored ? rule.slice(0, -1) : rule;

  const pattern =
    body
      .split("*")
      .map((segment) => segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*") + (anchored ? "$" : "");

  return new RegExp(`^${pattern}`).test(routePath);
}

function assertManifestIsSane(): void {
  const seen = new Set<string>();

  for (const { path: routePath } of PUBLIC_ROUTES) {
    if (!routePath.startsWith("/")) {
      throw new Error(`Route "${routePath}" must start with "/"`);
    }
    if (seen.has(routePath)) {
      throw new Error(`Route "${routePath}" is listed twice`);
    }
    seen.add(routePath);
  }
}

function assertNoneAreDisallowed(): void {
  const rules = readDisallowRules();

  const conflicts = PUBLIC_ROUTES.flatMap(({ path: routePath }) =>
    rules
      .filter((rule) => isDisallowed(routePath, rule))
      .map((rule) => `  ${routePath} is blocked by "Disallow: ${rule}"`),
  );

  if (conflicts.length > 0) {
    throw new Error(
      `Sitemap contradicts robots.txt:\n${conflicts.join("\n")}\n` +
        `Either drop the route from PUBLIC_ROUTES or loosen the robots.txt rule.`,
    );
  }
}

function renderSitemap(): string {
  const urls = PUBLIC_ROUTES.map(
    ({ path: routePath }) => `  <url>\n    <loc>${SITE_URL}${routePath}</loc>\n  </url>`,
  ).join("\n");

  // Only <loc> is emitted. Google ignores <changefreq> and <priority>, and a
  // <lastmod> set to build time would claim every page changed on every deploy
  // — a signal search engines learn to distrust. Add <lastmod> per route only
  // when there is a real content-modified date to put in it.
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function main(): void {
  assertManifestIsSane();
  assertNoneAreDisallowed();

  if (!existsSync(path.dirname(OUTPUT_PATH))) {
    throw new Error(`dist/ not found — run "vite build" before this script.`);
  }

  writeFileSync(OUTPUT_PATH, renderSitemap(), "utf8");
  console.log(`sitemap.xml: ${PUBLIC_ROUTES.length} URLs -> ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main();
