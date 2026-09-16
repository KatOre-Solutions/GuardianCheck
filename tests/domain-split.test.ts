/**
 * Tests for the domain split (#14) decisions in `src/lib/siteMode.ts` and the
 * church slug generator in `src/lib/churchSlug.ts` (#143).
 *
 * Run with `npm run test:domain-split`. Pure modules, no emulator, no browser.
 *
 * What the cases guard against:
 *
 *   - production changing before anyone flips DOMAIN_SPLIT_PHASE: the apex,
 *     which keeps serving users, must stay "combined" and every link relative
 *     until the phase is "live"
 *   - previews and localhost ever behaving like a production host
 *   - a redirect loop between the hosts (a marketing page on the marketing
 *     host, the app's own pages on the app host)
 *   - the church URLs on posters ever pointing somewhere else
 *   - a church being handed one of the app's own paths as its URL
 */

import { originFor, siteModeFor, crossHostRedirectFor } from "../src/lib/siteMode";
import { generateChurchSlug, isClaimableSlug, slugify } from "../src/lib/churchSlug";
import { MARKETING_ROUTES, RESERVED_SLUGS, isMarketingPath } from "../src/constants/appRoutes";
import { APP_SITE_URL, MARKETING_URL, churchUrlHost, defaultAppOrigin } from "../src/constants/site";

let pass = 0;
let fail = 0;

const check = (name: string, expected: unknown, actual: unknown) => {
  const ok = Object.is(expected, actual);
  if (ok) pass++;
  else fail++;
  console.log(
    `${ok ? "  ok  " : "FAIL  "} ${name}${ok ? "" : `  (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`,
  );
};

const APEX = "guardiancheck.co.za";
const WWW = "www.guardiancheck.co.za";
const PREVIEW = "guardiancheck-git-feat-x.vercel.app";

console.log("site mode per host and phase");
check("apex, off: combined (production is untouched until the switch)", "combined", siteModeFor(APEX, "off"));
check("apex, live: the application", "app", siteModeFor(APEX, "live"));
check("www, off: marketing, so it can be checked before the switch", "marketing", siteModeFor(WWW, "off"));
check("www, live: marketing", "marketing", siteModeFor(WWW, "live"));
check("preview, live: combined", "combined", siteModeFor(PREVIEW, "live"));
check("localhost, live: combined", "combined", siteModeFor("localhost", "live"));

console.log("link origins");
check("combined: app link relative", "", originFor("app", "combined"));
check("combined: marketing link relative", "", originFor("marketing", "combined"));
check("marketing host: app link absolute", APP_SITE_URL, originFor("app", "marketing"));
check("marketing host: marketing link relative", "", originFor("marketing", "marketing"));
check("app host: marketing link absolute", MARKETING_URL, originFor("marketing", "app"));
check("app host: app link relative", "", originFor("app", "app"));

console.log("page loads on the wrong host");
check("combined never redirects", null, crossHostRedirectFor("combined", "/login"));
check("app host hands / to marketing", "marketing", crossHostRedirectFor("app", "/"));
check("app host hands /privacy to marketing", "marketing", crossHostRedirectFor("app", "/privacy"));
check("app host hands /about/ to marketing", "marketing", crossHostRedirectFor("app", "/about/"));
check("app host keeps /app, its own entry point", null, crossHostRedirectFor("app", "/app"));
check("app host keeps a church page", null, crossHostRedirectFor("app", "/grace"));
check("app host keeps /accept-invite", null, crossHostRedirectFor("app", "/accept-invite"));
check("app host keeps /register-church", null, crossHostRedirectFor("app", "/register-church"));
check("marketing host keeps /", null, crossHostRedirectFor("marketing", "/"));
check("marketing host keeps /security", null, crossHostRedirectFor("marketing", "/security"));
check("marketing host hands /login to the app", "app", crossHostRedirectFor("marketing", "/login"));
check("marketing host hands a church page to the app", "app", crossHostRedirectFor("marketing", "/grace/parent"));
check("marketing host hands /register-church to the app", "app", crossHostRedirectFor("marketing", "/register-church"));

console.log("route lists agree");
check("every marketing route is a reserved slug", true, MARKETING_ROUTES.filter((r) => r !== "/").every((r) => RESERVED_SLUGS.includes(r.slice(1))));
check("isMarketingPath rejects app routes", false, isMarketingPath("/app"));

console.log("addresses");
check("church URLs never leave the apex", "guardiancheck.co.za", churchUrlHost());
check("server link fallback is the app host", APP_SITE_URL, defaultAppOrigin());
check("the app host is the apex", "https://guardiancheck.co.za", APP_SITE_URL);

console.log("church slugs");
check("slugify trims and collapses", "grace-community-church", slugify("  Grace -- Community Church! "));
check("reserved app path is not claimable", false, isClaimableSlug("login"));
check("future marketing path is not claimable", false, isClaimableSlug("pricing"));
check("ordinary name is claimable", true, isClaimableSlug("grace"));

const none = async () => false;
const fixed = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

async function slugCases() {
  check("free name is used as is", "grace", await generateChurchSlug("Grace", none));
  check("reserved name gains a number", "about-1000", await generateChurchSlug("About", none, fixed([0])));
  check("future marketing name gains a number", "blog-1000", await generateChurchSlug("Blog", none, fixed([0])));
  check("punctuation-only name gets a neutral stem", "church-1000", await generateChurchSlug("!!!", none, fixed([0])));

  const taken = new Set(["grace", "grace-1000"]);
  check(
    "a taken suffix is retried, not reused",
    "grace-5500",
    await generateChurchSlug("Grace", async (s) => taken.has(s), fixed([0, 0.5])),
  );

  let threw = false;
  try {
    await generateChurchSlug("Grace", async () => true, fixed([0]));
  } catch {
    threw = true;
  }
  check("gives up rather than looping forever", true, threw);
}

slugCases().then(() => {
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
});
