import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { MdbaseConnectError } from "@mdbase-dev/connect";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import markUrl from "./assets/pickle-mark.svg";
import {
  isNativeMdbaseCallback,
  pickleSession,
  pickleSnapshot,
  subscribeToPickleSession,
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
}

export function App({ repository: initialRepository }: AppProps = {}) {
  const snapshot = useSyncExternalStore(
    subscribeToPickleSession,
    pickleSnapshot,
  );
  const fixtureMode = import.meta.env.VITE_PICKLE_FIXTURE === "1";
  const usesSession = initialRepository === undefined && !fixtureMode;
  const fixtureRepository = useMemo(
    () => (fixtureMode ? new FixturePickleRepository() : null),
    [fixtureMode],
  );
  const sessionConnection =
    snapshot.status === "ready" ? snapshot.connection : null;
  const connectedRepository = useMemo(
    () =>
      sessionConnection
        ? new ConnectedPickleRepository(sessionConnection)
        : null,
    [sessionConnection],
  );
  const repository =
    initialRepository !== undefined
      ? initialRepository
      : (fixtureRepository ?? connectedRepository);
  const [error, setError] = useState<ConnectionIssue | null>(null);
  const [opening, setOpening] = useState(false);

  const completeNative = useCallback(async (url: string) => {
    if (!isNativeMdbaseCallback(url)) return;
    setOpening(true);
    setError(null);
    try {
      await pickleSession.handleAuthorizationCallback(url);
    } catch (reason) {
      setError(connectionIssue(reason));
    } finally {
      setOpening(false);
      await Browser.close().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!usesSession) return;
    let active = true;
    void pickleSession.start().catch((reason: unknown) => {
      if (active) setError(connectionIssue(reason));
    });
    if (!Capacitor.isNativePlatform()) {
      return () => {
        active = false;
      };
    }
    const listener = CapacitorApp.addListener("appUrlOpen", ({ url }) => {
      void completeNative(url);
    });
    void CapacitorApp.getLaunchUrl().then((value) => {
      if (value?.url) void completeNative(value.url);
    });
    return () => {
      active = false;
      void listener.then((handle) => handle.remove());
    };
  }, [completeNative, usesSession]);

  useEffect(() => {
    if (!usesSession) return;
    void pickleNotifications.bindConnection(sessionConnection);
  }, [sessionConnection, usesSession]);

  if (repository) {
    const collectionId = repository.collectionId;
    return (
      <PickleApp
        key={collectionId}
        repository={repository}
        onChangeCollection={
          usesSession
            ? () => {
                setError(null);
                pickleSession.clearSelection({ history: "replace" });
              }
            : undefined
        }
        onDisconnect={() => {
          if (!usesSession || snapshot.status !== "ready") return;
          const selectedCollectionId = snapshot.collectionId;
          void pickleNotifications
            .disable()
            .catch(() => undefined)
            .finally(() => {
              pickleSession.forget(selectedCollectionId);
              setError(null);
            });
        }}
      />
    );
  }

  function connect() {
    setOpening(true);
    setError(null);
    void pickleSession
      .authorize("choose")
      .then((outcome) => {
        if (outcome.kind === "connected") setOpening(false);
      })
      .catch((reason) => {
        setOpening(false);
        setError(connectionIssue(reason));
      });
  }

  const unavailableIssue =
    snapshot.status === "unavailable"
      ? {
          code: snapshot.reason,
          title: "Choose the collection again",
          message:
            snapshot.reason === "invalid_stored_grant"
              ? "This saved authorization is no longer compatible with Pickle."
              : snapshot.reason === "authorization_lost"
                ? "Pickle no longer has access to this collection."
                : "This bookmarked collection is not authorized on this device.",
        }
      : null;
  const displayedError = error ?? unavailableIssue;

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
      {displayedError ? (
        <div className="connection-error" role="alert">
          <strong>{displayedError.title}</strong>
          <p>{displayedError.message}</p>
        </div>
      ) : null}
      <div className="connection-actions">
        {snapshot.connections.map((connection) => (
          <button
            key={connection.collectionId}
            className="outline-action"
            type="button"
            onClick={() => {
              setError(null);
              pickleSession.select(connection.collectionId, {
                history: "replace",
              });
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
            : snapshot.connections.length
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

function connectionIssue(reason: unknown): ConnectionIssue {
  if (reason instanceof MdbaseConnectError) {
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
