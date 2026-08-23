import { Capacitor } from "@capacitor/core";
import type {
  ConnectProblem,
  MdbaseApplicationSessionSnapshot,
  MdbaseAppManifest,
  MdbaseConnection,
} from "@mdbase-dev/connect";
import { capabilityOperations } from "@mdbase-dev/connect-protocol";
import type { PickleFrontmatter } from "@mdbase-dev/pickle";
import { connectSuccess } from "@mdbase-dev/connect-testing";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const nativeApp = vi.hoisted(() => ({
  addListener: vi.fn(),
  getLaunchUrl: vi.fn(),
}));
const nativeBrowser = vi.hoisted(() => ({
  addListener: vi.fn(),
  close: vi.fn(),
}));

vi.mock("@capacitor/app", () => ({ App: nativeApp }));
vi.mock("@capacitor/browser", () => ({ Browser: nativeBrowser }));

import { App } from "./app";
import bundledManifest from "./generated/mdbase-app.json";
import { pickleConnect, pickleSession } from "./cloud/connect";
import { requireConnectOutcome } from "./cloud/outcome";
import { pickleNotifications } from "./native/notifications";

describe("Pickle connection", () => {
  beforeAll(async () => {
    vi.spyOn(pickleConnect, "register").mockResolvedValue(
      connectSuccess({
        id: "pickle-test-application",
        family_identity: "bundle:com.callumalpass.pickle",
        manifest_digest: "0".repeat(64),
        name: "Pickle",
        homepage: "https://pickle.mdbase.dev/",
        requirements: bundledManifest.requirements as NonNullable<
          MdbaseAppManifest["requirements"]
        >,
      }),
    );
    vi.spyOn(pickleConnect, "manifest").mockResolvedValue(
      connectSuccess(bundledManifest as MdbaseAppManifest),
    );
    requireConnectOutcome(await pickleSession.start());
  });

  afterAll(() => pickleSession.destroy());

  afterEach(() => {
    localStorage.clear();
    history.replaceState(null, "", "/");
    pickleSession.clearSelection({ history: "replace" });
    vi.restoreAllMocks();
    nativeApp.addListener.mockReset();
    nativeApp.getLaunchUrl.mockReset();
    nativeBrowser.addListener.mockReset();
    nativeBrowser.close.mockReset();
  });

  it("starts with one mdbase connection action and no server settings", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Open your decision inbox." }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Continue to mdbase" }),
    ).toBeVisible();
    expect(screen.queryByLabelText(/server|token|tailscale/i)).toBeNull();
  });

  it("starts choose authorization instead of targeting a stale bookmark", async () => {
    history.replaceState(null, "", "/?collection=old-collection");
    const authorize = vi
      .spyOn(pickleSession, "authorize")
      .mockReturnValue(new Promise<never>(() => undefined));
    render(<App repository={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to mdbase" }));

    await waitFor(() =>
      expect(authorize).toHaveBeenCalledWith("choose", {
        signal: expect.any(AbortSignal),
        timeoutMs: 30_000,
      }),
    );
  });

  it("queues collection selection until startup completes", async () => {
    let finishStartup!: (
      value: Awaited<ReturnType<typeof pickleSession.start>>,
    ) => void;
    const startup = new Promise<
      Awaited<ReturnType<typeof pickleSession.start>>
    >((resolve) => {
      finishStartup = resolve;
    });
    const snapshot = {
      status: "unselected",
      connections: [
        {
          collectionId: "remembered-collection",
          displayName: "Remembered collection",
        },
      ],
    } as MdbaseApplicationSessionSnapshot;
    vi.spyOn(pickleSession, "getSnapshot").mockReturnValue(snapshot);
    vi.spyOn(pickleSession, "start").mockReturnValue(startup);
    const select = vi
      .spyOn(pickleSession, "select")
      .mockReturnValue(connectSuccess({} as never));
    render(<App repository={null} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Open Remembered collection" }),
    );
    expect(select).not.toHaveBeenCalled();

    await act(async () => finishStartup(connectSuccess(snapshot)));

    await waitFor(() =>
      expect(select).toHaveBeenCalledWith("remembered-collection", {
        history: "replace",
      }),
    );
  });

  it("drops a queued stale collection selection in favor of the latest", async () => {
    const snapshot = {
      status: "unselected",
      connections: [
        { collectionId: "collection-a", displayName: "Collection A" },
        { collectionId: "collection-b", displayName: "Collection B" },
      ],
    } as MdbaseApplicationSessionSnapshot;
    vi.spyOn(pickleSession, "getSnapshot").mockReturnValue(snapshot);
    vi.spyOn(pickleSession, "start").mockResolvedValue(
      connectSuccess(snapshot),
    );
    const select = vi
      .spyOn(pickleSession, "select")
      .mockReturnValue(connectSuccess({} as never));
    render(<App repository={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Collection A" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Collection B" }));

    await waitFor(() => expect(select).toHaveBeenCalledOnce());
    expect(select).toHaveBeenCalledWith("collection-b", { history: "replace" });
  });

  it("fences a stale collection failure before running the latest selection", async () => {
    const snapshot = {
      status: "unselected",
      connections: [
        { collectionId: "collection-a", displayName: "Collection A" },
        { collectionId: "collection-b", displayName: "Collection B" },
      ],
    } as MdbaseApplicationSessionSnapshot;
    const staleProblem = {
      code: "temporarily_unavailable",
      message: "Stale selection failed.",
    } as ConnectProblem<"temporarily_unavailable">;
    let finishFirst!: (
      value: Awaited<ReturnType<typeof pickleSession.start>>,
    ) => void;
    let starts = 0;
    vi.spyOn(pickleSession, "getSnapshot").mockReturnValue(snapshot);
    vi.spyOn(pickleSession, "start").mockImplementation(() => {
      starts += 1;
      return starts === 1
        ? new Promise((resolve) => {
            finishFirst = resolve;
          })
        : Promise.resolve(connectSuccess(snapshot));
    });
    const select = vi
      .spyOn(pickleSession, "select")
      .mockReturnValue(connectSuccess({} as never));
    render(<App repository={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Collection A" }));
    await waitFor(() => expect(starts).toBe(1));

    fireEvent.click(screen.getByRole("button", { name: "Open Collection B" }));
    await act(async () => finishFirst({ ok: false, problem: staleProblem }));

    await waitFor(() => expect(select).toHaveBeenCalledOnce());
    expect(select).toHaveBeenCalledWith("collection-b", { history: "replace" });
    expect(screen.queryByText("Stale selection failed.")).toBeNull();
  });

  it("surfaces a synchronous non-OK selection outcome", async () => {
    const snapshot = {
      status: "unselected",
      connections: [
        { collectionId: "broken-collection", displayName: "Broken collection" },
      ],
    } as MdbaseApplicationSessionSnapshot;
    const problem = {
      code: "session_destroyed",
      message: "The collection session has closed.",
    } as ConnectProblem<"session_destroyed">;
    vi.spyOn(pickleSession, "getSnapshot").mockReturnValue(snapshot);
    vi.spyOn(pickleSession, "start").mockResolvedValue(
      connectSuccess(snapshot),
    );
    vi.spyOn(pickleSession, "select").mockReturnValue({ ok: false, problem });
    render(<App repository={null} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Open Broken collection" }),
    );

    expect(
      await screen.findByText("The collection session has closed."),
    ).toBeVisible();
  });

  it("reviews declaration drift for only the selected collection", async () => {
    const snapshot = {
      status: "authorization_required",
      collectionId: "selected-collection",
      info: {},
      capabilities: {},
      connections: [
        {
          collectionId: "selected-collection",
          displayName: "Selected collection",
        },
        {
          collectionId: "alternative-collection",
          displayName: "Alternative collection",
        },
      ],
    } as unknown as MdbaseApplicationSessionSnapshot;
    vi.spyOn(pickleSession, "getSnapshot").mockReturnValue(snapshot);
    vi.spyOn(pickleSession, "start").mockResolvedValue(
      connectSuccess(snapshot),
    );
    const authorize = vi
      .spyOn(pickleSession, "authorize")
      .mockReturnValue(new Promise<never>(() => undefined));
    render(<App repository={null} />);

    expect(
      screen.queryByRole("button", { name: "Open Selected collection" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Open Alternative collection" }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Review updated access" }),
    );

    await waitFor(() =>
      expect(authorize).toHaveBeenCalledWith("selected", {
        signal: expect.any(AbortSignal),
        timeoutMs: 30_000,
      }),
    );
  });

  it("offers retry for start_failed and treats destroyed as terminal", () => {
    const problem = {
      code: "temporarily_unavailable",
      message: "Registration is temporarily unavailable.",
    } as ConnectProblem<"temporarily_unavailable">;
    vi.spyOn(pickleSession, "getSnapshot").mockReturnValue({
      status: "start_failed",
      problem,
      connections: [],
    });
    const start = vi.spyOn(pickleSession, "start").mockResolvedValue({
      ok: false,
      problem,
    });
    const view = render(<App repository={null} />);

    expect(screen.getByText("Could not open Pickle")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry opening Pickle" }),
    );
    expect(start).toHaveBeenCalledOnce();

    vi.restoreAllMocks();
    vi.spyOn(pickleSession, "getSnapshot").mockReturnValue({
      status: "destroyed",
      connections: [],
    });
    view.rerender(<App repository={null} />);

    expect(screen.getByText("Pickle session closed")).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers retry when startup throws in not_started and clears the stale error", async () => {
    const snapshot = {
      status: "not_started",
      connections: [],
    } as MdbaseApplicationSessionSnapshot;
    vi.spyOn(pickleSession, "getSnapshot").mockReturnValue(snapshot);
    const start = vi
      .spyOn(pickleSession, "start")
      .mockRejectedValueOnce(new Error("Unexpected startup failure."))
      .mockResolvedValue(connectSuccess(snapshot));

    render(<App />);

    expect(
      await screen.findByText("Unexpected startup failure."),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry opening Pickle" }),
    );

    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText("Unexpected startup failure.")).toBeNull(),
    );
  });

  it("handles a replayed native deep link only once", async () => {
    const callbacks = new Map<string, (value: never) => void>();
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    nativeApp.addListener.mockImplementation(
      (eventName: string, callback: (value: never) => void) => {
        callbacks.set(eventName, callback);
        return Promise.resolve({ remove: vi.fn() });
      },
    );
    nativeApp.getLaunchUrl.mockResolvedValue(undefined);
    nativeBrowser.addListener.mockResolvedValue({ remove: vi.fn() });
    nativeBrowser.close.mockResolvedValue(undefined);
    const sessionSnapshot = pickleSession.getSnapshot();
    let finishStartup!: (
      value: Awaited<ReturnType<typeof pickleSession.start>>,
    ) => void;
    vi.spyOn(pickleSession, "start").mockReturnValue(
      new Promise((resolve) => {
        finishStartup = resolve;
      }),
    );
    const callback = vi
      .spyOn(pickleSession, "handleAuthorizationCallback")
      .mockResolvedValue(connectSuccess({} as never));
    render(<App />);
    await waitFor(() => expect(callbacks.has("appUrlOpen")).toBe(true));
    const url =
      "com.callumalpass.pickle://auth/mdbase/callback?code=one&state=two";

    await act(async () => {
      callbacks.get("appUrlOpen")?.({ url } as never);
      callbacks.get("appUrlOpen")?.({ url } as never);
    });
    expect(callback).not.toHaveBeenCalled();

    await act(async () => finishStartup(connectSuccess(sessionSnapshot)));

    await waitFor(() => expect(callback).toHaveBeenCalledOnce());
    expect(callback).toHaveBeenCalledWith(url, {
      signal: expect.any(AbortSignal),
      timeoutMs: 20_000,
    });
  });

  it("queues a native callback racing its authorization without aborting it", async () => {
    const callbacks = new Map<string, (value: never) => void>();
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    nativeApp.addListener.mockImplementation(
      (eventName: string, callback: (value: never) => void) => {
        callbacks.set(eventName, callback);
        return Promise.resolve({ remove: vi.fn() });
      },
    );
    nativeApp.getLaunchUrl.mockResolvedValue(undefined);
    nativeBrowser.addListener.mockResolvedValue({ remove: vi.fn() });
    nativeBrowser.close.mockResolvedValue(undefined);
    vi.spyOn(pickleSession, "start").mockResolvedValue(
      connectSuccess(pickleSession.getSnapshot()),
    );
    let finishAuthorization!: (
      value: Awaited<ReturnType<typeof pickleSession.authorize>>,
    ) => void;
    let authorizationSignal: AbortSignal | undefined;
    vi.spyOn(pickleSession, "authorize").mockImplementation(
      (_target, options) => {
        authorizationSignal = options?.signal;
        return new Promise((resolve) => {
          finishAuthorization = resolve;
        });
      },
    );
    const callback = vi
      .spyOn(pickleSession, "handleAuthorizationCallback")
      .mockResolvedValue(connectSuccess({} as never));
    render(<App />);
    await waitFor(() => expect(callbacks.has("appUrlOpen")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Continue to mdbase" }));
    await waitFor(() => expect(authorizationSignal).toBeDefined());

    act(() => {
      callbacks.get("appUrlOpen")?.({
        url: "com.callumalpass.pickle://auth/mdbase/callback?code=one&state=race",
      } as never);
    });

    expect(authorizationSignal?.aborted).toBe(false);
    expect(callback).not.toHaveBeenCalled();
    await act(async () =>
      finishAuthorization(connectSuccess({ kind: "redirecting" })),
    );
    await waitFor(() => expect(callback).toHaveBeenCalledOnce());
  });

  it("reports a partial disconnect when notifications stop but forget fails", async () => {
    const appStateCallbacks: Array<(value: { isActive: boolean }) => void> = [];
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    nativeApp.addListener.mockImplementation(
      (eventName: string, callback: (value: { isActive: boolean }) => void) => {
        if (eventName === "appStateChange") appStateCallbacks.push(callback);
        return Promise.resolve({ remove: vi.fn() });
      },
    );
    nativeApp.getLaunchUrl.mockResolvedValue(undefined);
    nativeBrowser.addListener.mockResolvedValue({ remove: vi.fn() });
    nativeBrowser.close.mockResolvedValue(undefined);
    const snapshot = {
      status: "ready",
      verification: "verified",
      collectionId: "partial-disconnect",
      info: {},
      capabilities: {},
      connections: [],
    } as unknown as MdbaseApplicationSessionSnapshot;
    const connection = {
      collectionId: "partial-disconnect",
      info: () => ({ authority: { kind: "hosted" } }),
      pendingMutations: () => [],
      pendingMutation: () => null,
      queryPages: async function* () {
        yield* [];
      },
      watch: () => new Promise<never>(() => undefined),
    } as unknown as MdbaseConnection<PickleFrontmatter>;
    const problem = {
      code: "session_destroyed",
      message: "The grant could not be forgotten.",
    } as ConnectProblem<"session_destroyed">;
    vi.spyOn(pickleSession, "getSnapshot").mockReturnValue(snapshot);
    vi.spyOn(pickleSession, "connection").mockReturnValue(connection);
    vi.spyOn(pickleSession, "start").mockResolvedValue(
      connectSuccess(snapshot),
    );
    const forget = vi
      .spyOn(pickleSession, "forget")
      .mockReturnValue({ ok: false, problem });
    let finishDisable!: () => void;
    let disableSignal: AbortSignal | undefined;
    const disable = vi.spyOn(pickleNotifications, "disable").mockImplementation(
      (options) =>
        new Promise<void>((resolve) => {
          disableSignal = options?.signal;
          finishDisable = resolve;
        }),
    );
    vi.spyOn(pickleNotifications, "start").mockResolvedValue(undefined);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "More" }));

    fireEvent.click(
      screen.getByRole("button", { name: "Disconnect this collection" }),
    );

    await waitFor(() => expect(disableSignal).toBeDefined());
    act(() => {
      for (const callback of appStateCallbacks) callback({ isActive: false });
    });
    expect(disableSignal?.aborted).toBe(false);
    await act(async () => finishDisable());

    expect(
      await screen.findByText("Collection not fully disconnected"),
    ).toBeVisible();
    expect(
      screen.getByText(
        /Notifications were disabled.*grant could not be forgotten/,
      ),
    ).toBeVisible();
    expect(disable).toHaveBeenCalledOnce();
    expect(forget).toHaveBeenCalledWith("partial-disconnect");
  });

  it("preserves setup outcome reporting when the native app backgrounds", async () => {
    const appStateCallbacks: Array<(value: { isActive: boolean }) => void> = [];
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    nativeApp.addListener.mockImplementation(
      (eventName: string, callback: (value: { isActive: boolean }) => void) => {
        if (eventName === "appStateChange") appStateCallbacks.push(callback);
        return Promise.resolve({ remove: vi.fn() });
      },
    );
    nativeApp.getLaunchUrl.mockResolvedValue(undefined);
    nativeBrowser.addListener.mockResolvedValue({ remove: vi.fn() });
    const snapshot = {
      status: "setup_review_required",
      collectionId: "setup-collection",
      info: {},
      capabilities: {},
      connections: [],
      update: {
        canApply: true,
        typePacks: [
          {
            id: "pickle",
            name: "Pickle",
            currentVersion: "1",
            desiredVersion: "2",
          },
        ],
      },
    } as unknown as MdbaseApplicationSessionSnapshot;
    const problem = {
      code: "temporarily_unavailable",
      message: "The setup outcome is unknown.",
    } as ConnectProblem<"temporarily_unavailable">;
    vi.spyOn(pickleSession, "getSnapshot").mockReturnValue(snapshot);
    vi.spyOn(pickleSession, "start").mockResolvedValue(
      connectSuccess(snapshot),
    );
    let finishSetup!: (
      value: Awaited<ReturnType<typeof pickleSession.applyCollectionSetup>>,
    ) => void;
    let setupSignal: AbortSignal | undefined;
    vi.spyOn(pickleSession, "applyCollectionSetup").mockImplementation(
      (options) => {
        setupSignal = options?.signal;
        return new Promise((resolve) => {
          finishSetup = resolve;
        });
      },
    );
    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Update this collection" }),
    );
    await waitFor(() => expect(setupSignal).toBeDefined());

    act(() => {
      for (const callback of appStateCallbacks) callback({ isActive: false });
    });
    expect(setupSignal?.aborted).toBe(false);
    await act(async () => finishSetup({ ok: false, problem }));

    expect(
      await screen.findByText("The setup outcome is unknown."),
    ).toBeVisible();
  });

  it("still cancels interruptible collection work when backgrounded", async () => {
    const appStateCallbacks: Array<(value: { isActive: boolean }) => void> = [];
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    nativeApp.addListener.mockImplementation(
      (eventName: string, callback: (value: { isActive: boolean }) => void) => {
        if (eventName === "appStateChange") appStateCallbacks.push(callback);
        return Promise.resolve({ remove: vi.fn() });
      },
    );
    nativeApp.getLaunchUrl.mockResolvedValue(undefined);
    nativeBrowser.addListener.mockResolvedValue({ remove: vi.fn() });
    const snapshot = {
      status: "unselected",
      connections: [
        { collectionId: "cancelled-selection", displayName: "Cancelled" },
      ],
    } as MdbaseApplicationSessionSnapshot;
    vi.spyOn(pickleSession, "getSnapshot").mockReturnValue(snapshot);
    let finishSelectionStart!: (
      value: Awaited<ReturnType<typeof pickleSession.start>>,
    ) => void;
    let selectionSignal: AbortSignal | undefined;
    let starts = 0;
    vi.spyOn(pickleSession, "start").mockImplementation((options) => {
      starts += 1;
      if (starts === 1) return Promise.resolve(connectSuccess(snapshot));
      selectionSignal = options?.signal;
      return new Promise((resolve) => {
        finishSelectionStart = resolve;
      });
    });
    const select = vi.spyOn(pickleSession, "select");
    render(<App />);
    await waitFor(() => expect(starts).toBe(1));
    fireEvent.click(screen.getByRole("button", { name: "Open Cancelled" }));
    await waitFor(() => expect(selectionSignal).toBeDefined());

    act(() => {
      for (const callback of appStateCallbacks) callback({ isActive: false });
    });
    expect(selectionSignal?.aborted).toBe(true);
    await act(async () => finishSelectionStart(connectSuccess(snapshot)));
    expect(select).not.toHaveBeenCalled();
  });

  it("turns native browser close into a cancellable connection state", async () => {
    const browserCallbacks = new Map<string, () => void>();
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    nativeApp.addListener.mockResolvedValue({
      remove: vi.fn(),
    });
    nativeApp.getLaunchUrl.mockResolvedValue(undefined);
    nativeBrowser.addListener.mockImplementation(
      (eventName: string, callback: () => void) => {
        browserCallbacks.set(eventName, callback);
        return Promise.resolve({ remove: vi.fn() });
      },
    );
    vi.spyOn(pickleSession, "start").mockResolvedValue(
      connectSuccess(pickleSession.getSnapshot()),
    );
    const authorize = vi
      .spyOn(pickleSession, "authorize")
      .mockReturnValue(new Promise<never>(() => undefined));
    render(<App />);
    await waitFor(() =>
      expect(browserCallbacks.has("browserFinished")).toBe(true),
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue to mdbase" }));
    await waitFor(() => expect(authorize).toHaveBeenCalledOnce());

    act(() => browserCallbacks.get("browserFinished")?.());

    expect(await screen.findByText("Connection cancelled")).toBeVisible();
    expect(
      screen.getByText("Continue to mdbase when you are ready to try again."),
    ).toBeVisible();
  });

  it("keeps the selected collection when a history traversal drops it", async () => {
    const manifest = bundledManifest as MdbaseAppManifest;
    const operations = [
      ...new Set(
        [
          ...manifest.requirements!.capabilities!.required,
          ...(manifest.requirements!.capabilities!.optional ?? []),
        ].flatMap(
          (id) =>
            capabilityOperations(
              id as Parameters<typeof capabilityOperations>[0],
            ) as string[],
        ),
      ),
    ];
    const fakeInfo = {
      collectionId: "guard-test-collection",
      displayName: "Guard test collection",
      authority: { kind: "connector" },
      operations,
      scope: { access: "full_collection" },
      fileCapability: { actions: ["list", "read"] },
    } as unknown as ReturnType<MdbaseConnection<PickleFrontmatter>["info"]>;
    const fakeConnection = {
      collectionId: "guard-test-collection",
      info: () => fakeInfo,
      authorizationCapabilities: () => ({
        sufficient: true,
        grantedOperations: operations,
        missingOperations: [],
      }),
      assessCollectionSetup: () =>
        Promise.resolve(
          connectSuccess({
            status: "current",
            applicable: true,
            typePacks: [],
          } as never),
        ),
      onConnectionChange: () => () => undefined,
      pendingMutations: () => [],
      pendingMutation: () => null,
      watch: () => new Promise<never>(() => undefined),
    } as unknown as MdbaseConnection<PickleFrontmatter>;
    vi.spyOn(pickleConnect, "connections").mockReturnValue([fakeInfo as never]);
    vi.spyOn(pickleConnect, "connection").mockReturnValue(fakeConnection);
    vi.spyOn(pickleConnect, "connectionApplicationId").mockReturnValue(
      "pickle-test-application",
    );
    history.replaceState(null, "", "/?collection=guard-test-collection");
    pickleSession.select("guard-test-collection", { history: "replace" });

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Inbox" })).toBeVisible();

    act(() => {
      history.pushState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });

    await waitFor(() =>
      expect(new URLSearchParams(location.search).get("collection")).toBe(
        "guard-test-collection",
      ),
    );
    expect(
      screen.queryByRole("heading", { name: "Open your decision inbox." }),
    ).toBeNull();
    expect(screen.getByRole("heading", { name: "Inbox" })).toBeVisible();
  });
});
