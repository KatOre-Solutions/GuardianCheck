/**
 * Writes the `routes` block of `vercel.json` from the manifest in
 * `src/constants/appRoutes.ts`.
 *
 *   npm run generate:vercel-routes            # rewrite vercel.json
 *   npm run generate:vercel-routes -- --check # fail if it is stale
 *
 * `--check` runs as part of `npm run build`. Vercel reads `vercel.json` from
 * the repository *before* the build runs, so the file cannot be generated at
 * deploy time — it has to be committed, which means it can silently drift from
 * the router. The check is what makes that drift loud.
 *
 * Why `routes` and not `rewrites`: a rewrite cannot set a status code, and the
 * whole point here is serving the SPA shell *with* a 404. `routes` can, but the
 * two keys are mutually exclusive, so this owns the entire block.
 *
 * The domain split (#14) is here too, as real 308s rather than only the inline
 * script in index.html. A crawler, an unfurler or a monitor with no JavaScript
 * must not be told 200 by the marketing host for /login or a church slug: that
 * is a duplicate of a page the app host marks noindex, with nothing to
 * consolidate the two. The redirects are also a round trip cheaper than
 * shipping HTML that then relocates. The script stays as a fallback for any
 * request the edge rule does not catch.
 *
 * Which rules exist follows DOMAIN_SPLIT_PHASE, so nothing is emitted while
 * the phase is "off" and the check below fails the build the moment the phase
 * is flipped without regenerating.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { knownPathPatterns, MARKETING_ROUTES } from "../src/constants/appRoutes";
import {
  APP_HOSTNAME,
  APP_SITE_URL,
  DOMAIN_SPLIT_PHASE,
  MARKETING_HOSTNAMES,
  MARKETING_URL,
  type DomainSplitPhase,
} from "../src/constants/site";

const VERCEL_JSON = path.join(process.cwd(), "vercel.json");
const checkOnly = process.argv.includes("--check");

/** Named marketing pages, without the leading slash and without the root. */
function marketingSegments(): string[] {
  return MARKETING_ROUTES.filter((route) => route !== "/").map((route) => route.slice(1));
}

/**
 * The app host hands its visitors back to the apex for the marketing pages.
 * Not `/`: someone opening app.guardiancheck.co.za wants the application, so
 * that one opens a dashboard. The capture drops any trailing slash, so
 * `/about/` lands on `/about`.
 */
function appHostRedirects(onAppHost: { type: string; value: string }[]) {
  return [
    {
      src: `^/(${marketingSegments().join("|")})/?$`,
      has: onAppHost,
      status: 308,
      headers: { Location: `${MARKETING_URL}/$1` },
    },
  ];
}

/**
 * Once live, the apex serves its own pages and hands everything else to the
 * app host. Expressed as "serve these, redirect the rest" rather than a
 * negative lookahead, because route order already does that job and a plain
 * alternation is far easier to read when a church slug depends on it.
 *
 * Any other marketing hostname (`www`) sends everything to the apex first and
 * lets the rules below decide, so there is one canonical marketing host and
 * only one copy of a marketing page.
 *
 * One block per hostname: `has` conditions are ANDed, so they cannot express
 * "either host".
 */
function marketingHostRedirects(phase: DomainSplitPhase) {
  if (phase !== "live") return [];

  const apex = new URL(MARKETING_URL).hostname;

  return MARKETING_HOSTNAMES.flatMap((hostname) => {
    const onHost = [{ type: "host", value: hostname }];

    if (hostname !== apex) {
      return [{ src: "/(.*)", has: onHost, status: 308, headers: { Location: `${MARKETING_URL}/$1` } }];
    }

    return [
      { src: "^/$", has: onHost, dest: "/index.html" },
      { src: `^/(?:${marketingSegments().join("|")})/?$`, has: onHost, dest: "/index.html" },
      { src: "/(.*)", has: onHost, status: 308, headers: { Location: `${APP_SITE_URL}/$1` } },
    ];
  });
}

export function buildRoutes(phase: DomainSplitPhase = DOMAIN_SPLIT_PHASE) {
  const onAppHost = [{ type: "host", value: APP_HOSTNAME }];

  return [
    // app.guardiancheck.co.za (#14) is never indexed, whatever the phase: it is
    // a new host, and before the switch it serves the whole site, which would
    // otherwise be a duplicate of the apex. A header rather than per-page tags,
    // so no response (JS, images, the 404 shell) can miss it.
    { src: "/(.*)", has: onAppHost, headers: { "X-Robots-Tag": "noindex, nofollow" }, continue: true },
    // Its robots.txt allows crawling so that the noindex above is actually
    // seen; see the file.
    { src: "^/robots\\.txt$", has: onAppHost, dest: "/robots-app.txt" },
    // API first: it is the one path family Express still owns in production.
    { src: "/api/(.*)", dest: "/server.ts" },
    // Serve real files -- assets, robots.txt, sitemap.xml, og-image.png --
    // before any SPA rewrite, or they would all become index.html.
    { handle: "filesystem" },
    // After the filesystem, so a host only ever redirects a *page*: its own
    // assets, SEO files and service worker are served from where they are.
    ...appHostRedirects(onAppHost),
    ...marketingHostRedirects(phase),
    ...knownPathPatterns().map((src) => ({ src, dest: "/index.html" })),
    // Anything left matches no route in the app. Still serve the shell, so the
    // client renders a real not-found page rather than a blank body, but say
    // 404 in the status line -- that is the part crawlers act on.
    { src: "/(.*)", dest: "/index.html", status: 404 },
  ];
}

/**
 * Only when run as a script. tests/domain-split.test.ts imports
 * {@link buildRoutes} to check the emitted table for redirect loops, and it
 * must not rewrite vercel.json or exit the process to do so.
 */
function main(): void {
  const config = JSON.parse(readFileSync(VERCEL_JSON, "utf8"));
  const expected = buildRoutes();

  if (config.rewrites) {
    throw new Error(
      "vercel.json still has a `rewrites` key. Vercel rejects `routes` and " +
        "`rewrites` together, and only `routes` can set a status code. Remove it.",
    );
  }

  const current = JSON.stringify(config.routes ?? null);
  const wanted = JSON.stringify(expected);

  if (current === wanted) {
    console.log(`vercel.json routes: up to date (${expected.length} entries)`);
    process.exit(0);
  }

  if (checkOnly) {
    console.error(
      "vercel.json routes are stale.\n" +
        "src/constants/appRoutes.ts has changed since they were generated, so " +
        "production would 404 a page the router can render, or serve 200 for one " +
        "it cannot.\n\nRun: npm run generate:vercel-routes\n",
    );
    process.exit(1);
  }

  config.routes = expected;
  writeFileSync(VERCEL_JSON, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  console.log(`vercel.json routes: regenerated (${expected.length} entries)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
