import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import {
  MdbaseBrowserLocation,
  MdbaseConnect,
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

const pickleLocation = new MdbaseBrowserLocation(pickleConnect, {
  fallbackPath: joinBase(""),
});

export function savedPickleConnections(): MdbaseConnectionInfo[] {
  return pickleConnect.connections();
}

export function activePickleConnection(): MdbaseConnection<PickleFrontmatter> | null {
  return pickleLocation.activeConnection();
}

export function selectPickleConnection(
  collectionId: string,
  replace = false,
): void {
  pickleLocation.selectConnection(collectionId, { replace });
}

export function authorizationReturnTo(): string {
  return pickleLocation.authorizationReturnTo();
}

export function completePickleAuthorization(
  callbackUrl: string,
): Promise<MdbaseConnection<PickleFrontmatter>> {
  return pickleLocation.completeAuthorization(callbackUrl);
}

export function isMdbaseCallback(value: string): boolean {
  return pickleLocation.isAuthorizationCallback(value);
}

export function cleanCallbackUrl(): void {
  pickleLocation.clearAuthorizationCallback();
}

export function selectedPickleCollectionId(): string | null {
  return pickleLocation.selectedCollectionId();
}

export function clearPickleSelection(): void {
  const url = new URL(location.href);
  url.searchParams.delete("collection");
  history.replaceState(history.state, "", url);
}

export function onPickleConnectionChange(
  listener: (connection: MdbaseConnection<PickleFrontmatter> | null) => void,
): () => void {
  return pickleLocation.onChange(({ connection }) => listener(connection));
}

function joinBase(path: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith("/") ? base : `${base}/`}${path}`;
}
