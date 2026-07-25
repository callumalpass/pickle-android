import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import {
  MdbaseConnect,
  type MdbaseAuthorizationResult,
  type MdbaseConnection,
  type MdbaseConnectionInfo,
} from "@mdbase/connect";

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

const COLLECTION_PARAMETER = "collection";

export function savedPickleConnections(): MdbaseConnectionInfo[] {
  return pickleConnect.connections();
}

export function activePickleConnection(): MdbaseConnection<PickleFrontmatter> | null {
  const selected = new URL(location.href).searchParams.get(
    COLLECTION_PARAMETER,
  );
  if (selected) return pickleConnect.connection(selected);
  const saved = pickleConnect.connections();
  if (saved.length !== 1) return null;
  selectPickleConnection(saved[0].collectionId, true);
  return pickleConnect.connection(saved[0].collectionId);
}

export function selectPickleConnection(
  collectionId: string,
  replace = false,
): void {
  const url = cleanAuthorizationParameters(new URL(location.href));
  url.searchParams.set(COLLECTION_PARAMETER, collectionId);
  history[replace ? "replaceState" : "pushState"](null, "", url);
}

export function authorizationReturnTo(): string {
  const url = cleanAuthorizationParameters(new URL(location.href));
  return `${url.pathname}${url.search}${url.hash}`;
}

export function finishAuthorization(
  result: MdbaseAuthorizationResult<PickleFrontmatter>,
): MdbaseConnection<PickleFrontmatter> {
  const returnTo = cleanAuthorizationParameters(
    new URL(result.returnTo ?? joinBase(""), location.origin),
  );
  returnTo.searchParams.set(
    COLLECTION_PARAMETER,
    result.connection.collectionId,
  );
  history.replaceState(null, "", returnTo);
  return result.connection;
}

export function isMdbaseCallback(value: string): boolean {
  const url = new URL(value);
  return (
    url.searchParams.has("code") ||
    url.searchParams.has("error") ||
    url.protocol === "com.callumalpass.pickle:"
  );
}

export function cleanCallbackUrl(): void {
  history.replaceState(
    null,
    "",
    cleanAuthorizationParameters(new URL(location.href)),
  );
}

function cleanAuthorizationParameters(url: URL): URL {
  for (const parameter of ["code", "state", "error", "error_description"]) {
    url.searchParams.delete(parameter);
  }
  return url;
}

function joinBase(path: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith("/") ? base : `${base}/`}${path}`;
}
