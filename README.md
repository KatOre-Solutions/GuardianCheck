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
