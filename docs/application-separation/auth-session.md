# Cross-subdomain auth, cookie and session strategy

| | |
|---|---|
| **Issue** | [#51](https://github.com/KatOre-Solutions/GuardianCheck/issues/51) (7.2), part of epic [#14](https://github.com/KatOre-Solutions/GuardianCheck/issues/14) |
| **Status** | Proposed, awaiting review |
| **Depends on** | [architecture.md](architecture.md) (7.1) |

Documentation only. No auth code or Firebase configuration has been changed.

## Summary

GuardianCheck does not use cookies for sign-in. The Firebase Web SDK keeps the
session in the browser's IndexedDB, and the API is called with a bearer ID
token. Browser storage belongs to exactly one origin, so
`app.guardiancheck.co.za` cannot see a session created on
`guardiancheck.co.za`, and no cookie scoped to `.guardiancheck.co.za` changes
that.

**Recommended strategy:**

1. **Accept one sign-in on the new host.** Do not try to carry sessions across.
   Every user signs in once on `app.guardiancheck.co.za`.
2. **The marketing host has no auth at all.** No Firebase SDK, no "signed in"
   state. Its "Log in" link goes to the app host, which already forwards a
   signed-in user straight to their dashboard.
3. **No shared cookies.** Nothing is scoped to the parent domain.
4. **Soften the one-time cost** with the phased rollout in
   [architecture.md](architecture.md#migration-phases): the app host runs in
   parallel for several weeks, new links move people over gradually, and the
   apex is switched to marketing only after that.

The rest of this document explains why, and lists the required changes and risks.

## How auth works today

| Piece | How it works | Where |
|---|---|---|
| Firebase app | `initializeApp` with the committed web config; `authDomain` is `gen-lang-client-0908918689.firebaseapp.com` | [src/lib/firebase.ts](../../src/lib/firebase.ts), [firebase-applet-config.json](../../firebase-applet-config.json) |
| Session persistence | `getAuth(app)` with the SDK default, `browserLocalPersistence`: an IndexedDB database named `firebaseLocalStorageDb` on the page's origin. Survives restarts until sign-out. | [src/lib/firebase.ts:26](../../src/lib/firebase.ts#L26) |
| Email and password | `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`; password users must verify their email | [src/pages/Login.tsx](../../src/pages/Login.tsx) |
| Google | `signInWithPopup`, not redirect. The popup runs on the `firebaseapp.com` handler and hands the credential back to the opener. | [src/pages/Login.tsx:177](../../src/pages/Login.tsx#L177) |
| Auth state | One `onAuthStateChanged` subscription for the whole app, plus a live `users/{uid}` document | [src/contexts/AuthContext.tsx](../../src/contexts/AuthContext.tsx) |
| Post sign-in routing | `resolveLandingPath` picks the dashboard; `/login` forwards an already signed-in user automatically | [src/lib/landing.ts](../../src/lib/landing.ts), [src/pages/Login.tsx:140](../../src/pages/Login.tsx#L140) |
| API auth | `Authorization: Bearer <Firebase ID token>`, verified by the Admin SDK. Same-origin calls to relative `/api/...` paths. No CORS middleware. | [server.ts:432](../../server.ts#L432) (`authenticateToken`) |
| Email verification | Server generates the link with `generateEmailVerificationLink` and a continue URL of `${APP_URL}/login` | `/api/auth/send-verification` [server.ts:683](../../server.ts#L683), `/api/accept-invite` [server.ts:1782](../../server.ts#L1782), `/api/register-church` [server.ts:2482](../../server.ts#L2482) |
| Password reset | Client `sendPasswordResetEmail(auth, email)` with no continue URL, so Firebase's default handler page | [src/pages/Login.tsx:358](../../src/pages/Login.tsx#L358) |
| Invitations | Random token stored in Firestore; link `${APP_URL}/accept-invite?token=` | `/api/invite-user` [server.ts:1654](../../server.ts#L1654) |
| App Check | reCAPTCHA Enterprise, when `VITE_RECAPTCHA_SITE_KEY` is set. The key has a domain allowlist in Google Cloud. | [src/lib/firebase.ts:16](../../src/lib/firebase.ts#L16) |
| Cookies | GuardianCheck sets none. The public Cookie Policy says so; only Google's reCAPTCHA may set its own. | [src/pages/legal/CookiePolicyPage.tsx](../../src/pages/legal/CookiePolicyPage.tsx) |
| Marketing awareness of auth | `MarketingHeader` and `DemoInvite` call `useAuth` to swap "Log in" for "Open GuardianCheck" and to hide the demo invite from signed-in users | [MarketingHeader.tsx:20](../../src/components/marketing/MarketingHeader.tsx#L20), [DemoInvite.tsx:40](../../src/components/marketing/DemoInvite.tsx#L40) |

### Other per-origin state the app depends on

The split affects more than the session. All of these are keyed by origin:

| State | Storage | Used for | Where |
|---|---|---|---|
| Firebase session | IndexedDB `firebaseLocalStorageDb` | Staying signed in | Firebase SDK |
| Firestore offline cache | IndexedDB, `persistentLocalCache` | Offline dashboards, **the parent's offline QR view** | [src/lib/firebase.ts:29](../../src/lib/firebase.ts#L29), [OfflineParentQR.tsx](../../src/pages/OfflineParentQR.tsx) |
| Last landing path | `localStorage["gc.lastLandingPath"]` | Preloading the right dashboard chunk | [src/App.tsx:109](../../src/App.tsx#L109) |
| Church cache | `localStorage["gc.church.<slug>"]` | Instant and offline church resolution | [src/contexts/TenantContext.tsx](../../src/contexts/TenantContext.tsx) |
| Chosen camera | `localStorage["guardiancheck.scanner.camera"]` | Volunteers' scanner camera choice | [src/lib/camera.ts:298](../../src/lib/camera.ts#L298) |
| Demo invite dismissal | `sessionStorage` / `localStorage` | Marketing popup snooze | [DemoInvite.tsx](../../src/components/marketing/DemoInvite.tsx) |
| Camera permission | Browser permission store | QR scanning without a prompt | Browser |
| Installed PWA | OS app registration, manifest `id: /` | Home-screen app | [public/manifest.webmanifest](../../public/manifest.webmanifest) |
| Service worker and shell cache | Cache Storage `guardiancheck-shell-*` | Offline boot | [public/sw.js](../../public/sw.js) |

## What the split changes

An origin is scheme plus host plus port. `https://guardiancheck.co.za` and
`https://app.guardiancheck.co.za` are different origins. IndexedDB,
localStorage, sessionStorage, Cache Storage, service workers, permissions and
PWA installs are all isolated per origin. Only cookies can be shared across
subdomains, and this app does not use them.

| State | Effect on first visit to the app host | Severity |
|---|---|---|
| Firebase session | Signed out. Must sign in again. | Expected, one-time |
| Firestore offline cache | Empty. Offline views show nothing until one online load has synced. | **High** for a parent who first opens the new host offline at the check-in desk |
| Last landing path, church cache | Empty. Slightly slower first load. | Low |
| Chosen camera | Default camera until chosen again | Low |
| Camera permission | Browser prompts again | Low, but slows the first scan on a Sunday |
| Installed PWA | The old install stays bound to the apex. After cutover its start URL redirects to a different origin, so it opens with browser chrome instead of as an app. Users must install again from the app host. | Medium |
| Service worker | App host gets a fresh worker. The old apex worker must be retired ([architecture.md](architecture.md#service-worker-on-the-apex)). | Medium if not retired |

## Why a `.guardiancheck.co.za` cookie does not solve this

The issue asks specifically about cookie scoping. A cookie with
`Domain=.guardiancheck.co.za` is readable on both hosts, so it looks like the
natural way to share a session. It does not work here without replacing the
auth model:

1. **The Firebase Web SDK never reads a cookie.** Its session lives in
   IndexedDB. A parent-domain cookie would sit next to it, unused.
2. **Making a cookie the session means a custom session layer.** That is the
   Admin SDK `createSessionCookie` flow: a server endpoint exchanges an ID token
   for a session cookie, every API route verifies the cookie, and the client
   SDK still needs a Firebase session of its own for Firestore, which means
   minting custom tokens from the cookie on each host. The API currently uses
   bearer tokens, which cannot be sent cross-site by a browser on its own; a
   cookie session adds CSRF exposure that has to be designed out.
3. **It widens the blast radius.** A parent-domain session cookie is sent to
   every subdomain. A future forgotten DNS record (for example a stale `CNAME`
   on some `promo.guardiancheck.co.za`) becomes a way to capture sessions for a
   children's safeguarding product.
4. **It contradicts the published Cookie Policy** ("GuardianCheck sets no
   cookies of its own"), which would need rewriting, and a POPIA notice review.

All of that to avoid a one-time sign-in. **Rejected.**

## Options considered for carrying the session across

| Option | How | Verdict |
|---|---|---|
| **A. One-time sign-in on the app host** | Do nothing special. Phase the rollout so it happens gradually. | **Recommended** |
| B. Token hand-off | Apex page reads the current ID token, server mints a custom token, the app host receives it (URL fragment or `postMessage`) and calls `signInWithCustomToken` | Rejected. A bearer credential in a URL ends up in history, logs, and screenshots shared on WhatsApp. It needs extra server code for a one-off event, and it only works while the apex still runs the app, so it would have to be built, shipped and removed within the migration window. |
| C. Parent-domain session cookie | See above | Rejected |
| D. Hidden iframe to the other origin | App host embeds an apex page that reads its IndexedDB and posts the token back | Rejected. Browsers partition third-party storage (Safari, Firefox, and Chrome's storage partitioning), so an embedded apex frame does not see the apex's first-party IndexedDB. Also a token-leak surface. |

## Recommended strategy in detail

### Marketing host has no auth state

- Remove `useAuth` from `MarketingHeader` and `DemoInvite`. The marketing build
  must not import `firebase/*` at all. Side benefit: a much smaller marketing
  bundle, which helps #47's performance goals.
- Header shows **Log in** (to `https://app.guardiancheck.co.za/login`) and
  **Start free trial** (to `https://app.guardiancheck.co.za/register-church`)
  for everyone.
- A signed-in user who clicks **Log in** never sees a form: `Login.tsx`
  subscribes to `onAuthStateChanged` and calls `resolveLandingPath` as soon as a
  user with a document exists. **Verify** this with a test before phase 3,
  since it becomes the only route from marketing to a dashboard.
- `DemoInvite` shows to everyone, including customers. That is acceptable: it is
  delayed, dismissible and snoozes. If it annoys customers, the app can link to
  marketing with a `?from=app` parameter that suppresses it, which needs no auth.
- Declined alternative: a non-sensitive `gc_signed_in=1` hint cookie on
  `.guardiancheck.co.za` so the marketing header can say "Open app". It is not a
  credential, but it is still a cookie (Cookie Policy change), it goes stale on
  sign-out from another device, and the gain is one button label.

### App host

- **Sign-in:** unchanged code. Firebase `authDomain` stays on `firebaseapp.com`.
  `signInWithPopup` communicates with the opener by `postMessage`, which works
  from any authorized origin and is not affected by third-party cookie or
  storage restrictions the way `signInWithRedirect` is. **Do not switch to
  redirect sign-in** as part of this migration.
- **Optional later hardening, not part of the split:** serve the auth handler
  from the app host itself (set `authDomain` to `app.guardiancheck.co.za` and
  proxy `/__/auth/*` to the Firebase handler). That shows the GuardianCheck
  domain in the Google consent popup and removes the last cross-site hop. It
  needs the OAuth client's redirect URIs updated, so treat it as its own issue.
- **Sign-out:** lands on the app host's `/login` (or `/<slug>/login` when a
  church is in context), not on `/`. On the app host `/` is the launch redirect,
  and sending a user who just signed out to the marketing site is a change of
  context they did not ask for. The login page links to the marketing site.
- **App host `/`:** renders the same launch redirect as `/app`: signed out goes
  to `/login`, signed in goes to the right dashboard.
- **API:** stays same-origin with bearer tokens, so no CORS configuration is
  needed on the app host. The apex rewrites `/api/*` to the app host for PayFast
  and legacy tabs; a rewrite is invisible to the browser, so it needs no CORS
  either.
- **Client error beacon:** `logger` posts to relative `/api/log-client-error`
  ([src/lib/logger.ts:56](../../src/lib/logger.ts#L56)). The marketing build
  should not include it. If marketing error reporting is wanted later, add a
  narrow CORS allowlist for the apex on that single endpoint.

### Firebase and Google configuration

| Setting | Change | When |
|---|---|---|
| Firebase Auth, Authorized domains | Add `app.guardiancheck.co.za`. Required for popup sign-in on that host and for email action continue URLs pointing at it. | Phase 1 |
| Same list | Remove `guardiancheck.co.za`. Keep it for at least 30 days after phase 2 so verification links already sent (continue URL on the apex) still validate. | Phase 4 |
| reCAPTCHA Enterprise key | Add the app host to allowed domains; remove the apex in phase 4. Without this, App Check tokens fail and Firestore calls are rejected once enforcement is on. | Phase 1, phase 4 |
| Google OAuth consent screen, authorized domains | Nothing. Authorized domains there are registrable domains, so `guardiancheck.co.za` already covers the subdomain. Confirm in the console. | Phase 1 check |
| Google OAuth client redirect URIs | Nothing, while `authDomain` stays on `firebaseapp.com`. | n/a |
| Firebase Storage | Nothing expected: uploads and downloads go through the SDK and `<img>` tags, which do not need a bucket CORS policy. No CORS config exists in the repo. Confirm church logo upload in the phase 1 test pass. | Phase 1 check |

### Links in emails already sent

| Link | Already in inboxes | After phase 2 | After cutover |
|---|---|---|---|
| Email verification | Firebase handler URL (on `firebaseapp.com`) with a continue URL on the apex | New links continue to the app host | Verification itself still succeeds (it is server-side). "Continue" goes to apex `/login`, which redirects to the app host, where the user signs in. |
| Invitation | `https://guardiancheck.co.za/accept-invite?token=...` | New links on the app host | Apex redirects with the token intact. The token is stored server-side, so the host it is redeemed on does not matter. |
| Password reset | Firebase default handler, no continue URL | No change | No change |
| PayFast return | Only relevant to a checkout open at the moment of cutover | New checkouts return to the app host | Apex redirects `/admin?payment=success`; the user signs in on the app host. The success toast may be lost because `Login` does not carry the query forward, but subscription state comes from the ITN, not the query. Low impact. |

### Transition for users

These are one-time costs of changing origin. They are the reason for the
phase 2 soak.

- **Sign in again** on the app host.
- **Install the app again** from the app host, and remove the old one. The old
  install will otherwise open the redirect with browser chrome.
- **Allow the camera again** the first time a volunteer scans.
- **Open the app once while online** before relying on the offline QR view. A
  parent whose first visit to the new host happens offline at the check-in desk
  will have no cached children. Volunteers can still look children up by name,
  so this is an inconvenience, not a lock-out, but it lands at the worst moment.

Mitigations, all in [architecture.md](architecture.md#migration-phases):

- A signed-in-only notice on the apex during phase 2, explaining the three
  steps above. When the apex detects it is running as an installed app
  (`display-mode: standalone`), the notice specifically asks the user to
  reinstall from the new address.
- Direct message to church admins ahead of phase 2, so they can brief
  volunteers and parents in a service announcement.
- Cutover early in the week, so a Sunday is at least five days away.

## Required changes

Code and config changes this strategy needs. IDs refer to
[config-inventory.md](config-inventory.md).

| # | Change | Inventory | Phase |
|---|---|---|---|
| 1 | Remove `useAuth` and all Firebase imports from marketing components | E1, E17 | 0 |
| 2 | Marketing "Log in" and "Start free trial" link absolutely to the app host | E1 to E6 | 0 |
| 3 | Sign-out navigates to the app login, not `/` | E9 | 0 |
| 4 | App host `/` renders the launch redirect | F3 | 0 |
| 5 | Test that `/login` forwards an already signed-in user to their dashboard | E1 | 0 |
| 6 | Apex fallbacks in `server.ts` read from config instead of the literal apex | C1, C2 | 0 |
| 7 | Add the app host to Firebase authorized domains and the reCAPTCHA key | J1, J2 | 1 |
| 8 | `APP_URL` / `VITE_APP_URL` switched to the app host | A1, A2 | 2 |
| 9 | "We've moved" notice on the apex for signed-in users | I1 | 2 |
| 10 | Remove the apex from Firebase authorized domains and the reCAPTCHA key | J1, J2 | 4 |

Explicitly **not** changing: session persistence, the bearer-token API model,
`signInWithPopup`, `authDomain`, the Cookie Policy.

## Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| S1 | App host not in Firebase authorized domains, so Google sign-in fails there | Medium | High | Phase 1 test pass before any user is sent there |
| S2 | reCAPTCHA key rejects the app host, so App Check fails and Firestore denies requests | Medium | High | Same |
| S3 | Parent first opens the new host offline and has no QR to show | Medium | Medium at the desk | Notice, church comms, soak, weekday cutover |
| S4 | Users keep using the old installed PWA, which becomes a redirect | High | Low to medium | Standalone-mode notice asking for reinstall |
| S5 | Someone later adds a parent-domain cookie for convenience | Low | High | This document: no `Domain=.guardiancheck.co.za` cookies. Add a line to the README's conventions. |
| S6 | Apex removed from authorized domains too early, breaking verification links in flight | Low | Low | 30-day wait in phase 4 |
| S7 | Marketing build accidentally bundles Firebase, reintroducing auth state and weight | Medium | Low | Bundle check in the marketing build **(#47)** |

## Security notes

- No credential ever appears in a URL, a cookie, or a cross-origin message
  during or after the migration.
- Separate origins mean a script injected into a marketing page (a CMS embed,
  an analytics snippet, a future blog comment widget) cannot read the app's
  session. Today it could, because both run on one origin. This is a real
  security improvement of the split.
- If HSTS is ever enabled with `includeSubDomains` and `preload` on the apex,
  every present and future subdomain must be HTTPS-only first. Verify what
  Vercel sends today with `curl -I` before changing it; it is not required for
  this migration.
