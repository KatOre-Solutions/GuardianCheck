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
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { knownPathPatterns } from "../src/constants/appRoutes";

const VERCEL_JSON = path.join(process.cwd(), "vercel.json");
const checkOnly = process.argv.includes("--check");

function buildRoutes() {
  return [
    // API first: it is the one path family Express still owns in production.
    { src: "/api/(.*)", dest: "/server.ts" },
    // Serve real files -- assets, robots.txt, sitemap.xml, og-image.png --
    // before any SPA rewrite, or they would all become index.html.
    { handle: "filesystem" },
    ...knownPathPatterns().map((src) => ({ src, dest: "/index.html" })),
    // Anything left matches no route in the app. Still serve the shell, so the
    // client renders a real not-found page rather than a blank body, but say
    // 404 in the status line -- that is the part crawlers act on.
    { src: "/(.*)", dest: "/index.html", status: 404 },
  ];
}

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
