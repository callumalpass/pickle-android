import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useState } from "react";

import markUrl from "./assets/pickle-mark.svg";
import {
  cleanCallbackUrl,
  isMdbaseCallback,
  PICKLE_OPERATIONS,
  pickleConnect,
} from "./cloud/connect";
import { FixturePickleRepository } from "./dev/fixture";
import {
  ConnectedPickleRepository,
  type PickleRepository,
} from "./domain/repository";
import { pickleNotifications } from "./native/notifications";
import { PickleApp } from "./ui/pickle-app";

interface AppProps {
  repository?: PickleRepository | null;
}

export function App({ repository: initialRepository }: AppProps = {}) {
  const [repository, setRepository] = useState<PickleRepository | null>(() => {
    if (initialRepository !== undefined) return initialRepository;
    if (import.meta.env.VITE_PICKLE_FIXTURE === "1")
      return new FixturePickleRepository();
    return pickleConnect.connection() ? new ConnectedPickleRepository() : null;
  });
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const complete = useCallback(async (url: string) => {
    if (!isMdbaseCallback(url)) return;
    const callback = new URL(url);
    const denied = callback.searchParams.get("error");
    if (denied) {
      setError(
        callback.searchParams.get("error_description") ??
          "Collection access was not approved.",
      );
      await finishCallback();
      return;
    }
    try {
      await pickleConnect.completeAuthorization(url);
      setRepository(new ConnectedPickleRepository());
      setError(null);
      await finishCallback();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setOpening(false);
    }
  }, []);

  useEffect(() => {
    if (isMdbaseCallback(location.href)) {
      const callbackUrl = location.href;
      queueMicrotask(() => void complete(callbackUrl));
    }
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener("appUrlOpen", ({ url }) => {
      void complete(url);
    });
    void CapacitorApp.getLaunchUrl().then((value) => {
      if (value?.url) void complete(value.url);
    });
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [complete]);

  if (repository) {
    return (
      <PickleApp
        repository={repository}
        onDisconnect={() => {
          void pickleNotifications
            .disable()
            .catch(() => undefined)
            .finally(() => {
              pickleConnect.disconnect();
              setRepository(null);
            });
        }}
      />
    );
  }

  function connect() {
    setOpening(true);
    setError(null);
    void pickleConnect.authorize([...PICKLE_OPERATIONS]).catch((reason) => {
      setOpening(false);
      setError(message(reason));
    });
  }

  return (
    <main className="connection-screen">
      <div className="connection-copy">
        <img alt="" src={markUrl} />
        <p className="eyebrow">Pickle</p>
        <h1>Open your decision inbox.</h1>
        <p>
          Choose a Pickle collection from mdbase cloud or from a computer
          running mdbase connect.
        </p>
      </div>
      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="connection-actions">
        <button
          className="outline-action"
          disabled={opening}
          type="button"
          onClick={connect}
        >
          {opening ? "Opening mdbase…" : "Continue to mdbase"}
        </button>
        <small>
          Pickle never asks for a server address, collection path, or network
          token.
        </small>
      </div>
    </main>
  );
}

async function finishCallback(): Promise<void> {
  if (Capacitor.isNativePlatform())
    await Browser.close().catch(() => undefined);
  else cleanCallbackUrl();
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
