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

interface SessionOperationContext {
  signal: AbortSignal;
  current: () => boolean;
}

interface ActiveSessionOperation {
  sequence: number;
  controller: AbortController;
  interruptible: boolean;
}

const SESSION_START_TIMEOUT_MS = 15_000;

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
  const startupRequest = useRef<AbortController | null>(null);
  const authorizationPending = useRef(false);
  const completedCallbacks = useRef(new Set<string>());
  const callbackOperations = useRef(new Map<string, Promise<boolean>>());
  const operationSequence = useRef(0);
  const operationTail = useRef<Promise<unknown>>(Promise.resolve());
  const activeOperation = useRef<ActiveSessionOperation | null>(null);
  const operationsAlive = useRef(true);
  const lastReadyCollectionId = useRef<string | null>(null);
  const suppressSelectionRestore = useRef(false);

  const runSessionOperation = useCallback(function runSessionOperation<Value>(
    operation: (context: SessionOperationContext) => Promise<Value>,
    {
      abortActive = true,
      interruptible = true,
    }: { abortActive?: boolean; interruptible?: boolean } = {},
  ): Promise<Value | undefined> {
    const sequence = ++operationSequence.current;
    if (abortActive && activeOperation.current?.interruptible !== false) {
      activeOperation.current?.controller.abort(
        "A newer Pickle operation superseded this one",
      );
    }
    const controller = new AbortController();
    const current = () =>
      operationsAlive.current &&
      (!interruptible || operationSequence.current === sequence) &&
      !controller.signal.aborted;
    const queued = operationTail.current
      .catch(() => undefined)
      .then(async () => {
        if (!current()) return undefined;
        activeOperation.current = { sequence, controller, interruptible };
        try {
          return await operation({ signal: controller.signal, current });
        } finally {
          if (activeOperation.current?.sequence === sequence) {
            activeOperation.current = null;
          }
        }
      });
    operationTail.current = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }, []);

  useEffect(() => {
    operationsAlive.current = true;
    return () => {
      operationsAlive.current = false;
      operationSequence.current += 1;
      activeOperation.current?.controller.abort("Pickle closed");
      activeOperation.current = null;
    };
  }, []);

  const startSession = useCallback(async () => {
    const controller = replaceController(startupRequest);
    const operationAtStart = operationSequence.current;
    try {
      requireConnectOutcome(
        await pickleSession.start({
          signal: controller.signal,
          timeoutMs: SESSION_START_TIMEOUT_MS,
        }),
      );
      if (
        !controller.signal.aborted &&
        operationSequence.current === operationAtStart
      ) {
        setError(null);
      }
    } catch (reason) {
      const current = pickleSession.getSnapshot();
      if (
        !controller.signal.aborted &&
        operationSequence.current === operationAtStart &&
        current.status !== "start_failed" &&
        current.status !== "destroyed"
      ) {
        setError(connectionIssue(reason));
      }
    }
  }, []);

  const selectCollection = useCallback(
    (collectionId: string) =>
      runSessionOperation(async ({ signal, current }) => {
        if (current()) setOpening(false);
        try {
          requireConnectOutcome(
            await pickleSession.start({
              signal,
              timeoutMs: SESSION_START_TIMEOUT_MS,
            }),
          );
          if (!current()) return;
          requireConnectOutcome(
            pickleSession.select(collectionId, { history: "replace" }),
          );
          if (current()) setError(null);
        } catch (reason) {
          if (current()) setError(connectionIssue(reason));
        }
      }),
    [runSessionOperation],
  );

  useEffect(() => {
    if (snapshot.status === "ready") {
      lastReadyCollectionId.current = snapshot.collectionId;
      return;
    }
    if (snapshot.status !== "unselected") {
      lastReadyCollectionId.current = null;
      return;
    }
    if (suppressSelectionRestore.current) {
      suppressSelectionRestore.current = false;
      return;
    }
    const collectionId = lastReadyCollectionId.current;
    if (!collectionId) return;
    void selectCollection(collectionId);
  }, [selectCollection, snapshot]);

  useEffect(() => {
    if (!usesSession) return;
    const handlePopState = () => {
      const collectionId = lastReadyCollectionId.current;
      if (!collectionId) return;
      if (new URLSearchParams(window.location.search).has("collection")) return;
      void selectCollection(collectionId);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [selectCollection, usesSession]);

  const completeNative = useCallback(
    (url: string): Promise<boolean> => {
      if (!isNativeMdbaseCallback(url)) return Promise.resolve(false);
      const key = authorizationCallbackKey(url);
      if (completedCallbacks.current.has(key)) return Promise.resolve(true);
      const existing = callbackOperations.current.get(key);
      if (existing) return existing;

      authorizationPending.current = false;
      const pending = runSessionOperation(
        async ({ signal, current }) => {
          if (current()) {
            setOpening(true);
            setError(null);
          }
          let succeeded = false;
          try {
            requireConnectOutcome(
              await pickleSession.start({
                signal,
                timeoutMs: SESSION_START_TIMEOUT_MS,
              }),
            );
            if (!current()) return false;
            requireConnectOutcome(
              await pickleSession.handleAuthorizationCallback(url, {
                signal,
                timeoutMs: 20_000,
              }),
            );
            succeeded = true;
            completedCallbacks.current.add(key);
            return true;
          } catch (reason) {
            if (current()) setError(connectionIssue(reason));
            return false;
          } finally {
            if (current()) setOpening(false);
            if (succeeded || current()) {
              await Browser.close().catch(() => undefined);
            }
          }
        },
        { abortActive: false },
      ).then((value) => value === true);
      callbackOperations.current.set(key, pending);
      void pending.finally(() => {
        if (callbackOperations.current.get(key) === pending) {
          callbackOperations.current.delete(key);
        }
      });
      return pending;
    },
    [runSessionOperation],
  );

  useEffect(() => {
    if (!usesSession) return;
    let mounted = true;
    queueMicrotask(() => {
      if (mounted) void startSession();
    });
    if (!Capacitor.isNativePlatform()) {
      return () => {
        mounted = false;
        abortController(startupRequest, "Pickle closed");
      };
    }
    const listener = CapacitorApp.addListener("appUrlOpen", ({ url }) => {
      void completeNative(url);
    });
    const appState = CapacitorApp.addListener(
      "appStateChange",
      ({ isActive }) => {
        if (isActive) void startSession();
        else {
          abortController(startupRequest, "Pickle moved to the background");
          if (activeOperation.current?.interruptible !== false) {
            activeOperation.current?.controller.abort(
              "Pickle moved to the background",
            );
          }
        }
      },
    );
    const browserFinished = Browser.addListener("browserFinished", () => {
      if (!authorizationPending.current) return;
      authorizationPending.current = false;
      operationSequence.current += 1;
      activeOperation.current?.controller.abort("Authorization browser closed");
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
      mounted = false;
      abortController(startupRequest, "Pickle closed");
      void listener.then((handle) => handle.remove());
      void appState.then((handle) => handle.remove());
      void browserFinished.then((handle) => handle.remove());
    };
  }, [completeNative, startSession, usesSession]);

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
      <>
        {error ? (
          <div className="connection-error" role="alert">
            <strong>{error.title}</strong>
            <p>{error.message}</p>
          </div>
        ) : null}
        <PickleApp
          key={collectionId}
          repository={repository}
          onChangeCollection={
            usesSession
              ? () => {
                  void runSessionOperation(async ({ signal, current }) => {
                    if (current()) setOpening(false);
                    try {
                      requireConnectOutcome(
                        await pickleSession.start({
                          signal,
                          timeoutMs: SESSION_START_TIMEOUT_MS,
                        }),
                      );
                      if (!current()) return;
                      suppressSelectionRestore.current = true;
                      requireConnectOutcome(
                        pickleSession.clearSelection({ history: "replace" }),
                      );
                      if (current()) setError(null);
                    } catch (reason) {
                      if (current()) {
                        suppressSelectionRestore.current = false;
                        setError(connectionIssue(reason));
                      }
                    }
                  });
                }
              : undefined
          }
          onDisconnect={() => {
            if (!usesSession || snapshot.status !== "ready") return;
            const selectedCollectionId = snapshot.collectionId;
            void runSessionOperation(
              async ({ signal, current }) => {
                if (current()) {
                  setOpening(false);
                  setError(null);
                }
                let notificationsDisabled = false;
                try {
                  await pickleNotifications.disable({
                    signal,
                    timeoutMs: 15_000,
                  });
                  notificationsDisabled = true;
                  if (!current()) return;
                  requireConnectOutcome(
                    await pickleSession.start({
                      signal,
                      timeoutMs: SESSION_START_TIMEOUT_MS,
                    }),
                  );
                  if (!current()) return;
                  requireConnectOutcome(
                    pickleSession.forget(selectedCollectionId),
                  );
                  if (!current()) return;
                  lastReadyCollectionId.current = null;
                  suppressSelectionRestore.current = true;
                  setError(null);
                } catch (reason) {
                  if (!current()) return;
                  const issue = connectionIssue(reason);
                  setError(
                    notificationsDisabled
                      ? {
                          ...issue,
                          title: "Collection not fully disconnected",
                          message: `Notifications were disabled, but Pickle could not forget this collection. ${issue.message}`,
                        }
                      : issue,
                  );
                }
              },
              { interruptible: false },
            );
          }}
        />
      </>
    );
  }

  function connect() {
    const target =
      snapshot.status === "authorization_required" ? "selected" : "choose";
    return runSessionOperation(
      async ({ signal, current }) => {
        if (current()) {
          authorizationPending.current = Capacitor.isNativePlatform();
          setOpening(true);
          setError(null);
        }
        try {
          requireConnectOutcome(
            await pickleSession.start({
              signal,
              timeoutMs: SESSION_START_TIMEOUT_MS,
            }),
          );
          if (!current()) return;
          const outcome = await pickleSession.authorize(target, {
            signal,
            timeoutMs: 30_000,
          });
          if (
            requireConnectOutcome(outcome).kind === "connected" &&
            current()
          ) {
            authorizationPending.current = false;
          }
        } catch (reason) {
          if (current()) {
            authorizationPending.current = false;
            setError(connectionIssue(reason));
          }
        } finally {
          if (current()) setOpening(false);
        }
      },
      { interruptible: false },
    );
  }

  function applyCollectionSetup() {
    return runSessionOperation(
      async ({ signal, current }) => {
        if (current()) {
          setOpening(true);
          setError(null);
        }
        try {
          requireConnectOutcome(
            await pickleSession.start({
              signal,
              timeoutMs: SESSION_START_TIMEOUT_MS,
            }),
          );
          if (!current()) return;
          requireConnectOutcome(
            await pickleSession.applyCollectionSetup({
              signal,
              timeoutMs: 30_000,
            }),
          );
        } catch (reason) {
          if (current()) setError(connectionIssue(reason));
        } finally {
          if (current()) setOpening(false);
        }
      },
      { interruptible: false },
    );
  }

  const unavailableIssue =
    snapshot.status === "start_failed"
      ? {
          code: snapshot.problem.code,
          title: "Could not open Pickle",
          message: snapshot.problem.message,
        }
      : snapshot.status === "destroyed"
        ? {
            code: "session_destroyed",
            title: "Pickle session closed",
            message: "Reload Pickle to open a new connection session.",
          }
        : snapshot.status === "unavailable"
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
  const startupRetry = snapshot.status === "not_started" && error !== null;
  const lifecyclePending =
    (snapshot.status === "not_started" && !startupRetry) ||
    snapshot.status === "starting";
  const selectedUnusableCollectionId =
    snapshot.status !== "ready" && "collectionId" in snapshot
      ? snapshot.collectionId
      : null;
  const alternativeConnections = snapshot.connections.filter(
    (connection) => connection.collectionId !== selectedUnusableCollectionId,
  );

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
      {lifecyclePending ? <p role="status">Opening Pickle…</p> : null}
      {snapshot.status === "checking_setup" ? (
        <p role="status">Checking this collection’s Pickle definitions…</p>
      ) : null}
      {snapshot.status === "setup_review_required" ? (
        <section
          className="connection-setup"
          aria-labelledby="pickle-definition-update"
        >
          <strong id="pickle-definition-update">
            Pickle definitions changed
          </strong>
          <p>
            This collection needs the definitions listed below before Pickle can
            open it. Existing requests are not changed by this step.
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
            onClick={() => void applyCollectionSetup()}
          >
            Update this collection
          </button>
        </section>
      ) : null}
      <div className="connection-actions">
        {snapshot.status !== "start_failed" && snapshot.status !== "destroyed"
          ? alternativeConnections.map((connection) => (
              <button
                key={connection.collectionId}
                className="outline-action"
                type="button"
                onClick={() => {
                  void selectCollection(connection.collectionId);
                }}
              >
                {snapshot.status === "setup_review_required" ? "Use " : "Open "}
                {connection.displayName}
              </button>
            ))
          : null}
        {snapshot.status === "start_failed" || startupRetry ? (
          <button
            className="outline-action"
            type="button"
            onClick={() => void startSession()}
          >
            Retry opening Pickle
          </button>
        ) : snapshot.status !== "setup_review_required" &&
          snapshot.status !== "destroyed" ? (
          <button
            className="outline-action"
            disabled={opening || lifecyclePending}
            type="button"
            onClick={() => void connect()}
          >
            {opening
              ? "Opening mdbase…"
              : snapshot.status === "authorization_required"
                ? "Review updated access"
                : snapshot.connections.length
                  ? "Connect another collection"
                  : "Continue to mdbase"}
          </button>
        ) : null}
        <small>
          {snapshot.status === "destroyed"
            ? "This session cannot be restarted after it has been closed."
            : snapshot.status === "setup_review_required"
              ? "Update this collection or choose one of your other connected collections."
              : "Pickle never asks for a server address, collection path, or network token."}
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

function authorizationCallbackKey(url: string): string {
  return new URL(url).searchParams.get("state") ?? url;
}
