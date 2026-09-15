/**
 * Tests for the domain split (#14) decisions in `src/lib/siteMode.ts` and the
 * church slug generator in `src/lib/churchSlug.ts` (#143).
 *
 * Run with `npm run test:domain-split`. Pure modules, no emulator, no browser.
 *
 * What the cases guard against:
 *
 *   - production changing before anyone flips DOMAIN_SPLIT_PHASE: the apex must
 *     stay "combined" and every link relative until the phase is "live"
 *   - previews and localhost ever behaving like a production host
 *   - a redirect loop between the hosts (`/` on the app host, a marketing page
 *     on the marketing host)
 *   - an invite token or payment result being lost on the way across
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
const APP = "app.guardiancheck.co.za";
const PREVIEW = "guardiancheck-git-feat-x.vercel.app";

console.log("site mode per host and phase");
check("apex, off: combined", "combined", siteModeFor(APEX, "off"));
check("apex, announce: combined", "combined", siteModeFor(APEX, "announce"));
check("apex, live: marketing", "marketing", siteModeFor(APEX, "live"));
check("www, live: marketing", "marketing", siteModeFor(WWW, "live"));
check("app host, off: app (testable before the switch)", "app", siteModeFor(APP, "off"));
check("app host, live: app", "app", siteModeFor(APP, "live"));
check("preview, live: combined", "combined", siteModeFor(PREVIEW, "live"));
check("localhost, live: combined", "combined", siteModeFor("localhost", "live"));

console.log("link origins");
check("combined apex, off: app link relative", "", originFor("app", "combined", APEX, "off"));
check("combined apex, off: marketing link relative", "", originFor("marketing", "combined", APEX, "off"));
check("combined apex, announce: signup goes to app host", APP_SITE_URL, originFor("app", "combined", APEX, "announce"));
check("preview, announce: stays relative", "", originFor("app", "combined", PREVIEW, "announce"));
check("marketing host: app link absolute", APP_SITE_URL, originFor("app", "marketing", APEX, "live"));
check("marketing host: marketing link relative", "", originFor("marketing", "marketing", APEX, "live"));
check("app host: marketing link absolute", MARKETING_URL, originFor("marketing", "app", APP, "off"));
check("app host: app link relative", "", originFor("app", "app", APP, "live"));

console.log("page loads on the wrong host");
check("combined never redirects", null, crossHostRedirectFor("combined", "/login"));
check("app host keeps /", null, crossHostRedirectFor("app", "/"));
check("app host sends /privacy to the apex", "marketing", crossHostRedirectFor("app", "/privacy"));
check("app host sends /about/ to the apex", "marketing", crossHostRedirectFor("app", "/about/"));
check("app host keeps a church page", null, crossHostRedirectFor("app", "/grace"));
check("app host keeps /accept-invite", null, crossHostRedirectFor("app", "/accept-invite"));
check("marketing host keeps /", null, crossHostRedirectFor("marketing", "/"));
check("marketing host keeps /security", null, crossHostRedirectFor("marketing", "/security"));
check("marketing host sends /login to the app", "app", crossHostRedirectFor("marketing", "/login"));
check("marketing host sends a church page to the app", "app", crossHostRedirectFor("marketing", "/grace/parent"));
check("marketing host sends /register-church to the app", "app", crossHostRedirectFor("marketing", "/register-church"));

console.log("route lists agree");
check("every marketing route is a reserved slug", true, MARKETING_ROUTES.filter((r) => r !== "/").every((r) => RESERVED_SLUGS.includes(r.slice(1))));
check("isMarketingPath rejects app routes", false, isMarketingPath("/app"));

console.log("addresses per phase");
check("church URLs on the apex while off", "guardiancheck.co.za", churchUrlHost("off"));
check("church URLs on the app host once announced", "app.guardiancheck.co.za", churchUrlHost("announce"));
check("server link fallback while off", MARKETING_URL, defaultAppOrigin("off"));
check("server link fallback when live", APP_SITE_URL, defaultAppOrigin("live"));

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
