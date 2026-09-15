# URL, environment and config inventory for the split

| | |
|---|---|
| **Issue** | [#52](https://github.com/KatOre-Solutions/GuardianCheck/issues/52) (7.3), part of epic [#14](https://github.com/KatOre-Solutions/GuardianCheck/issues/14) |
| **Status** | Proposed, awaiting review |
| **Depends on** | [architecture.md](architecture.md) (7.1) |
| **Surveyed at** | commit `ffdcbea` on `main` |

Every place in the repository, and every external console, that knows an
origin, builds a URL, or decides crawl and routing behaviour. Each row says
what has to happen to it for the split described in
[architecture.md](architecture.md). Nothing here has been changed.

## How to read this

- **Marketing** means `https://guardiancheck.co.za`. **App** means
  `https://app.guardiancheck.co.za`.
- **Phase** refers to [architecture.md, Migration phases](architecture.md#migration-phases).
- **Action**:
  - **Change**: edit the code or value.
  - **Split**: each project gets its own version.
  - **Redirect** / **Proxy**: handled by the apex edge config.
  - **Verify**: probably fine, confirm during the phase.
  - **None**: listed so nobody has to re-check it.
- Line numbers are as of the surveyed commit.

Search used to build this list: `APP_URL`, `SITE_URL`, `guardiancheck.co.za`,
`window.location`, `return_url`/`cancel_url`/`notify_url`, `authDomain`,
`cookie`, every `<Link to>`, `href`, `navigate(` and `sendBeacon`/`fetch(` in
`src/`, plus `server.ts`, `emailService.ts`, `vercel.json`, `index.html`,
`public/` and `scripts/`.

## A. Environment variables

| ID | Variable | Read by | Today | After split | Action | Phase |
|---|---|---|---|---|---|---|
| A1 | `APP_URL` | [server.ts:641](../../server.ts#L641), [:1608](../../server.ts#L1608), [:1727](../../server.ts#L1727), [:2364](../../server.ts#L2364); fallback for `VITE_APP_URL` in [vite.config.ts:13](../../vite.config.ts#L13) | `https://guardiancheck.co.za` | Production: App. Preview: unset, so the request origin is used. | Change in Vercel | 2 |
| A2 | `VITE_APP_URL` | [PayFastButton.tsx:67](../../src/components/PayFastButton.tsx#L67) | `https://guardiancheck.co.za` | Production: App. Preview: unset, so `window.location.origin` is used. Marketing project: not needed. | Change in Vercel | 2 |
| A3 | `VITE_PAYFAST_NOTIFY_URL` | [PayFastButton.tsx:71](../../src/components/PayFastButton.tsx#L71) | Not in `.env.example`; optional override | Leave unset so it derives from A2. If set in Vercel, update to App. | Verify | 2 |
| A4 | `VITE_PAYFAST_SANDBOX`, `PAYFAST_SANDBOX`, `VITE_PAYFAST_MERCHANT_ID`, `VITE_PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE` | PayFast button, ITN handler, cancel API | Per environment | App project only | None | n/a |
| A5 | `VITE_RECAPTCHA_SITE_KEY` | [src/lib/firebase.ts:17](../../src/lib/firebase.ts#L17) | Set | App project only. The key's domain list changes (J2), not the variable. | None | n/a |
| A6 | `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | `server.ts` | Set | App project only | None | n/a |
| A7 | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | [emailService.ts:40](../../emailService.ts#L40) | `notifications@guardiancheck.co.za` | Unchanged. Sending domain is the apex's DNS, not a web host. | None | n/a |
| A8 | `DISCORD_WEBHOOK_URL`, `VITE_DEV_MODE`, `DISABLE_HMR` | Server, Vite | Set | App project only | None | n/a |
| A9 | Marketing project variables | New project | n/a | Whatever #47 needs. Must not include any Firebase Admin, PayFast or Resend secret. | Split | 3 |

## B. Hard-coded origins and host strings

| ID | Item | Location | Today | After split | Action | Phase |
|---|---|---|---|---|---|---|
| B1 | `SITE_URL` | [src/constants/site.ts:17](../../src/constants/site.ts#L17) | One constant, apex. Used by canonicals, sitemap, `llms.txt`, JSON-LD, church settings. | Two constants: `MARKETING_URL` (apex) and `APP_URL` (app). Both hard-coded, not env, for the reason the file already documents (previews must never self-canonicalise). Every consumer below picks one. | Change | 0, values real in 2 |
| B2 | Static social tags | [index.html:57](../../index.html#L57), [:60](../../index.html#L60), [:71](../../index.html#L71) | `og:url`, `og:image`, `twitter:image` on the apex | Marketing: server-rendered per route **(#47)**. App `index.html`: remove the `og:*`/`twitter:*` block and add a static `robots` meta (G6). | Split | 0 (app), 3 (marketing) |
| B3 | `security.txt` | [public/.well-known/security.txt](../../public/.well-known/security.txt) | `Canonical` and `Policy` on the apex | Both hosts serve it. `Contact` and `Policy` unchanged (the policy page is marketing). `Canonical` is the serving host's own URL. | Split | 3 |
| B4 | `robots.txt` header comment and `Sitemap:` | [public/robots.txt:1](../../public/robots.txt#L1), [:29](../../public/robots.txt#L29) | Apex | See G1 | Split | 1 (app), 3 (marketing) |
| B5 | Church slug prefix label | [src/pages/ChurchSettings.tsx:16](../../src/pages/ChurchSettings.tsx#L16), shown at [:301](../../src/pages/ChurchSettings.tsx#L301) | `guardiancheck.co.za/` | `app.guardiancheck.co.za/`, derived from the app constant | Change | 0 |
| B6 | Mock browser address bars on the home page | [Hero.tsx:71](../../src/components/marketing/Hero.tsx#L71), [LeadersSection.tsx:22](../../src/components/marketing/LeadersSection.tsx#L22), default in [BrowserFrame.tsx:5](../../src/components/marketing/replicas/BrowserFrame.tsx#L5) | `guardiancheck.co.za/app` | `app.guardiancheck.co.za`. Marketing copy, but it should show what users will actually type. | Change | 2 or with #47 rebuild |
| B7 | Email brand footer | [emailService.ts:19](../../emailService.ts#L19) | `katoresolutions.co.za` | Unrelated to the split | None | n/a |
| B8 | Company email | [src/constants/company.ts:28](../../src/constants/company.ts#L28) | `info@guardiancheck.co.za` | Unchanged. Mail DNS stays on the apex (J5). | None | n/a |
| B9 | Dev script sample URL | [scripts/test-verification.ts:58](../../scripts/test-verification.ts#L58) | `https://guardiancheck.co.za/verify?token=test-token` | Test data for a one-off script; update only if the script is used again | None | n/a |
| B10 | `README.md` production link and canonical-origin section | [README.md:8](../../README.md#L8), [:168](../../README.md#L168) | Apex only | Describe both hosts and the two constants | Change (K1) | 4 |

## C. Server-generated links

All use `process.env.APP_URL` first, then something derived from the request.
Once A1 is set, production output is correct with no code change. The rows
exist because the **fallbacks** are wrong for the split.

| ID | Link | Location | Today | After split | Action | Phase |
|---|---|---|---|---|---|---|
| C1 | Resend-verification continue URL | [server.ts:637-641](../../server.ts#L637-L641) | `APP_URL`, else `Origin`, else `Host`, else literal `https://guardiancheck.co.za` | Literal fallback becomes the app constant. If `Origin` is ever the apex (a request proxied from an old apex tab), the continue URL would point at the marketing site; `APP_URL` in production prevents that. | Change | 0 |
| C2 | Verification after invite acceptance | [server.ts:1723-1727](../../server.ts#L1723-L1727) | Same pattern as C1 | Same as C1 | Change | 0 |
| C3 | Invitation link | [server.ts:1608](../../server.ts#L1608) | `APP_URL`, else `Origin` | `/accept-invite` is an app route. Correct once A1 is set. Old emailed links are handled by the apex redirect (F5). | Verify | 2 |
| C4 | Verification after church registration | [server.ts:2363-2364](../../server.ts#L2363-L2364) | `APP_URL`, else `Origin` | Correct once A1 is set | Verify | 2 |
| C5 | Password reset | [src/pages/Login.tsx:358](../../src/pages/Login.tsx#L358) | Client call with no continue URL | No host involved | None | n/a |
| C6 | Guardian QR image in notification email | [emailService.ts:147](../../emailService.ts#L147) | `api.qrserver.com` | Third party, unrelated to hosts | None | n/a |

## D. PayFast

| ID | Item | Location | Today | After split | Action | Phase |
|---|---|---|---|---|---|---|
| D1 | `return_url` | [PayFastButton.tsx:69](../../src/components/PayFastButton.tsx#L69) | `${VITE_APP_URL}/admin?payment=success&plan=` | App. Derives from A2. `/admin` is the launch redirect, which preserves the query. | Verify | 2 |
| D2 | `cancel_url` | [PayFastButton.tsx:70](../../src/components/PayFastButton.tsx#L70) | `${VITE_APP_URL}/admin?payment=cancel` | Same as D1 | Verify | 2 |
| D3 | `notify_url` for new checkouts | [PayFastButton.tsx:71](../../src/components/PayFastButton.tsx#L71) | `VITE_PAYFAST_NOTIFY_URL`, else `${VITE_APP_URL}/api/payfast-itn` | App | Verify | 2 |
| D4 | ITNs for subscriptions created before the split | PayFast, handled at [server.ts:1884](../../server.ts#L1884) | Recurring charges notify the `notify_url` given at signup: the apex | Apex **proxies** `/api/*` to App, permanently. Handler validates by signature and PayFast ping-back, not source IP, so a proxy is transparent. Confirm redirect behaviour with PayFast support (architecture open question 2). | Proxy | 3 |
| D5 | Subscription cancel API call | [server.ts:2197](../../server.ts#L2197) | Server to `api.payfast.co.za` | Outbound, host-independent | None | n/a |
| D6 | PayFast merchant dashboard | PayFast console | Unknown whether a default ITN or return URL is configured there | If set, update to App | Verify (J6) | 1 |
| D7 | Sandbox test | n/a | n/a | Full sandbox checkout and ITN on the app host before phase 2 | Verify | 1 |

## E. Internal links that cross hosts

Today these are all same-origin router links. After the split, a link from one
host to the other must be an absolute URL (a plain `<a href>`, not a router
`<Link>`, which only navigates within its own app).

### Marketing to app

| ID | Link | Location | Target | Action | Phase |
|---|---|---|---|---|---|
| E1 | Header: "Log in" / "Open GuardianCheck" (auth-dependent) | [MarketingHeader.tsx:79](../../src/components/marketing/MarketingHeader.tsx#L79), [:84](../../src/components/marketing/MarketingHeader.tsx#L84), [:99](../../src/components/marketing/MarketingHeader.tsx#L99), [:145](../../src/components/marketing/MarketingHeader.tsx#L145) | `/app`, `/login` | Remove `useAuth` ([auth-session.md](auth-session.md#marketing-host-has-no-auth-state)). Always "Log in", to App `/login`, which forwards signed-in users. | Change | 0 |
| E2 | Header: "Start free trial" | [MarketingHeader.tsx:90](../../src/components/marketing/MarketingHeader.tsx#L90), [:103](../../src/components/marketing/MarketingHeader.tsx#L103) | `/register-church` | App `/register-church` | Change | 0 |
| E3 | Hero CTA | [Hero.tsx:35](../../src/components/marketing/Hero.tsx#L35) | `/register-church` | App | Change | 0 |
| E4 | Final CTA | [FinalCta.tsx:19](../../src/components/marketing/FinalCta.tsx#L19) | `/register-church` | App | Change | 0 |
| E5 | Pricing tier buttons | [Pricing.tsx:60](../../src/components/marketing/Pricing.tsx#L60) | `/register-church?plan=<tier>` | App, query kept | Change | 0 |
| E6 | Footer: "Start free trial" | [Footer.tsx:64](../../src/components/Footer.tsx#L64) | `/register-church` | App | Change | 0 |

### App to marketing

The app layout renders the same `Footer`, so every footer link is also an app
to marketing link when rendered on the app host.

| ID | Link | Location | Target | Action | Phase |
|---|---|---|---|---|---|
| E7 | Footer: home, section anchors | [Footer.tsx:39](../../src/components/Footer.tsx#L39), [:44](../../src/components/Footer.tsx#L44), [:49](../../src/components/Footer.tsx#L49), [:54](../../src/components/Footer.tsx#L54), [:59](../../src/components/Footer.tsx#L59) | `/`, `/#how-it-works`, `/#safety`, `/#pricing`, `/#faq` | Marketing, absolute. On the marketing build these stay relative. Simplest: the footer takes a base URL, or each build has its own footer. **(#47)** | Change | 0 |
| E8 | Footer: company and legal | [Footer.tsx:77-115](../../src/components/Footer.tsx#L77-L115) | `/about`, `/contact`, `/security`, `/privacy`, `/terms`, `/popia`, `/cookies` | Marketing, absolute | Change | 0 |
| E9 | Sign-out destination | [App.tsx:184](../../src/App.tsx#L184) | `/` or `/<slug>` | App `/login` or `/<slug>/login` ([auth-session.md](auth-session.md#app-host)) | Change | 0 |
| E10 | App header logo when no church | [App.tsx:233](../../src/App.tsx#L233) | `/` | App `/` (launch redirect). Stays relative. | None once F3 lands | 0 |
| E11 | "Church not found" home link | [App.tsx:588](../../src/App.tsx#L588) | `/` | Marketing, absolute | Change | 0 |
| E12 | "Powered by GuardianCheck" on church landing | [ChurchLanding.tsx:106](../../src/pages/ChurchLanding.tsx#L106) | `/` | Marketing, absolute | Change | 0 |
| E13 | Not found page "Go home" | [NotFound.tsx:35](../../src/pages/NotFound.tsx#L35) | `/` | App `/` on the app host; marketing gets its own 404 **(#47)** | None once F3 lands | 0 |
| E14 | Error boundary reset | [ErrorBoundary.tsx:34](../../src/components/ErrorBoundary.tsx#L34) | `window.location.href = "/"` | App `/`. Stays relative. | None once F3 lands | 0 |
| E15 | Onboarding and profile fall-throughs | [PendingApproval.tsx:15](../../src/pages/PendingApproval.tsx#L15), [Rejected.tsx:15](../../src/pages/Rejected.tsx#L15), [ProfileCompletion.tsx:56](../../src/pages/ProfileCompletion.tsx#L56), [Profile.tsx:160](../../src/pages/Profile.tsx#L160), [PolicyAcceptancePage.tsx:84](../../src/pages/PolicyAcceptancePage.tsx#L84) | `navigate("/")` | App `/` (launch redirect). These are signed-in users who belong in the app, which is what F3 gives them. | None once F3 lands | 0 |
| E16 | Landing resolver fallback | [src/lib/landing.ts:66](../../src/lib/landing.ts#L66) | `/` when an account has no church-scoped destination | App `/` would loop into the launch redirect again. Must resolve to a real app screen (for example `/profile`) instead. | Change | 0 |
| E17 | Demo invite hidden for signed-in users | [DemoInvite.tsx:40](../../src/components/marketing/DemoInvite.tsx#L40) | `useAuth` | Remove `useAuth`; show to everyone | Change | 0 |

### Stays on one host (no action)

| Link | Location | Host |
|---|---|---|
| Legal cross-links (`/privacy`, `/popia`), `security.txt` link | [PopiaPage.tsx:45](../../src/pages/legal/PopiaPage.tsx#L45), [SecurityPage.tsx:53](../../src/pages/legal/SecurityPage.tsx#L53), [:68](../../src/pages/legal/SecurityPage.tsx#L68) | Marketing |
| Safety section links to `/popia`, `/security` | [Safety.tsx:114](../../src/components/marketing/Safety.tsx#L114), [:118](../../src/components/marketing/Safety.tsx#L118) | Marketing |
| Header nav anchors `#how-it-works` etc. | [src/constants/marketing.ts](../../src/constants/marketing.ts) | Marketing |
| Church landing login and signup | [ChurchLanding.tsx:89](../../src/pages/ChurchLanding.tsx#L89), [:96](../../src/pages/ChurchLanding.tsx#L96) | App |
| Register page "Log in" | [RegisterChurch.tsx:273](../../src/pages/RegisterChurch.tsx#L273) | App |
| Every `navigate` in `ProtectedRoute`, `DashboardRedirect`, `PolicyGuard`, `Login`, `AcceptInvite`, `Profile` role switching | [App.tsx](../../src/App.tsx), [PolicyGuard.tsx:81](../../src/components/PolicyGuard.tsx#L81), [Login.tsx:391](../../src/pages/Login.tsx#L391), [AcceptInvite.tsx:78](../../src/pages/AcceptInvite.tsx#L78) | App |
| WhatsApp demo and support links | [src/lib/whatsapp.ts](../../src/lib/whatsapp.ts) | External |
| Relative `/api/...` calls | [src/lib/api.ts:49](../../src/lib/api.ts#L49), [src/lib/logger.ts:56-60](../../src/lib/logger.ts#L56-L60), page-level calls | App. The logger beacon is left out of the marketing build ([auth-session.md](auth-session.md#app-host)). |

## F. Routing and edge configuration

| ID | Item | Location | Today | After split | Action | Phase |
|---|---|---|---|---|---|---|
| F1 | Vercel config | [vercel.json](../../vercel.json) | One project: static build, `/api` to `server.ts`, generated route table, 404 catch-all | App project: same file minus marketing routes, plus the `noindex` header (G5). Marketing project: its own config with the redirect map and `/api` rewrite (F5). | Split | 1 (header), 3 |
| F2 | Route manifest | [src/constants/appRoutes.ts](../../src/constants/appRoutes.ts) | `EXACT_ROUTES` includes marketing paths (`/about`, `/privacy`, ...) | Marketing paths leave `EXACT_ROUTES` and move to a shared `MARKETING_ROUTES` list | Change | 3 (removal), 0 (new list) |
| F3 | Route `/` | [App.tsx:621](../../src/App.tsx#L621), `ROUTE_CHUNKS` at [App.tsx:76](../../src/App.tsx#L76) | Marketing home | App build: `DashboardRedirect`, like `/app`. Home and marketing chunks leave the app bundle. | Change | 0 behind a host check, 3 unconditionally |
| F4 | Reserved slugs | `RESERVED_SLUGS` in [appRoutes.ts](../../src/constants/appRoutes.ts) | Derived from app routes only | Also includes `MARKETING_ROUTES` and the future list in [architecture.md](architecture.md#the-slug-rule-important). Run a production query for existing churches holding any of them before phase 3. The server does **not** check reserved slugs today: slug generation in [server.ts:2292-2307](../../server.ts#L2292-L2307) checks only uniqueness, so a church named "About" already gets an unreachable `/about`. Add the check there, suffixing a reserved slug the way duplicates are suffixed ([#143](https://github.com/KatOre-Solutions/GuardianCheck/issues/143)). | Change | 0 |
| F5 | Apex redirect map and rewrites | New, marketing project | n/a | Generated from `MARKETING_ROUTES`, exactly as [architecture.md](architecture.md#redirects-and-proxies-on-the-apex) specifies: serve marketing paths, rewrite `/api/*`, serve kill-switch `sw.js`, 308 everything else to App with path and query | Split **(#47)** | 3 |
| F6 | Route generator and build check | [scripts/generate-vercel-routes.ts](../../scripts/generate-vercel-routes.ts), `check:vercel-routes` in [package.json](../../package.json) | Keeps `vercel.json` in step with the manifest | App project keeps it. Add an equivalent check for the marketing redirect config. | Split | 3 |
| F7 | Express SPA fallback | [server.ts:2455-2457](../../server.ts#L2455-L2457) | Self-hosted and local only; mirrors `vercel.json` | Follows F2 automatically | None | n/a |
| F8 | Layout variants | `Layout variant="marketing"` in [App.tsx](../../src/App.tsx) | Marketing tree inside the SPA | App build drops the marketing variant and `MarketingHeader`. Marketing build replaces it **(#47)**. | Change | 3 |
| F9 | `www` host | Vercel domains | Unknown | 308 to apex (architecture open question 1) | Verify | 3 |

## G. SEO and GEO files per host

| ID | Item | Location | Today | Marketing host | App host | Phase |
|---|---|---|---|---|---|---|
| G1 | `robots.txt` | [public/robots.txt](../../public/robots.txt) | Apex, disallows app routes, sitemap line | Allow all, `Disallow: /api/`, `Sitemap: https://guardiancheck.co.za/sitemap.xml`. App-route disallows removed. | No `Disallow: /` (it would hide `noindex`), `Disallow: /api/`, no sitemap | 1 (app), 3 (marketing) |
| G2 | `sitemap.xml` | [scripts/generate-sitemap.ts](../../scripts/generate-sitemap.ts), [src/constants/publicRoutes.ts](../../src/constants/publicRoutes.ts) | 9 URLs including `/register-church` | Generated from marketing routes; `/register-church` removed; robots contradiction check kept | None | 3 |
| G3 | `llms.txt` | [scripts/generate-llms-txt.ts](../../scripts/generate-llms-txt.ts) | Apex; note says `/login` is not crawled | Generated as today. Replace the `/login` note ([line 109](../../scripts/generate-llms-txt.ts#L109)) with: the application lives at `app.guardiancheck.co.za` and is not indexed. | None | 3 |
| G4 | `security.txt` | [public/.well-known/security.txt](../../public/.well-known/security.txt) | Apex | Served, `Canonical` apex | Served, `Canonical` app | 3 |
| G5 | `X-Robots-Tag` header | None today | n/a | Not set | `noindex, nofollow` on every response, via app project headers | 1 |
| G6 | Robots meta in `<Seo>` | [Seo.tsx](../../src/components/Seo.tsx) (`removeMeta("robots")` on indexable routes) | Removed on indexable routes, set on `noindex` routes | Replaced by server-rendered head **(#47)** | Static `noindex, nofollow` meta in `index.html`; `<Seo>` on the app build never removes it | 0 |
| G7 | Canonicals, `og:url` | `canonicalUrl` in [site.ts](../../src/constants/site.ts), [Seo.tsx](../../src/components/Seo.tsx) | Apex | Apex, server-rendered **(#47)** | None (no canonical on `noindex` pages, as `<Seo>` already does) | 3 |
| G8 | Organization and WebSite JSON-LD | `GlobalJsonLd` in [App.tsx:493](../../src/App.tsx#L493) | Every route | Apex pages | Remove from the app build | 3 |
| G9 | Home page JSON-LD (SoftwareApplication, Offer, FAQPage) | [src/pages/Home.tsx](../../src/pages/Home.tsx), [src/constants/marketing.ts](../../src/constants/marketing.ts) | Home | Home | None | 3 |
| G10 | Social card image | `public/og-image.png`, `OG_IMAGE_PATH` in [site.ts](../../src/constants/site.ts) | Apex | Served | Not needed | 3 |

## H. PWA and offline

| ID | Item | Location | Today | After split | Action | Phase |
|---|---|---|---|---|---|---|
| H1 | Manifest | [public/manifest.webmanifest](../../public/manifest.webmanifest) | `id: /`, `start_url: /app`, `scope: /` on the apex | Served only by App. Same values; on a new origin it is a new app identity, so users reinstall ([auth-session.md](auth-session.md#transition-for-users)). Apex stops serving it. | Split | 1 (app), 3 (apex removal) |
| H2 | Service worker | [public/sw.js](../../public/sw.js), registered by [src/lib/pwa.ts](../../src/lib/pwa.ts) | Scope `/` on the apex, precaches the shell | App: unchanged. Apex: replacement worker that clears `guardiancheck-shell-*` caches, unregisters itself and reloads clients. Keep 12 months. | Split | 3 |
| H3 | Precache generator | [scripts/generate-sw-precache.ts](../../scripts/generate-sw-precache.ts) | App build | App build only | None | n/a |
| H4 | `offline.html`, `icon-*.png`, `icon.svg`, `apple-touch-icon` | `public/` | Apex | App. Marketing keeps only what its pages reference (favicon, `icon.svg` in JSON-LD `logo`). | Split | 3 |
| H5 | PWA meta tags | [index.html](../../index.html) (`apple-mobile-web-app-*`) | Apex | App `index.html` only | Split | 3 |

## I. User transition

| ID | Item | Location | After split | Action | Phase |
|---|---|---|---|---|---|
| I1 | "We've moved" notice | New, app build, shown only when served from the apex and signed in | Explains: open `app.guardiancheck.co.za`, sign in once, reinstall if installed (stronger wording in `display-mode: standalone`). Removed in phase 4. | Change | 2 |
| I2 | Church admin communication | Email or WhatsApp to admins | Sent before phase 2, with a short message they can read out at a service | Verify | 2 |
| I3 | Per-origin browser state | IndexedDB, `gc.lastLandingPath`, `gc.church.<slug>`, `guardiancheck.scanner.camera`, camera permission | Rebuilt on first use of the app host. No migration code. See [auth-session.md](auth-session.md#other-per-origin-state-the-app-depends-on). | None | n/a |

## J. External consoles (not in the repository)

| ID | System | Setting | Change | Phase |
|---|---|---|---|---|
| J1 | Firebase Authentication | Authorized domains | Add App in phase 1. Remove apex 30 days after phase 2. | 1, 4 |
| J2 | Google Cloud reCAPTCHA Enterprise | Site key allowed domains | Add App in phase 1. Remove apex in phase 4. | 1, 4 |
| J3 | Google Cloud OAuth | Consent screen authorized domains, client redirect URIs | None expected while `authDomain` stays on `firebaseapp.com`. Confirm. | 1 |
| J4 | Vercel | Projects and domains | Phase 1: add App domain to the existing project. Phase 3: create marketing project, move apex and `www` to it. Both projects need production and preview deploys wired into the pipeline (architecture open question 3). Speed Insights enabled per project. | 1, 3 |
| J5 | DNS (registrar or Vercel DNS) | Records | Add `app` `CNAME` to Vercel. **Do not touch** apex `MX` (ImprovMX forwarding for `info@`), SPF, DKIM and DMARC (Resend), or any verification `TXT`. Record current values before editing. | 1 |
| J6 | PayFast merchant dashboard | Default notify or return URL, if configured | Update to App if present; ask support about ITN redirect handling | 1 |
| J7 | Google Search Console | Properties and sitemaps | Apex: resubmit sitemap after cutover, watch coverage for redirected URLs. App: add as a property only to confirm zero indexed pages. | 3, 4 |
| J8 | Firebase Storage | Bucket CORS | None expected (SDK uploads, `<img>` downloads). Confirm logo upload on App in phase 1. | 1 |
| J9 | Resend | Sending domain | None | n/a |
| J10 | Discord webhook | Alerts | None | n/a |

## K. Documentation

| ID | File | Change | Phase |
|---|---|---|---|
| K1 | [README.md](../../README.md) | Production URLs for both hosts; canonical-origin section describes `MARKETING_URL` and `APP_URL`; deployment section covers two projects; add the "no parent-domain cookies" rule | 4 |
| K2 | [.env.example](../../.env.example) | `APP_URL` and `VITE_APP_URL` examples become the app host; comment notes they are app-project only | 2 |
| K3 | [src/pages/legal/CookiePolicyPage.tsx](../../src/pages/legal/CookiePolicyPage.tsx) | None under this plan (no cookies added). Re-check if the hint-cookie alternative in [auth-session.md](auth-session.md#marketing-host-has-no-auth-state) is ever adopted. | n/a |
| K4 | [src/constants/company.ts](../../src/constants/company.ts), [src/pages/legal/PrivacyPolicyPage.tsx](../../src/pages/legal/PrivacyPolicyPage.tsx) | Check whether the privacy policy or terms name the website address as the service location; if so, add the app host | 2 |

## Summary by phase

| Phase | Rows |
|---|---|
| 0: preparation | B1, B2 (app), B5, C1, C2, E1 to E17, F3, F4, G6 |
| 1: app host in parallel | A3 check, D6, D7, F1 (header), G1 (app), G5, H1 (app), J1, J2, J3, J4, J5, J6, J8 |
| 2: new traffic to app | A1, A2, B6, C3, C4, D1 to D3, I1, I2, K2, K4 |
| 3: cutover | A9, B2 (marketing), B3, D4, F1, F2, F5, F6, F8, F9, G1 (marketing), G2, G3, G4, G7 to G10, H2, H4, H5, J4, J7 |
| 4: cleanup | B10, J1, J2, J7, K1 |
