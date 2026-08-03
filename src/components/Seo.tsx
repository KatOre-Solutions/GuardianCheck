import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { SITE_NAME, OG_IMAGE_ALT, OG_IMAGE_PATH, absoluteUrl, canonicalUrl } from "../constants/site";

/**
 * Per-route document head management.
 *
 * ## Why this is imperative rather than declarative
 *
 * React 19 hoists `<title>` and `<meta>` rendered anywhere in the tree into
 * `<head>`, which looks like it removes the need for a head library. It does
 * not work here, because React appends its tags and never reconciles them with
 * the static tags already in `index.html`. Measured in a real build:
 *
 *   - two `<title>` elements, and per the HTML spec `document.title` resolves
 *     to the *first* one — so React's title is silently ignored;
 *   - two `<meta name="description">`, leaving crawlers to pick between them.
 *
 * Deleting the static tags from `index.html` would fix that, but they are the
 * only head content a non-JS consumer ever sees, and #17 requires keeping them
 * as a fallback. So this component upserts the existing tags instead: exactly
 * one of each stays in the document, the static values act as the no-JS
 * default, and routes override them on mount. This is the same strategy
 * `react-helmet-async` uses, minus a dependency that has not shipped since 2023.
 *
 * ## Known ceiling
 *
 * This is a client-rendered SPA, so these values only exist once React runs.
 * Googlebot executes JS and will see them; most social unfurlers do not and
 * keep reading the static `index.html` tags. Closing that gap needs SSR/SSG,
 * which is Epic 6 (#47). If a rendering strategy lands there, revisit this
 * component — the declarative React 19 form becomes correct once the head is
 * server-rendered per route.
 *
 * ## Canonicals
 *
 * An indexable route gets a self-referential `<link rel="canonical">` derived
 * from its own path — no page has to remember to ask for one. A `noindex`
 * route gets the link *removed* instead: `noindex` plus a canonical is a
 * contradiction (one says "don't index this", the other says "index it under
 * this URL"), and Google's guidance is to send one signal, not both.
 *
 * There is deliberately no static canonical in `index.html`. Unlike the title
 * and description, there is no value a static canonical could hold that would
 * be right for more than one route — every URL serves the same `index.html`,
 * so a hard-coded `<link rel="canonical" href="…/">` would tell a non-JS
 * consumer that `/register-church` is the home page, contradicting the sitemap
 * that lists it. Absent is better than wrong.
 *
 * ## Social cards
 *
 * `og:*` and `twitter:*` are kept in step with the page's title, description
 * and canonical URL, and `image` overrides the default card per route.
 *
 * Be clear-eyed about the reach of that: Slack, LinkedIn, WhatsApp and Facebook
 * do not execute JavaScript, so they read the static tags in `index.html` and
 * never see anything written here. The per-route values only reach crawlers
 * that render — Googlebot does. So the static tags stay accurate for the home
 * page and these are the upgrade on top, not a replacement. SSR (#47) is what
 * would make them universal.
 *
 * OG tags use `property=`; Twitter's spec uses `name=`. They are not
 * interchangeable, which is why there are two upsert helpers below.
 *
 * ## Contract
 *
 * Every route should render exactly one `<Seo>`. Tags are shared mutable state,
 * so a route that renders none inherits whatever the previous route set.
 * Authenticated routes get theirs from `ProtectedRoute` and must not add
 * another.
 */

export { SITE_NAME };

interface SeoProps {
  /**
   * Page title without the brand suffix — "Register your church" renders as
   * "Register your church | GuardianCheck". Omit on the home page, where the
   * brand should lead rather than trail.
   */
  title?: string;
  /** Meta description. Aim for 120-160 characters. */
  description?: string;
  /**
   * Keep this route out of search results. Use for anything behind auth and
   * for utility routes that would be dead ends in a search listing. Also
   * suppresses the canonical link — see "Canonicals" above.
   */
  noindex?: boolean;
  /**
   * Root-relative path to canonicalise to, when the page's own URL is not the
   * one that should be indexed. Defaults to the current path (a self-referential
   * canonical), which is what almost every page wants. Ignored when `noindex`.
   */
  canonicalPath?: string;
  /**
   * Social-card image for this route — root-relative (`/foo.png`) or absolute.
   * Defaults to the site card. Must be at least 1200x630 to render as a large
   * card rather than a thumbnail.
   */
  image?: string;
  /** Describes {@link SeoProps.image}. Pass whenever `image` is passed. */
  imageAlt?: string;
}

/** Sets `content` on an existing meta tag, creating it only if absent. */
function upsertMeta(name: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);

  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", name);
    document.head.appendChild(tag);
  }

  tag.setAttribute("content", content);
}

function removeMeta(name: string) {
  document.head.querySelector(`meta[name="${name}"]`)?.remove();
}

/**
 * Same as {@link upsertMeta} but keyed on `property=`, which is what Open Graph
 * uses. Writing an og tag with `name=` leaves it invisible to unfurlers.
 */
function upsertMetaProperty(property: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);

  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("property", property);
    document.head.appendChild(tag);
  }

  tag.setAttribute("content", content);
}

function removeMetaProperty(property: string) {
  document.head.querySelector(`meta[property="${property}"]`)?.remove();
}

/** Sets `href` on the canonical link, creating it only if absent. */
function upsertCanonical(href: string) {
  let tag = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", "canonical");
    document.head.appendChild(tag);
  }

  tag.setAttribute("href", href);
}

function removeCanonical() {
  document.head.querySelector('link[rel="canonical"]')?.remove();
}

export function Seo({
  title,
  description,
  noindex = false,
  canonicalPath,
  image,
  imageAlt,
}: SeoProps) {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = title ? `${title} | ${SITE_NAME}` : SITE_NAME;

    if (description) {
      upsertMeta("description", description);
    }

    // The page's own address. Unlike the canonical link this is set even on
    // noindex routes -- "don't index this" and "this is what was shared" are
    // different statements, and a shared link still needs to resolve.
    const pageUrl = canonicalUrl(canonicalPath ?? pathname);

    // Bare title, no brand suffix: og:site_name already carries the brand, and
    // unfurlers that show both would otherwise render it twice.
    upsertMetaProperty("og:title", title || SITE_NAME);
    upsertMetaProperty("og:url", pageUrl);
    upsertMeta("twitter:title", title || SITE_NAME);

    if (description) {
      upsertMetaProperty("og:description", description);
      upsertMeta("twitter:description", description);
    }

    const cardUrl = absoluteUrl(image ?? OG_IMAGE_PATH);
    const cardAlt = image ? imageAlt ?? "" : OG_IMAGE_ALT;

    upsertMetaProperty("og:image", cardUrl);
    upsertMeta("twitter:image", cardUrl);

    // A custom image with no alt clears the tag rather than inheriting the
    // previous route's — a stale alt describing a different picture is worse
    // than none, for screen readers and for anyone reading the card's markup.
    if (cardAlt) {
      upsertMetaProperty("og:image:alt", cardAlt);
      upsertMeta("twitter:image:alt", cardAlt);
    } else {
      removeMetaProperty("og:image:alt");
      removeMeta("twitter:image:alt");
    }

    // Absence of the tag means indexable, so clear it rather than writing
    // "index, follow" — otherwise a stale noindex would survive navigation.
    if (noindex) {
      upsertMeta("robots", "noindex, nofollow");
      removeCanonical();
    } else {
      removeMeta("robots");
      upsertCanonical(pageUrl);
    }
  }, [title, description, noindex, canonicalPath, pathname, image, imageAlt]);

  return null;
}
