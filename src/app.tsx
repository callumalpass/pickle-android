import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useState } from "react";

import markUrl from "./assets/pickle-mark.svg";
import {
  activePickleConnection,
  authorizationReturnTo,
  cleanCallbackUrl,
  completePickleAuthorization,
  isMdbaseCallback,
  onPickleConnectionChange,
  PICKLE_OPERATIONS,
  pickleConnect,
  savedPickleConnections,
  selectedPickleCollectionId,
  selectPickleConnection,
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
    const connection = activePickleConnection();
    return connection ? new ConnectedPickleRepository(connection) : null;
  });
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const complete = useCallback(async (url: string) => {
    if (!isMdbaseCallback(url)) return;
    try {
      const connection = await completePickleAuthorization(url);
      setRepository(new ConnectedPickleRepository(connection));
      setError(null);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setOpening(false);
      await finishCallback();
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

  useEffect(() => {
    if (
      initialRepository !== undefined ||
      import.meta.env.VITE_PICKLE_FIXTURE === "1"
    ) return;
    return onPickleConnectionChange((connection) => {
      setRepository(connection ? new ConnectedPickleRepository(connection) : null);
    });
  }, [initialRepository]);

  if (repository) {
    return (
      <PickleApp
        repository={repository}
        onChangeCollection={() => setRepository(null)}
        onDisconnect={() => {
          void pickleNotifications
            .disable()
            .catch(() => undefined)
            .finally(() => {
              activePickleConnection()?.forget();
              setRepository(null);
            });
        }}
      />
    );
  }

  function connect() {
    setOpening(true);
    setError(null);
    void pickleConnect
      .authorize({
        operations: [...PICKLE_OPERATIONS],
        collectionId: selectedPickleCollectionId() ?? undefined,
        returnTo: authorizationReturnTo(),
      })
      .catch((reason) => {
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
        {savedPickleConnections().map((connection) => (
          <button
            key={connection.collectionId}
            className="outline-action"
            type="button"
            onClick={() => {
              selectPickleConnection(connection.collectionId, true);
              const selected = pickleConnect.connection(
                connection.collectionId,
              );
              if (selected)
                setRepository(new ConnectedPickleRepository(selected));
            }}
          >
            Open {connection.displayName}
          </button>
        ))}
        <button
          className="outline-action"
          disabled={opening}
          type="button"
          onClick={connect}
        >
          {opening
            ? "Opening mdbase…"
            : savedPickleConnections().length
              ? "Connect another collection"
              : "Continue to mdbase"}
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
