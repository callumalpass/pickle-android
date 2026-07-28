import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { MdbaseConnectError } from "@mdbase/connect";
import { useCallback, useEffect, useState } from "react";

import markUrl from "./assets/pickle-mark.svg";
import {
  activePickleConnection,
  authorizationReturnTo,
  clearPickleSelection,
  cleanCallbackUrl,
  completePickleAuthorization,
  isMdbaseCallback,
  onPickleConnectionChange,
  PICKLE_OPERATIONS,
  pickleConnect,
  savedPickleConnections,
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

interface ConnectionIssue {
  code: string;
  title: string;
  message: string;
  clearSelection?: boolean;
}

export function App({ repository: initialRepository }: AppProps = {}) {
  const [repository, setRepository] = useState<PickleRepository | null>(() => {
    if (initialRepository !== undefined) return initialRepository;
    if (import.meta.env.VITE_PICKLE_FIXTURE === "1")
      return new FixturePickleRepository();
    const connection = activePickleConnection();
    return connection ? new ConnectedPickleRepository(connection) : null;
  });
  const [error, setError] = useState<ConnectionIssue | null>(null);
  const [opening, setOpening] = useState(false);

  const complete = useCallback(async (url: string) => {
    if (!isMdbaseCallback(url)) return;
    try {
      const connection = await completePickleAuthorization(url);
      setRepository(new ConnectedPickleRepository(connection));
      setError(null);
    } catch (reason) {
      const issue = connectionIssue(reason);
      if (issue.clearSelection) clearPickleSelection();
      setError(issue);
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
    )
      return;
    return onPickleConnectionChange((connection) => {
      setRepository(
        connection ? new ConnectedPickleRepository(connection) : null,
      );
    });
  }, [initialRepository]);

  if (repository) {
    return (
      <PickleApp
        repository={repository}
        onChangeCollection={() => {
          clearPickleSelection();
          setError(null);
          setRepository(null);
        }}
        onDisconnect={() => {
          void pickleNotifications
            .disable()
            .catch(() => undefined)
            .finally(() => {
              activePickleConnection()?.forget();
              clearPickleSelection();
              setError(null);
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
        returnTo: authorizationReturnTo(),
      })
      .catch((reason) => {
        setOpening(false);
        const issue = connectionIssue(reason);
        if (issue.clearSelection) clearPickleSelection();
        setError(issue);
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
        <div className="connection-error" role="alert">
          <strong>{error.title}</strong>
          <p>{error.message}</p>
        </div>
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
            : error?.code === "collection_mismatch"
              ? "Choose collection again"
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

function connectionIssue(reason: unknown): ConnectionIssue {
  if (reason instanceof MdbaseConnectError) {
    if (reason.code === "collection_mismatch") {
      return {
        code: reason.code,
        title: "Choose the collection again",
        message:
          "Pickle was still linked to a different collection. That old selection has been cleared.",
        clearSelection: true,
      };
    }
    if (reason.code === "invalid_callback" || reason.code === "expired_token") {
      return {
        code: reason.code,
        title: "Authorization expired",
        message:
          "Start the connection again and approve the Pickle collection.",
      };
    }
    return {
      code: reason.code,
      title: "Could not connect this collection",
      message: reason.message,
    };
  }
  return {
    code: "connection_failed",
    title: "Could not connect this collection",
    message: reason instanceof Error ? reason.message : String(reason),
  };
}
