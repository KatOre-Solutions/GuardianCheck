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
 *   - a redirect loop between the hosts, in particular `/` on the app host and
 *     a marketing page on the marketing host
 *   - an invite token or payment result being lost on the way across
 *   - a church being handed one of the app's own paths as its URL
 *   - the edge redirects in vercel.json disagreeing with siteMode.ts, or
 *     pointing at each other: a loop between the two hosts takes the site down
 *     for everyone, and those rules are only ever exercised in production
 *   - PayFast's return, cancel and notify URLs moving to the wrong host. The
 *     notify URL especially: PayFast records it at signup and uses it for
 *     every recurring charge after that
 */

import { originFor, siteModeFor, crossHostRedirectFor } from "../src/lib/siteMode";
import { generateChurchSlug, isClaimableSlug, slugify } from "../src/lib/churchSlug";
import {
  FUTURE_MARKETING_SLUGS,
  MARKETING_ROUTES,
  RESERVED_SLUGS,
  UNCLAIMABLE_SLUGS,
  isMarketingPath,
} from "../src/constants/appRoutes";
import { APP_SITE_URL, MARKETING_URL, churchUrlHost, defaultAppOrigin } from "../src/constants/site";
import { payFastUrls } from "../src/lib/payfastUrls";
import { buildRoutes } from "../scripts/generate-vercel-routes";

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
check("apex, off: combined (production is untouched until the switch)", "combined", siteModeFor(APEX, "off"));
check("apex, live: marketing", "marketing", siteModeFor(APEX, "live"));
check("www, live: marketing", "marketing", siteModeFor(WWW, "live"));
check("app host, off: the application, so it can be checked first", "app", siteModeFor(APP, "off"));
check("app host, live: the application", "app", siteModeFor(APP, "live"));
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
check("app host keeps /, its own launch route", null, crossHostRedirectFor("app", "/"));
check("app host hands /privacy to marketing", "marketing", crossHostRedirectFor("app", "/privacy"));
check("app host hands /about/ to marketing", "marketing", crossHostRedirectFor("app", "/about/"));
check("app host keeps /app", null, crossHostRedirectFor("app", "/app"));
check("app host keeps a church page", null, crossHostRedirectFor("app", "/grace"));
check("app host keeps /accept-invite", null, crossHostRedirectFor("app", "/accept-invite"));
check("app host keeps /register-church", null, crossHostRedirectFor("app", "/register-church"));
check("marketing host keeps /", null, crossHostRedirectFor("marketing", "/"));
check("marketing host keeps /security", null, crossHostRedirectFor("marketing", "/security"));
check("marketing host hands /login to the app", "app", crossHostRedirectFor("marketing", "/login"));
check("marketing host hands /parent to the app", "app", crossHostRedirectFor("marketing", "/parent"));
check("marketing host hands a church page to the app", "app", crossHostRedirectFor("marketing", "/grace/parent"));
check("marketing host hands /register-church to the app", "app", crossHostRedirectFor("marketing", "/register-church"));

console.log("route lists agree");
check("every marketing route is a reserved slug", true, MARKETING_ROUTES.filter((r) => r !== "/").every((r) => RESERVED_SLUGS.includes(r.slice(1))));
check("isMarketingPath rejects app routes", false, isMarketingPath("/app"));
// A word in both lists means a marketing page now exists for it, so the entry
// in FUTURE_MARKETING_SLUGS is stale: it should have moved into
// MARKETING_ROUTES, which is what puts it in RESERVED_SLUGS and so in front of
// the router. Without this the two lists drift in silence.
check(
  "no future marketing slug is already a live route",
  "[]",
  JSON.stringify(FUTURE_MARKETING_SLUGS.filter((slug) => (RESERVED_SLUGS as readonly string[]).includes(slug))),
);
check(
  "registration refuses every reserved and every future path",
  true,
  [...RESERVED_SLUGS, ...FUTURE_MARKETING_SLUGS].every((slug) => UNCLAIMABLE_SLUGS.includes(slug)),
);

console.log("addresses per phase");
check("church URLs on the apex while off", "guardiancheck.co.za", churchUrlHost("off"));
check("church URLs on the app host once live", "app.guardiancheck.co.za", churchUrlHost("live"));
check("server link fallback while off", MARKETING_URL, defaultAppOrigin("off"));
check("server link fallback when live", APP_SITE_URL, defaultAppOrigin("live"));

console.log("payfast urls");
{
  const onApp = payFastUrls({ appUrl: APP_SITE_URL, fallbackOrigin: "https://guardiancheck.co.za", plan: "growth" });
  check("return_url is the app host", `${APP_SITE_URL}/admin?payment=success&plan=growth`, onApp.returnUrl);
  check("cancel_url is the app host", `${APP_SITE_URL}/admin?payment=cancel`, onApp.cancelUrl);
  check("notify_url is the app host", `${APP_SITE_URL}/api/payfast-itn`, onApp.notifyUrl);

  const beforeSplit = payFastUrls({ appUrl: MARKETING_URL, fallbackOrigin: "https://x.vercel.app", plan: "starter" });
  check("before the split every URL is the apex", `${MARKETING_URL}/api/payfast-itn`, beforeSplit.notifyUrl);

  // VITE_APP_URL is baked in at build time, so an unset one is what a preview
  // deployment and a misconfigured production build both look like. It has to
  // fall back to the origin actually serving the page, never to a constant.
  const unset = payFastUrls({ appUrl: "", fallbackOrigin: "https://guardian-check-git-x.vercel.app", plan: "growth" });
  check(
    "unset VITE_APP_URL falls back to this origin",
    "https://guardian-check-git-x.vercel.app/api/payfast-itn",
    unset.notifyUrl,
  );
  check(
    "unset VITE_APP_URL keeps return_url on this origin",
    "https://guardian-check-git-x.vercel.app/admin?payment=success&plan=growth",
    unset.returnUrl,
  );

  const trailing = payFastUrls({ appUrl: `${APP_SITE_URL}/`, fallbackOrigin: "", plan: "growth" });
  check("a trailing slash never doubles up", `${APP_SITE_URL}/admin?payment=cancel`, trailing.cancelUrl);

  const override = payFastUrls({
    appUrl: MARKETING_URL,
    fallbackOrigin: "",
    notifyUrlOverride: `${APP_SITE_URL}/api/payfast-itn`,
    plan: "growth",
  });
  check("an explicit notify override wins", `${APP_SITE_URL}/api/payfast-itn`, override.notifyUrl);
  check("the override does not touch return_url", `${MARKETING_URL}/admin?payment=success&plan=growth`, override.returnUrl);
}

console.log("edge redirects in vercel.json");
{
  type Route = Record<string, any>;

  /**
   * What Vercel would do with `path` on `host`: the same rules in the same
   * order, where `has` filters by host and `continue` falls through. The
   * `handle` phase is skipped, which is accurate for every path here because
   * none of them is a real file.
   */
  const resolve = (routes: Route[], host: string, path: string): string => {
    for (const route of routes) {
      if (route.handle) continue;
      if (route.has && !route.has.every((c: Route) => c.type === "host" && c.value === host)) continue;
      const match = new RegExp(route.src).exec(path);
      if (!match) continue;
      if (route.continue) continue;
      if (route.status && route.headers?.Location) {
        const location = String(route.headers.Location).replace(/[$](\d)/g, (_m, n: string) => match[Number(n)] ?? "");
        return `${route.status} ${location}`;
      }
      return `serve ${route.dest}${route.status ? ` (${route.status})` : ""}`;
    }
    return "no match";
  };

  const off = buildRoutes("off") as Route[];
  const live = buildRoutes("live") as Route[];

  check("phase off: the apex still serves the app", "serve /index.html", resolve(off, APEX, "/login"));
  check("phase off: the apex still serves a church page", "serve /index.html", resolve(off, APEX, "/grace"));
  check("phase off: /api is never redirected", "serve /server.ts", resolve(off, APEX, "/api/payfast-itn"));
  check("phase off: the app host already serves the app", "serve /index.html", resolve(off, APP, "/login"));

  check("live: the apex serves its home page", "serve /index.html", resolve(live, APEX, "/"));
  check("live: the apex serves /about", "serve /index.html", resolve(live, APEX, "/about"));
  check("live: the apex serves /about/", "serve /index.html", resolve(live, APEX, "/about/"));
  check("live: /login is a 308 to the app host", `308 ${APP_SITE_URL}/login`, resolve(live, APEX, "/login"));
  check("live: a church page is a 308", `308 ${APP_SITE_URL}/grace`, resolve(live, APEX, "/grace"));
  check("live: a church child page is a 308", `308 ${APP_SITE_URL}/grace/admin`, resolve(live, APEX, "/grace/admin"));
  check("live: /accept-invite is a 308", `308 ${APP_SITE_URL}/accept-invite`, resolve(live, APEX, "/accept-invite"));
  check("live: /api is still never redirected", "serve /server.ts", resolve(live, APEX, "/api/payfast-itn"));
  check("live: www hands everything to the apex first", `308 ${MARKETING_URL}/login`, resolve(live, WWW, "/login"));

  check("the app host hands /about back", `308 ${MARKETING_URL}/about`, resolve(live, APP, "/about"));
  check("the app host normalises /about/ on the way", `308 ${MARKETING_URL}/about`, resolve(live, APP, "/about/"));
  check("the app host keeps /", "serve /index.html", resolve(live, APP, "/"));
  check("the app host keeps a church page", "serve /index.html", resolve(live, APP, "/grace"));
  check("the app host keeps /register-church", "serve /index.html", resolve(live, APP, "/register-church"));
  check("the app host keeps /api", "serve /server.ts", resolve(live, APP, "/api/payfast-itn"));

  // The failure that would take the whole site down: two hosts sending each
  // other's paths back and forth. Follow every redirect to its end and require
  // it to terminate, in at most two hops (www to the apex, then to the app),
  // without ever visiting the same address twice.
  const hostOf = (url: string) => new URL(url).hostname;
  const pathOf = (url: string) => new URL(url).pathname;
  const chase = (host: string, path: string): string => {
    const seen = new Set<string>();
    let at = `${host}${path}`;
    for (let hop = 0; hop <= 2; hop++) {
      if (seen.has(at)) return `loop at ${at}`;
      seen.add(at);
      const result = resolve(live, at.slice(0, at.indexOf("/")), at.slice(at.indexOf("/")));
      if (!result.startsWith("308 ")) return "ends";
      const target = result.slice(4);
      at = `${hostOf(target)}${pathOf(target)}`;
    }
    return `still redirecting at ${at}`;
  };

  const unresolved = ["/", "/about", "/login", "/grace", "/grace/admin", "/register-church", "/app", "/deep/nonsense"]
    .flatMap((path) => [APEX, APP, WWW].map((host) => ({ host, path })))
    .filter(({ host, path }) => chase(host, path) !== "ends")
    .map(({ host, path }) => `${host}${path}: ${chase(host, path)}`);
  check("every redirect terminates, with no cycle", "[]", JSON.stringify(unresolved));

  // siteMode.ts makes the same decision for navigation inside the app. If the
  // two disagree, a link in the app goes somewhere the edge sends back.
  const agree = ["/", "/about", "/contact", "/privacy", "/login", "/app", "/grace", "/register-church"].every((path) => {
    const edgeSendsAway = resolve(live, APEX, path).startsWith("308 ");
    return edgeSendsAway === (crossHostRedirectFor("marketing", path) === "app");
  });
  check("the edge and siteMode.ts agree about the apex", true, agree);
}

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
