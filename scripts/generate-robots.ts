/**
 * Emits dist/robots.txt from the template in public/robots.txt, with the
 * `Sitemap:` line pointed at the origin that actually serves the public site.
 *
 * Runs as part of `npm run build`, after `vite build` has copied public/ into
 * dist/. Generated rather than static for one reason: the domain split (#14)
 * moves the marketing site to www, and `SITE_URL` moves with it. A robots.txt
 * advertising a sitemap on the wrong host is the kind of error nothing surfaces
 * until pages quietly stop being recrawled.
 *
 * The template keeps its own `Sitemap:` line so that the file is still correct
 * when read directly in the repository.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { SITE_URL } from "../src/constants/site";

const ROOT = process.cwd();
const TEMPLATE_PATH = path.join(ROOT, "public", "robots.txt");
const OUTPUT_PATH = path.join(ROOT, "dist", "robots.txt");

function main(): void {
  if (!existsSync(path.dirname(OUTPUT_PATH))) {
    throw new Error(`dist/ not found. Run "vite build" before this script.`);
  }

  const template = readFileSync(TEMPLATE_PATH, "utf8");
  const sitemapUrl = `${SITE_URL}/sitemap.xml`;

  if (!/^Sitemap:/m.test(template)) {
    throw new Error(`public/robots.txt has no "Sitemap:" line to rewrite.`);
  }

  const output = template
    .replace(/^Sitemap:.*$/m, `Sitemap: ${sitemapUrl}`)
    // The header comment names the site it belongs to; keep it honest too.
    .replace(/^# robots\.txt for GuardianCheck .*$/m, `# robots.txt for GuardianCheck, ${SITE_URL}`);

  writeFileSync(OUTPUT_PATH, output, "utf8");
  console.log(`robots.txt: sitemap -> ${sitemapUrl}`);
}

main();
