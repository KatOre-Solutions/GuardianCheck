/**
 * Tests for `routePatternFor` (`src/constants/appRoutes.ts`), the label Speed
 * Insights groups vitals under.
 *
 * Run with `npm run test:route-pattern`. Pure module, no emulator.
 *
 * What each case guards against:
 *
 *   - a church slug leaking into the label, which splits metrics per tenant and
 *     puts church names into analytics
 *   - a global route (`/app`, `/master-admin/logs`) mistaken for a slug
 *   - a trailing slash producing a second label for the same page
 *   - an unknown path returning null, which `<SpeedInsights>` treats as "don't
 *     load" and which would leave the previous page's route attached
 */

import { routePatternFor } from "../src/constants/appRoutes";

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

console.log("global routes keep their own path");
check("root", "/", routePatternFor("/"));
check("PWA start_url", "/app", routePatternFor("/app"));
check("two-segment global route is not a tenant route", "/master-admin/logs", routePatternFor("/master-admin/logs"));
check("trailing slash collapses", "/login", routePatternFor("/login/"));

console.log("tenant routes replace the slug");
check("church landing", "/[churchSlug]", routePatternFor("/grace-church"));
check("church landing, trailing slash", "/[churchSlug]", routePatternFor("/grace-church/"));
check("volunteer dashboard", "/[churchSlug]/volunteer", routePatternFor("/grace-church/volunteer"));
check("admin settings", "/[churchSlug]/admin/settings", routePatternFor("/grace-church/admin/settings"));

console.log("unknown paths get a label, never null");
check("unknown tenant child", "/[notFound]", routePatternFor("/grace-church/nonsense"));
check("too deep", "/[notFound]", routePatternFor("/a/b/c/d"));
check("asset fall-through", "/[notFound]", routePatternFor("/assets/missing.js"));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
