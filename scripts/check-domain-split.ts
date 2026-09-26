/**
 * Refuses to build a "live" domain split (#14) that would ship broken links.
 *
 *   npm run check:domain-split      # runs as part of `npm run build`
 *
 * Flipping DOMAIN_SPLIT_PHASE to "live" is one character, and on its own it is
 * wrong. The switch is only correct once the environment agrees with it, and
 * two of those settings are silent when missing:
 *
 *   - APP_URL is read by server.ts for verification and invitation emails. Left
 *     on the apex, every link mailed after the switch lands on the marketing
 *     site, which then bounces the recipient to the app host. Left unset, the
 *     server falls back to the request's own origin, which for a form posted
 *     from the apex is the apex again.
 *   - VITE_APP_URL is baked into the bundle by vite.config.ts at *build* time,
 *     and it is what PayFastButton builds return_url, cancel_url and
 *     notify_url from. Setting it in Vercel without rebuilding changes
 *     nothing, and a wrong value points a payment's notify_url at a host that
 *     will not be running the API.
 *
 * Neither failure is visible in a smoke test: the links look plausible and the
 * redirect hides the rest. So the build is where this has to be caught.
 *
 * Nothing is checked while the phase is "off", because nothing has moved.
 */

import { loadEnv } from "vite";
import { APP_SITE_URL, DOMAIN_SPLIT_PHASE } from "../src/constants/site";

// Same resolution vite.config.ts uses, so this checks the value that will
// actually be compiled in rather than a different view of the environment.
const env = loadEnv(process.env.NODE_ENV === "development" ? "development" : "production", ".", "");

function resolved(name: string): string {
  return (env[name] ?? "").trim().replace(/\/+$/, "");
}

function main(): void {
  if (DOMAIN_SPLIT_PHASE !== "live") {
    console.log('domain split: phase "off", nothing to check');
    return;
  }

  const problems: string[] = [];

  const appUrl = resolved("APP_URL");
  if (appUrl !== APP_SITE_URL) {
    problems.push(
      `APP_URL is ${appUrl || "unset"}, expected ${APP_SITE_URL}. ` +
        `Verification and invitation emails would point at the wrong host.`,
    );
  }

  // vite.config.ts falls back to APP_URL, so mirror that here rather than
  // demanding a variable the build does not actually require.
  const viteAppUrl = resolved("VITE_APP_URL") || appUrl;
  if (viteAppUrl !== APP_SITE_URL) {
    problems.push(
      `VITE_APP_URL is ${resolved("VITE_APP_URL") || "unset"}, expected ${APP_SITE_URL}. ` +
        `PayFast return_url, cancel_url and notify_url are built from it, and it is baked in at build time.`,
    );
  }

  // Optional, but if it is set it overrides the derived notify_url entirely.
  const notifyUrl = resolved("VITE_PAYFAST_NOTIFY_URL");
  if (notifyUrl && !notifyUrl.startsWith(APP_SITE_URL)) {
    problems.push(
      `VITE_PAYFAST_NOTIFY_URL is ${notifyUrl}, which is not on ${APP_SITE_URL}. ` +
        `Unset it to derive the notify_url from VITE_APP_URL, or point it at the app host.`,
    );
  }

  if (problems.length > 0) {
    console.error(
      `\nDOMAIN_SPLIT_PHASE is "live" but the environment does not match:\n\n` +
        problems.map((problem) => `  - ${problem}`).join("\n") +
        `\n\nSet these in the Vercel project's production environment and rebuild, ` +
        `or set the phase back to "off".\n`,
    );
    process.exit(1);
  }

  console.log(`domain split: phase "live", APP_URL and VITE_APP_URL both ${APP_SITE_URL}`);
}

main();
