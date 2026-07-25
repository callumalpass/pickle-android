import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { MdbaseConnect } from "@mdbase/connect";

import type { MdbaseAppManifest } from "@mdbase/connect-protocol";
import type { PickleFrontmatter } from "@mdbase/pickle";
import bundledManifest from "../generated/mdbase-app.json";

export const PICKLE_OPERATIONS = [
  "describe",
  "changes",
  "read",
  "query",
  "create",
] as const;

const serverUrl =
  import.meta.env.VITE_MDBASE_CONNECT_URL ?? "https://connect.mdbase.dev";
const manifest =
  import.meta.env.VITE_MDBASE_MANIFEST_URL ??
  (bundledManifest as MdbaseAppManifest);
const redirectUri = Capacitor.isNativePlatform()
  ? "com.callumalpass.pickle://auth/mdbase/callback"
  : `${location.origin}${joinBase("auth/mdbase/callback")}`;

export const pickleConnect = new MdbaseConnect<PickleFrontmatter>({
  serverUrl,
  manifest,
  redirectUri,
  navigate: Capacitor.isNativePlatform()
    ? async (url) => Browser.open({ url })
    : undefined,
});

export function isMdbaseCallback(value: string): boolean {
  const url = new URL(value);
  return (
    url.searchParams.has("code") ||
    url.searchParams.has("error") ||
    url.protocol === "com.callumalpass.pickle:"
  );
}

export function cleanCallbackUrl(): void {
  const base = joinBase("");
  history.replaceState(null, "", base || "/");
}

function joinBase(path: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith("/") ? base : `${base}/`}${path}`;
}
