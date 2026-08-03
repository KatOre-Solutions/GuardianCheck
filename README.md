<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/6c817cfc-8d14-458a-b0a8-7f40fc186536

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Security rules tests

`firestore.rules` decides who can read and write every collection, and it is
deployed **separately from the app** — `firebase deploy --only firestore:rules`.
A rules change is live only after that command, and a bad one is a production
incident, so changes should come with a test.

```bash
npm run test:rules
```

This boots the Firestore emulator and runs the suites in [tests/](tests):

- [firestore-rules.test.mjs](tests/firestore-rules.test.mjs) — the `users`
  collection. Privilege escalation must be denied and the real onboarding flows
  must still pass. Written for #68, where any signed-up account could grant
  itself `master_admin`.
- [firestore-churches.test.mjs](tests/firestore-churches.test.mjs) — the
  `churches` collection. A church admin must not be able to write `name`,
  `slug`, `plan`, `status` or `subscription` from the browser. Written for #65,
  where the role check was correct but nothing constrained *which fields* an
  admin could change.

Both follow the same shape: a block of writes that **must be denied**, and a
block of real user flows that **must still succeed**. The second block is the
important half — a rule that denies everything passes the first block.

**Java version caveat:** `firebase-tools` v14+ requires JDK 21 or newer. On an
older JDK, run the suite through a pinned CLI instead — the tests themselves are
unaffected:

```bash
npx firebase-tools@13 emulators:exec --only firestore --project gc-rules-test "node tests/firestore-rules.test.mjs"
```

**Deploy order matters.** When a rules change tightens a field the client
currently writes, ship the client change *first* and deploy rules *after* —
otherwise the running app starts getting permission errors. Rollback is the
reverse.

## SEO / document head

Per-route titles, meta descriptions and canonical URLs come from `<Seo>`
([src/components/Seo.tsx](src/components/Seo.tsx)).

```tsx
import { Seo } from "../components/Seo";

// Public page — indexable, brand suffix added automatically.
<Seo
  title="Register your church"          // → "Register your church | GuardianCheck"
  description="120-160 characters."
/>

// Anything behind auth or any utility route.
<Seo title="Accept invitation" noindex />
```

Omit `title` on the home page so the brand leads instead of trailing.

**Rules**

- **One `<Seo>` per route.** Head tags are shared mutable state, so a route that
  renders none inherits whatever the previous route set.
- **Authenticated routes get theirs from `ProtectedRoute`** and must not add
  their own.
- **`index.html` keeps the static `<title>` and description** as the no-JS
  fallback. `<Seo>` overwrites them in place, so exactly one of each tag exists
  at any time — do not delete them.
- **Canonicals are automatic.** An indexable route gets a self-referential
  `<link rel="canonical">` from its own path; a `noindex` route gets none,
  because `noindex` + canonical is a contradictory pair of signals. Pass
  `canonicalPath` only when a page should be indexed under a *different* URL.
- **The canonical origin is always production** (`SITE_URL` in
  [src/constants/site.ts](src/constants/site.ts)), never `window.location.origin`
  or `VITE_APP_URL` — otherwise every Vercel preview deployment would emit
  canonicals pointing at its own hostname. The sitemap generator reads the same
  constant, so the two cannot disagree.
- **Social cards follow the title, description and URL automatically.** Pass
  `image` (root-relative or absolute) to override the card per route, and
  `imageAlt` with it — a custom image without alt clears the tag rather than
  inheriting the previous route's.

### Social cards

The default card is [public/og-image.png](public/og-image.png), 1200×630,
self-hosted. It replaced a hot-linked Unsplash photo — the brand's first
impression should not sit on a third party who can rotate or remove it.

Regenerate or restyle it by editing the SVG in the PR that introduced it; the
constants (`OG_IMAGE_PATH`, dimensions, alt text) live in
[src/constants/site.ts](src/constants/site.ts) so `index.html` and `<Seo>` agree.

**`og:*` uses `property=`, `twitter:*` uses `name=`.** They are not
interchangeable — an og tag written with `name=` is invisible to unfurlers, and
a `twitter:card` written with `property=` gets dropped by strict readers, which
silently downgrades the link to a small summary card.

**Know what per-route cards actually reach.** Slack, LinkedIn, WhatsApp and
Facebook do not execute JavaScript, so they read the static tags in
`index.html` and never see what `<Seo>` writes. Those static tags therefore
describe the **home page** and must stay accurate; the per-route values are an
upgrade for crawlers that render, such as Googlebot. Making them universal needs
SSR — Epic 6 (#47).

**Indexable routes are `/` and `/register-church`** — the list in
[src/constants/publicRoutes.ts](src/constants/publicRoutes.ts). Everything else
is `noindex`, including church landing pages at `/:churchSlug`: they render the
identical `Home` body as the marketing root, so only their head tags differ.
That is thin duplicate content, and the decision is recorded in #18. Revisit it
if churches ever get genuinely distinct landing-page content.

**Why not `react-helmet-async` or React 19's native metadata?** React 19 hoists
`<title>`/`<meta>` into `<head>` but never reconciles them with the tags already
in `index.html`, which measurably produces two `<title>` elements — and the HTML
spec resolves `document.title` to the *first*, so the React one is ignored.
`<Seo>` upserts the existing tags instead. Full reasoning is in the component's
docstring.

**Ceiling:** this is a client-rendered SPA, so these tags only exist once React
runs. Googlebot executes JS and sees them; most social unfurlers do not and keep
reading the static `index.html` tags. Closing that gap requires SSR/SSG — see
Epic 6 (#47).

## Routing and 404s

Every URL the app answers to is declared in
[src/constants/appRoutes.ts](src/constants/appRoutes.ts). Adding or removing a
`<Route>` in `App.tsx` means updating that manifest, then:

```bash
npm run generate:vercel-routes
```

**Two enforcement points, one manifest.** Production traffic never reaches
Express — `vercel.json` serves non-API paths straight from static hosting — so a
fix applied only to `server.ts` would look right locally and change nothing for
real users. Both read the same manifest: `server.ts` calls `isKnownAppPath()`,
and `vercel.json`'s `routes` are generated from it.

`npm run build` runs `check:vercel-routes` and **fails if `vercel.json` is
stale**. Vercel reads that file before the build starts, so it has to be
committed, which means it can silently drift from the router — the check is what
makes that loud rather than a production 404 on a real page.

`routes` rather than `rewrites`, because a rewrite cannot set a status code and
the whole point is serving the SPA shell *with* a 404. The two keys are mutually
exclusive.

**What gets which status:**

| URL | Status | Renders |
|---|---|---|
| `/`, `/login`, `/randmeth/admin/settings` | 200 | the page |
| `/randmeth/nonsense` | 404 | "We couldn't find that page" |
| `/a/b/c/d` | 404 | "We couldn't find that page" |
| `/no-such-church` | **200** | "Church Not Found", `noindex` |

That last row is the deliberate gap. A single segment is a valid *shape* for a
church slug, and deciding whether a church owns it means a Firestore read on
every request. So the edge says 200 and the client renders a not-found state
carrying `noindex` — it never gets indexed, it just isn't a 404. Closing it
properly needs slug validation at the edge.

A 404 still returns the full SPA shell in the body. The client needs it to
render anything at all; only the status line changes, and that is the part
crawlers act on.

## Sitemap

`sitemap.xml` is **generated at build time**, not committed. To add a page,
add one line to `PUBLIC_ROUTES` in
[src/constants/publicRoutes.ts](src/constants/publicRoutes.ts):

```ts
export const PUBLIC_ROUTES: PublicRoute[] = [
  { path: "/", description: "Marketing home page" },
  { path: "/register-church", description: "Church signup" },
  { path: "/privacy", description: "Privacy policy" },   // ← new page
];
```

That manifest is the single source of truth; `npm run build` runs
`scripts/generate-sitemap.ts` after `vite build` and writes `dist/sitemap.xml`.
Regenerate on its own with `npm run generate:sitemap` (requires an existing
`dist/`).

**Only list genuinely indexable pages.** A route must not render
`<Seo noindex />` and must not be disallowed in
[public/robots.txt](public/robots.txt). The generator parses the `Disallow`
rules — wildcards included — and **fails the build** if a listed URL is blocked:

```
Error: Sitemap contradicts robots.txt:
  /profile is blocked by "Disallow: /profile"
  /randmeth/admin is blocked by "Disallow: /*/admin"
```

Telling crawlers to index a page you have also told them not to crawl is silent
in production, so it is caught at build time instead.

The output carries `<loc>` only. Google ignores `<changefreq>` and
`<priority>`, and a `<lastmod>` set to build time would claim every page changed
on every deploy — a signal search engines learn to distrust. Add `<lastmod>` per
route only when there is a real content-modified date for it.

## llms.txt

`/llms.txt` is a curated summary for AI answer engines — what the product is,
who it serves, what it costs, and which URLs matter. Like the sitemap it is
**generated at build time** by
[scripts/generate-llms-txt.ts](scripts/generate-llms-txt.ts), not committed:
URLs come from `PUBLIC_ROUTES` and pricing from `PLAN_LIMITS`, so the two things
that go stale can't.

```bash
npm run generate:llms-txt   # requires an existing dist/
```

**Only put things in it that are true today.** This file exists to be quoted
back verbatim by a model, which is a different bar from a marketing page — there
is no reader applying a pinch of salt. Concretely:

- The product is sold to **churches**. It has no school, daycare or aftercare
  offering, and the file says so explicitly, because an engine asked "does
  GuardianCheck work for schools?" should not infer yes from silence.
- Wider audience positioning belongs with the vertical pages in #40, once those
  pages exist to support it.
- Pricing is per church per month in ZAR. If you change a price, change it in
  [src/constants/plans.ts](src/constants/plans.ts) — and note that
  `Home.tsx`, `AdminDashboard.tsx`, `ChurchSettings.tsx` and
  `MasterAdminDashboard.tsx` still carry their own copies that predate that
  constant.
