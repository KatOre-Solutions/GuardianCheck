import React from "react";
import { Link } from "react-router-dom";
import { hrefOn, isCrossHost, type SiteHost } from "../lib/siteMode";
import { PageLoading } from "./PageLoading";

type SiteLinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  /** Which site the page belongs to after the domain split (#14). */
  host: SiteHost;
  /** Root-relative path, query and hash included. */
  to: string;
};

/**
 * A link to a page that belongs to a particular host. A router `<Link>` when
 * that page is served from this origin, which is every link in combined mode;
 * a plain `<a>` with an absolute URL when it lives on the other host, because a
 * router link can only navigate within its own origin.
 */
export function SiteLink({ host, to, children, ...rest }: SiteLinkProps) {
  if (isCrossHost(host)) {
    return (
      <a href={hrefOn(host, to)} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to} {...rest}>
      {children}
    </Link>
  );
}

/**
 * Sends a page load to the same path on the other host, keeping the query
 * string and hash (invite tokens, payment results, section anchors). Rendered
 * by routes that exist on one host but were reached on the other, e.g. an
 * in-app navigation the edge never saw.
 */
export function CrossHostRedirect({ host }: { host: SiteHost }) {
  React.useEffect(() => {
    // Same host would reload this very URL forever.
    if (!isCrossHost(host)) return;
    const { pathname, search, hash } = window.location;
    window.location.replace(hrefOn(host, `${pathname}${search}${hash}`));
  }, [host]);
  return <PageLoading />;
}
