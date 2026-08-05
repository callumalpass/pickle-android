import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
} from "react";

import markUrl from "./assets/pickle-mark.svg";
import {
  isNativeMdbaseCallback,
  pickleSession,
  pickleSnapshot,
  subscribeToPickleSession,
} from "./cloud/connect";
import {
  connectProblemFromError,
  requireConnectOutcome,
} from "./cloud/outcome";
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
    snapshot.status === "ready" ? pickleSession.connection() : null;
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
  const authorizationRequest = useRef<AbortController | null>(null);
  const definitionRequest = useRef<AbortController | null>(null);
  const authorizationPending = useRef(false);
  const handledCallbacks = useRef(new Set<string>());

  const completeNative = useCallback(async (url: string) => {
    if (!isNativeMdbaseCallback(url)) return;
    if (handledCallbacks.current.has(url)) return;
    handledCallbacks.current.add(url);
    authorizationPending.current = false;
    const controller = replaceController(authorizationRequest);
    setOpening(true);
    setError(null);
    try {
      requireConnectOutcome(
        await pickleSession.handleAuthorizationCallback(url, {
          signal: controller.signal,
          timeoutMs: 20_000,
        }),
      );
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
    let startup = new AbortController();
    const start = () => {
      startup.abort("Pickle startup superseded");
      const controller = new AbortController();
      startup = controller;
      void pickleSession
        .start({ signal: controller.signal, timeoutMs: 15_000 })
        .then(requireConnectOutcome)
        .catch((reason: unknown) => {
          if (active && !controller.signal.aborted)
            setError(connectionIssue(reason));
        });
    };
    start();
    if (!Capacitor.isNativePlatform()) {
      return () => {
        active = false;
        startup.abort("Pickle closed");
      };
    }
    const listener = CapacitorApp.addListener("appUrlOpen", ({ url }) => {
      void completeNative(url);
    });
    const appState = CapacitorApp.addListener(
      "appStateChange",
      ({ isActive }) => {
        if (isActive) start();
        else {
          startup.abort("Pickle moved to the background");
          authorizationRequest.current?.abort("Pickle moved to the background");
          definitionRequest.current?.abort("Pickle moved to the background");
        }
      },
    );
    const browserFinished = Browser.addListener("browserFinished", () => {
      if (!authorizationPending.current) return;
      authorizationPending.current = false;
      authorizationRequest.current?.abort("Authorization browser closed");
      setOpening(false);
      setError({
        code: "authorization_cancelled",
        title: "Connection cancelled",
        message: "Continue to mdbase when you are ready to try again.",
      });
    });
    void CapacitorApp.getLaunchUrl().then((value) => {
      if (value?.url) void completeNative(value.url);
    });
    return () => {
      active = false;
      startup.abort("Pickle closed");
      abortController(authorizationRequest, "Pickle closed");
      abortController(definitionRequest, "Pickle closed");
      void listener.then((handle) => handle.remove());
      void appState.then((handle) => handle.remove());
      void browserFinished.then((handle) => handle.remove());
    };
  }, [completeNative, usesSession]);

  useEffect(() => {
    if (!usesSession) return;
    const controller = new AbortController();
    void pickleNotifications
      .bindConnection(sessionConnection, {
        signal: controller.signal,
        timeoutMs: 15_000,
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(connectionIssue(reason));
      });
    return () => controller.abort("Pickle connection changed");
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
    const controller = replaceController(authorizationRequest);
    authorizationPending.current = Capacitor.isNativePlatform();
    setOpening(true);
    setError(null);
    void pickleSession
      .authorize(
        snapshot.status === "authorization_required" ? "selected" : "choose",
        { signal: controller.signal, timeoutMs: 30_000 },
      )
      .then((outcome) => {
        if (requireConnectOutcome(outcome).kind === "connected") {
          authorizationPending.current = false;
          setOpening(false);
        }
      })
      .catch((reason) => {
        authorizationPending.current = false;
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
      : snapshot.status === "authorization_required"
        ? {
            code: "authorization_required",
            title: "Review updated access",
            message:
              "Pickle’s required access or source-of-truth contract changed. Review it in mdbase to continue.",
          }
        : snapshot.status === "blocked"
          ? {
              code: snapshot.problem.code,
              title: "This collection needs attention",
              message: snapshot.problem.message,
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
      {snapshot.status === "checking_setup" ? (
        <p role="status">Checking this collection’s Pickle definitions…</p>
      ) : null}
      {snapshot.status === "setup_review_required" ? (
        <section
          className="connection-error"
          aria-labelledby="pickle-definition-update"
        >
          <strong id="pickle-definition-update">
            Pickle definitions changed
          </strong>
          <p>
            Review the source-of-truth changes before updating this collection.
            Existing requests are not changed by this step.
          </p>
          <ul>
            {snapshot.update.typePacks.map((update) => (
              <li key={update.id}>
                {update.name}: {update.currentVersion ?? "not installed"} →{" "}
                {update.desiredVersion}
              </li>
            ))}
          </ul>
          <button
            className="outline-action"
            disabled={opening || !snapshot.update.canApply}
            type="button"
            onClick={() => {
              const controller = replaceController(definitionRequest);
              setOpening(true);
              void pickleSession
                .applyCollectionSetup({
                  signal: controller.signal,
                  timeoutMs: 30_000,
                })
                .then(requireConnectOutcome)
                .catch((reason) => setError(connectionIssue(reason)))
                .finally(() => setOpening(false));
            }}
          >
            Review and update definitions
          </button>
        </section>
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
            : snapshot.status === "authorization_required"
              ? "Review updated access"
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
  const problem = connectProblemFromError(reason);
  if (problem) {
    const code = problem.code;
    if (code === "invalid_callback" || code === "expired_token") {
      return {
        code,
        title: "Authorization expired",
        message:
          "Start the connection again and approve the Pickle collection.",
      };
    }
    return {
      code,
      title: "Could not connect this collection",
      message: problem.message,
    };
  }
  return {
    code: "connection_failed",
    title: "Could not connect this collection",
    message: reason instanceof Error ? reason.message : String(reason),
  };
}

function replaceController(
  reference: MutableRefObject<AbortController | null>,
): AbortController {
  reference.current?.abort("Pickle request superseded");
  const controller = new AbortController();
  reference.current = controller;
  return controller;
}

function abortController(
  reference: MutableRefObject<AbortController | null>,
  reason: string,
): void {
  reference.current?.abort(reason);
}
