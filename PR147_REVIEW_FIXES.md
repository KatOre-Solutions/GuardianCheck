# PR #147 follow-up plan and rollout evidence

Review: [Oreginal, 12 October 2026](https://github.com/KatOre-Solutions/GuardianCheck/pull/147#issuecomment-6128104895), head `7402ee8`.

Keep `DOMAIN_SPLIT_PHASE = "off"` during review. This is a shared-deployment phase of epic #14, not an independently built marketing application.

## Code changes

1. Preserve invitation tokens, payment results, signup plans, duplicate query keys and encoded values in HTTP redirects. Generated host routes now invoke `domain-redirect.ts`, a small Vercel Edge Function that constructs the 308 `Location` from the original request pathname and search. API and filesystem routes remain ahead of redirects. The inline browser redirect remains a fallback. Browsers retain fragments across redirects; fragments are not sent to the server and require a browser check.
2. Give marketing pages settled anonymous auth and empty tenant contexts. Application auth listeners, user document subscriptions, tenant lookup effects and branding effects live inside providers that do not mount in marketing mode. Combined/app modes retain their providers. This does not delete the existing apex account session.
3. Allow authenticated profile access without requiring a dashboard role. Email verification, onboarding status, tenant checks and the existing policy guard remain in force. Dashboard routes still require their respective roles. Extract `ProtectedRoute` so its rendered access decisions can be regression-tested.
4. Correct the rollout documentation: the build checks environment origins and the optional ITN override. It cannot inspect PayFast merchant-console defaults.

## Local verification

- Passed `npm run test:domain-split`: 118 URL, host-routing, environment, slug and landing cases, plus 14 rendered context/route cases. The context checks inspect initial rendered state with a persisted SDK-user fixture; they do not exercise browser effect lifecycles.
- Passed `npm run lint` and `npm run build` with phase off. A separate validation copy also passed the full live-phase build with the correct app origins and 15 generated routing entries. The PR worktree stays off.
- Passed the seven other local suites: route patterns (11), church access (13), pricing (14), PIN limiter (11), checkout middleware (48), camera selection (63) and analytics (119). `git diff --check` passes, and the PR head includes GitHub's current base commit `944e3d4`.
- Passed the official Vercel builder and local Edge Runtime checks in both phases. The live check covers encoded invitation tokens, payment outcomes, duplicate query keys and www's two redirect hops; app-to-marketing checks include noindex. Optional command: `node tests/verify-vercel-redirect-build.mjs <vercel-package-directory>`; append `live` when checking a live-phase copy. This does not prove deployed rewrite/host behavior.
- `npm run test:rules` needs the Firebase emulator; no Firestore rules change in this patch.

## Required before enabling the split

### What to test on the normal Vercel preview

The `.vercel.app` hostname intentionally runs in combined mode, and this PR keeps the split off. Use the deployment built from the latest PR commit. These checks cover regressions; they do not exercise production-host redirect rules.

1. Open `/`, `/about`, `/login`, a known church landing page and its dashboard. Refresh each page and follow header/footer links. The preview should keep serving the existing combined site without redirect loops, blank screens or API startup failures.
2. Sign in with dedicated admin, parent and volunteer test accounts. Confirm each reaches its own dashboard, survives refresh and can sign out. Confirm a parent cannot open an admin dashboard.
3. Open a genuine test invitation with its token, and `/register-church?plan=growth`. Confirm the invitation is recognised and the requested plan remains selected. Avoid consuming a real user's invitation.
4. With a dedicated verified account whose user document has `roles: []`, no church slug and `status: "approved"`, open `/profile`. After any required policy acceptance, the profile must render. `/master-admin` must remain denied. An unverified password account must still be sent to login/verification.
5. Inspect browser Network/Console and Vercel function logs while performing these actions: no new function-startup 500s, redirect loops or persistent loading placeholders.

For the app-mode launch fallback, a preview-only `VITE_SITE_MODE=app` build can test `/` and `/app` with the same role-less test account: both should settle on `/profile`. To test marketing isolation, sign in on a preview first, then rebuild that same preview origin with `VITE_SITE_MODE=marketing`; public pages should stay anonymous, retain GuardianCheck branding and open no `users/{uid}` or church subscriptions. These overrides affect the browser only, and links to the other site use the configured production origins. Remove the override and rebuild afterward. They do not test HTTP 308 routing or service-worker retirement.

### What needs a separate host-aware staging test

Use an isolated staging deployment with its own app/marketing hostnames configured consistently in the site constants and generated routes, Firebase allowed domains, app-origin variables and PayFast sandbox settings. A plain `.vercel.app` preview, even with `VITE_SITE_MODE` overridden, cannot validate the production-host `has` conditions. Do not move production domains to a preview just to perform these checks.

Check the real response headers and browser navigation for the following cases, substituting the staging hosts:

| Request | Expected result |
| --- | --- |
| Marketing `/accept-invite?token=a%2Bb%2Fc%3D` | HTTP 308 to app; the complete encoded token survives. |
| Marketing `/admin?payment=success&plan=growth` | HTTP 308 to app; both query keys survive. Also test the actual sandbox cancel return. |
| www `/register-church?plan=growth&tag=one&tag=two` | Both hops retain the plan and duplicate query keys. |
| App `/about?source=app` | HTTP 308 back to marketing with the query retained. |
| Marketing church URL with `#rooms` | The browser retains the fragment on the app destination. |
| Either host `/api/payfast-itn` | Reaches the API, without a host redirect; validate a real sandbox ITN. |
| App `/` and `/robots.txt` | App responses carry `X-Robots-Tag: noindex, nofollow`; robots is the app variant. |

Also check the persisted marketing-session scenario above, the old installed-worker retirement starting at `/app` or a church URL, and an actual sandbox payment with success/cancel navigation, ITN receipt and subscription/access updates. Never use a forged success query as evidence that a payment was processed.

- [ ] Confirm apex and app domains are attached to the same production Vercel project. The latest PR bot project ID is not proof of domain ownership.
- [ ] Confirm the app hostname is authorized in Firebase Auth and reCAPTCHA Enterprise.
- [ ] Confirm production `APP_URL` and effective `VITE_APP_URL` resolve to `https://app.guardiancheck.co.za`. Check any `VITE_PAYFAST_NOTIFY_URL` override against the exact `/api/payfast-itn` endpoint. Rebuild after frontend environment changes.
- [ ] Inspect PayFast merchant-console default notification and return URLs manually.
- [ ] Deploy a test configuration with phase live and regenerated routes. Inspect actual 308 `Location` headers for invitation tokens, success/cancel parameters, encoded values and www's two hops. Check fragments in a browser.
- [ ] Confirm `/api/payfast-itn` reaches the API on both hosts, app-host noindex headers and app `robots.txt`, and asset delivery without redirects.
- [ ] Use a browser previously signed into the apex: marketing mode must expose anonymous UI, open no user/tenant subscriptions and apply no tenant branding.
- [ ] Test a verified account with `roles: []`, no church slug and approved status: app `/` must reach `/profile`; dashboard access must remain blocked.
- [ ] Test the retirement worker on a device with the old app installed, starting from `/app` and a church URL, including an offline follow-up.
- [ ] Complete a PayFast sandbox transaction; confirm success/cancel navigation, ITN receipt and the subscription/access update.
- [ ] Refresh the GitHub PR description with the current redirect mechanism, test totals and these rollout/rollback steps. Record the external evidence and obtain review sign-off.

## Switch and rollback

For the switch, set the phase to `live`, run `npm run generate:vercel-routes`, commit the phase and generated routes together, and rebuild with the correct environment. Schedule away from Sunday services and billing transitions. Users sign in on the new origin; camera permissions, offline QR caches and installed PWAs need the previously documented migration checks.

For rollback, set the phase to `off`, regenerate `vercel.json` again, and rebuild/redeploy both changes together. Changing only the constant fails the stale-routes build check. Existing PayFast callbacks on either host must continue reaching the same deployment.
