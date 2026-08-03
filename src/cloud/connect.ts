import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import {
  MdbaseBrowserSelection,
  MdbaseConnect,
  type MdbaseConnection,
  type MdbaseApplicationSessionSnapshot,
} from "@mdbase-dev/connect";

import type { MdbaseAppManifest } from "@mdbase-dev/connect-protocol";
import type { PickleFrontmatter } from "@mdbase-dev/pickle";
import bundledManifest from "../generated/mdbase-app.json";

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

export const pickleSession = pickleConnect.createApplicationSession({
  selection: new MdbaseBrowserSelection({
    fallbackPath: joinBase(""),
  }),
});

export function pickleSnapshot(): MdbaseApplicationSessionSnapshot {
  return pickleSession.getSnapshot();
}

export function subscribeToPickleSession(listener: () => void): () => void {
  return pickleSession.subscribe(listener);
}

export function activePickleConnection(): MdbaseConnection<PickleFrontmatter> | null {
  return pickleSession.connection();
}

export function isNativeMdbaseCallback(value: string): boolean {
  try {
    const callback = new URL(value);
    return (
      callback.protocol === "com.callumalpass.pickle:" &&
      callback.hostname === "auth" &&
      callback.pathname === "/mdbase/callback"
    );
  } catch {
    return false;
  }
}

function joinBase(path: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith("/") ? base : `${base}/`}${path}`;
}
