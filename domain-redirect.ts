import {
  APP_HOSTNAME,
  APP_SITE_URL,
  DOMAIN_SPLIT_PHASE,
  MARKETING_HOSTNAMES,
  MARKETING_URL,
  type DomainSplitPhase,
} from "./src/constants/site.js";
import { isMarketingPath } from "./src/constants/appRoutes.js";

export const config = { runtime: "edge" };

export function redirectResponse(request: Request, phase: DomainSplitPhase = DOMAIN_SPLIT_PHASE): Response {
  const url = new URL(request.url);
  let origin: string | null = null;

  if (url.hostname === APP_HOSTNAME && url.pathname !== "/" && isMarketingPath(url.pathname)) {
    origin = MARKETING_URL;
    url.pathname = url.pathname.replace(/\/+$/, "");
  } else if (phase === "live" && MARKETING_HOSTNAMES.includes(url.hostname)) {
    const apex = new URL(MARKETING_URL).hostname;
    if (url.hostname !== apex) origin = MARKETING_URL;
    else if (!isMarketingPath(url.pathname)) origin = APP_SITE_URL;
  }

  if (!origin || url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    return new Response("Not found", { status: 404 });
  }

  const headers: Record<string, string> = { Location: `${origin}${url.pathname}${url.search}` };
  if (url.hostname === APP_HOSTNAME) headers["X-Robots-Tag"] = "noindex, nofollow";
  return new Response(null, { status: 308, headers });
}

export default function handler(request: Request): Response {
  return redirectResponse(request);
}
