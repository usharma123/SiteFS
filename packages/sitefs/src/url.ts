import { slugifyName } from "./format.js";

export function normalizeOrigin(url: string): string {
  const parsed = new URL(url);
  return parsed.origin.toLowerCase();
}

export function normalizePageUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  const href = parsed.href.replace(/\/$/, "") || parsed.origin;
  return href;
}

export function originHashFromUrl(url: string): string {
  return normalizeOrigin(url);
}

/** Page directory slug under `/site/pages` (hyphen-separated). */
export function pageSlugFromUrl(url: string, _startUrl?: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/$/, "") || "/";
    if (path === "/") return "home";
    const segments = path.split("/").filter(Boolean).join("-");
    return slugifyName(segments || "page");
  } catch {
    return slugifyName(url);
  }
}

export function originLabelFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return normalizeOrigin(url);
  }
}
