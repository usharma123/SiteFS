import type { ViewerManifest } from "@sitefs/sitefs";

export type { ViewerManifest };

export async function fetchManifest(): Promise<ViewerManifest> {
  const response = await fetch("/api/manifest");
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to load manifest (${response.status}): ${text.slice(0, 200)}`);
  }
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(
      `Manifest API returned ${contentType || "non-JSON"}. Is the viewer server running? ${text.slice(0, 120)}`
    );
  }
  return response.json() as Promise<ViewerManifest>;
}

export function assetUrl(path: string): string {
  return `/api/asset?path=${encodeURIComponent(path)}`;
}

export function isImagePath(path: string): boolean {
  return /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(path);
}

export function isJsonPath(path: string): boolean {
  return path.endsWith(".json");
}

export function pageSlugFromAssetPath(path: string): string | undefined {
  const match = path.match(/^pages\/([^/]+)\//);
  return match?.[1];
}
