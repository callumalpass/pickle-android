import { Capacitor } from "@capacitor/core";
import type { ConnectRequestOptions } from "@mdbase-dev/connect";
import type { PickleResponseSubmission } from "@mdbase-dev/pickle";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const nativeApp = vi.hoisted(() => ({
  addListener: vi.fn(),
  minimizeApp: vi.fn(),
}));

vi.mock("@capacitor/app", () => ({ App: nativeApp }));

import { FixturePickleRepository } from "../dev/fixture";
import { pickleNotifications } from "../native/notifications";
import { PickleApp } from "./pickle-app";

describe("Pickle inbox", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    localStorage.clear();
    vi.restoreAllMocks();
    nativeApp.addListener.mockReset();
    nativeApp.minimizeApp.mockReset();
  });

  it("finishes an active load and coalesces change bursts into one follow-up", async () => {
    const repository = new FixturePickleRepository();
    const rows = await repository.list();
    let finish!: (value: typeof rows) => void;
    let signal: AbortSignal | undefined;
    const list = vi
      .spyOn(repository, "list")
      .mockImplementationOnce((options?: ConnectRequestOptions) => {
        signal = options?.signal;
        return new Promise((resolve) => {
          finish = resolve;
        });
      });
    let changed!: () => void;
    vi.spyOn(repository, "subscribe").mockImplementation((onChange) => {
      changed = onChange;
      return () => undefined;
    });
    render(<PickleApp repository={repository} onDisconnect={vi.fn()} />);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    act(() => {
      changed();
      changed();
      changed();
    });
    expect(list).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(false);
    await act(async () => {
      finish(rows);
    });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole("button", {
        name: /Approve production deployment/,
      }),
    ).toBeVisible();
  });

  it("runs a queued refresh even when the active read fails", async () => {
    const repository = new FixturePickleRepository();
    let fail!: (reason: Error) => void;
    const list = vi.spyOn(repository, "list").mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    let changed!: () => void;
    vi.spyOn(repository, "subscribe").mockImplementation((onChange) => {
      changed = onChange;
      return () => undefined;
    });
    render(<PickleApp repository={repository} onDisconnect={vi.fn()} />);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    act(() => changed());
    await act(async () => {
      fail(new Error("First read timed out"));
    });
    expect(
      await screen.findByRole("button", {
        name: /Approve production deployment/,
      }),
    ).toBeVisible();
    expect(list).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("First read timed out")).not.toBeInTheDocument();
  });

  it("loads context only when opened and prevents responding until it arrives", async () => {
    const repository = new FixturePickleRepository();
    const rows = (await repository.list()).map((request) => ({
      ...request,
      body: "",
    }));
    vi.spyOn(repository, "list").mockResolvedValue(rows);
    let finish!: (body: string) => void;
    const readBody = vi.spyOn(repository, "readBody").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<PickleApp repository={repository} onDisconnect={vi.fn()} />);
    const row = await screen.findByRole("button", {
      name: /Approve production deployment/,
    });
    expect(readBody).not.toHaveBeenCalled();
    fireEvent.click(row);
    expect(screen.getByText("Loading request context…")).toBeVisible();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    await act(async () => {
      finish("Context fetched on demand.");
    });
    expect(screen.getByText("Context fetched on demand.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  });

  it("ignores context from a closed request even if its transport finishes late", async () => {
    const repository = new FixturePickleRepository();
    const rows = (await repository.list()).map((request) => ({
      ...request,
      body: "",
    }));
    vi.spyOn(repository, "list").mockResolvedValue(rows);
    let finish!: (body: string) => void;
    let signal: AbortSignal | undefined;
    vi.spyOn(repository, "readBody").mockImplementation(
      (_request, options?: ConnectRequestOptions) => {
        signal = options?.signal;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    );
    render(<PickleApp repository={repository} onDisconnect={vi.fn()} />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Approve production deployment/,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to requests" }));
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      finish("Obsolete context");
    });
    expect(screen.queryByText("Obsolete context")).not.toBeInTheDocument();
  });

  it("keeps reading unchanged context through inbox refreshes", async () => {
    const repository = new FixturePickleRepository();
    const rows = (await repository.list()).map((request) => ({
      ...request,
      body: "",
      modifiedAt: "2026-09-07T00:00:00Z",
    }));
    const list = vi
      .spyOn(repository, "list")
      .mockImplementation(async () => structuredClone(rows));
    let changed!: () => void;
    vi.spyOn(repository, "subscribe").mockImplementation((onChange) => {
      changed = onChange;
      return () => undefined;
    });
    let finish!: (body: string) => void;
    let signal: AbortSignal | undefined;
    const readBody = vi
      .spyOn(repository, "readBody")
      .mockImplementation((_request, options?: ConnectRequestOptions) => {
        signal = options?.signal;
        return new Promise((resolve) => {
          finish = resolve;
        });
      });
    render(<PickleApp repository={repository} onDisconnect={vi.fn()} />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Approve production deployment/,
      }),
    );
    await act(async () => {
      changed();
    });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(readBody).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(false);
    await act(async () => {
      finish("Stable context");
    });
    expect(screen.getByText("Stable context")).toBeVisible();
    rows.find((request) => request.id === "req-deploy")!.modifiedAt =
      "2026-09-07T00:01:00Z";
    await act(async () => {
      changed();
    });
    await waitFor(() => expect(readBody).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.queryByText("Stable context")).not.toBeInTheDocument();
    await act(async () => {
      finish("Updated context");
    });
    expect(screen.getByText("Updated context")).toBeVisible();
  });

  it("keeps failed context explicit and retries without reloading the inbox", async () => {
    const repository = new FixturePickleRepository();
    const rows = (await repository.list()).map((request) => ({
      ...request,
      body: "",
    }));
    const list = vi.spyOn(repository, "list").mockResolvedValue(rows);
    vi.spyOn(repository, "readBody")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue("Recovered context");
    render(<PickleApp repository={repository} onDisconnect={vi.fn()} />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Approve production deployment/,
      }),
    );
    expect(
      await screen.findByText(/Could not load request context/),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry context" }));
    expect(await screen.findByText("Recovered context")).toBeVisible();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("loads pending requests and records a typed approval response", async () => {
    const repository = new FixturePickleRepository();
    render(<PickleApp repository={repository} onDisconnect={vi.fn()} />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: /Approve production deployment/,
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Approve production deployment" }),
    ).toBeVisible();
    expect(screen.getByText("release-report.pdf")).toBeVisible();

    fireEvent.change(screen.getByLabelText(/Comment/), {
      target: { value: "Ship it after the status page update." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(
      (await screen.findAllByText("Response recorded")).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("Ship it after the status page update."),
    ).toBeVisible();
    expect(screen.getByText("approve")).toBeVisible();
  });

  it("loads image and Markdown attachments into inline previews", async () => {
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:fixture-image");
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    render(
      <PickleApp
        repository={new FixturePickleRepository()}
        onDisconnect={vi.fn()}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: /Approve production deployment/,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /deployment-map\.svg/ }),
    );
    expect(
      await screen.findByRole("img", { name: "deployment-map.svg" }),
    ).toHaveAttribute("src", "blob:fixture-image");

    fireEvent.click(screen.getByRole("button", { name: /release-notes\.md/ }));
    expect(
      await screen.findByRole("heading", { name: "Release notes" }),
    ).toBeVisible();
    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(createObjectUrl).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Back to requests" }));
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:fixture-image");
  });

  it("only resumes the exact pending response after explicit confirmation", async () => {
    const repository = new FixturePickleRepository();
    const pending = [
      {
        requestId: "pending-response-one",
        operation: "create" as const,
        fingerprint: "fingerprint-one",
        status: "outcome_unknown" as const,
        createdAt: "2026-08-04T00:00:00.000Z",
        recover: vi.fn(),
      },
      {
        requestId: "pending-response-two",
        operation: "create" as const,
        fingerprint: "fingerprint-two",
        status: "outcome_unknown" as const,
        createdAt: "2026-08-05T00:00:00.000Z",
        recover: vi.fn(),
      },
    ];
    vi.spyOn(repository, "pendingResponses").mockImplementation(() => pending);
    const finishRecovery = new Map<
      string,
      (value: PickleResponseSubmission) => void
    >();
    const recovery = vi
      .spyOn(repository, "recoverResponse")
      .mockImplementation(
        (requestId: string) =>
          new Promise<PickleResponseSubmission>((resolve) =>
            finishRecovery.set(requestId, resolve),
          ),
      );

    render(<PickleApp repository={repository} onDisconnect={vi.fn()} />);

    expect(
      await screen.findByText("Response awaiting confirmation"),
    ).toBeVisible();
    expect(recovery).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Resume response" }));

    expect(recovery).toHaveBeenCalledWith("pending-response-one", {
      signal: expect.any(AbortSignal),
      timeoutMs: 20_000,
    });

    await act(async () => {
      pending.shift();
      finishRecovery.get("pending-response-one")?.({
        kind: "recorded",
        record: { path: "responses/one.md", frontmatter: {} },
      } as PickleResponseSubmission);
    });

    expect(screen.getByText("Response awaiting confirmation")).toBeVisible();
    expect(recovery).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Resume response" }));
    expect(recovery).toHaveBeenLastCalledWith("pending-response-two", {
      signal: expect.any(AbortSignal),
      timeoutMs: 20_000,
    });
    await act(async () => {
      pending.shift();
      finishRecovery.get("pending-response-two")?.({
        kind: "recorded",
        record: { path: "responses/two.md", frontmatter: {} },
      } as PickleResponseSubmission);
    });

    await waitFor(() =>
      expect(screen.queryByText("Response awaiting confirmation")).toBeNull(),
    );
    expect(screen.getByText("Response recorded")).toBeVisible();
  });

  it("cancels foreground collection work when the native app backgrounds", async () => {
    const callbacks = new Map<string, (value: unknown) => void>();
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    vi.spyOn(pickleNotifications, "start").mockResolvedValue(undefined);
    nativeApp.addListener.mockImplementation(
      (eventName: string, callback: (value: unknown) => void) => {
        callbacks.set(eventName, callback);
        return Promise.resolve({ remove: vi.fn() });
      },
    );
    const repository = new FixturePickleRepository();
    let loadSignal: AbortSignal | undefined;
    vi.spyOn(repository, "list").mockImplementation(
      (options: ConnectRequestOptions = {}) =>
        new Promise((_, reject) => {
          loadSignal = options.signal;
          options.signal?.addEventListener(
            "abort",
            () => reject(options.signal?.reason),
            { once: true },
          );
        }),
    );

    render(<PickleApp repository={repository} onDisconnect={vi.fn()} />);
    await waitFor(() => expect(loadSignal).toBeDefined());

    act(() => callbacks.get("appStateChange")?.({ isActive: false }));

    expect(loadSignal?.aborted).toBe(true);
  });

  it("ignores a recovery completion after foreground work is cancelled", async () => {
    const callbacks = new Map<string, (value: unknown) => void>();
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    vi.spyOn(pickleNotifications, "start").mockResolvedValue(undefined);
    nativeApp.addListener.mockImplementation(
      (eventName: string, callback: (value: unknown) => void) => {
        callbacks.set(eventName, callback);
        return Promise.resolve({ remove: vi.fn() });
      },
    );
    const repository = new FixturePickleRepository();
    const pending = {
      requestId: "cancelled-recovery",
      operation: "create" as const,
      fingerprint: "cancelled",
      status: "outcome_unknown" as const,
      createdAt: "2026-08-04T00:00:00.000Z",
      recover: vi.fn(),
    };
    vi.spyOn(repository, "pendingResponses").mockReturnValue([pending]);
    let finishRecovery!: (value: PickleResponseSubmission) => void;
    vi.spyOn(repository, "recoverResponse").mockReturnValue(
      new Promise((resolve) => {
        finishRecovery = resolve;
      }),
    );
    render(<PickleApp repository={repository} onDisconnect={vi.fn()} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Resume response" }),
    );

    act(() => callbacks.get("appStateChange")?.({ isActive: false }));
    await act(async () =>
      finishRecovery({
        kind: "recorded",
        record: { path: "responses/stale.md", frontmatter: {} },
      } as PickleResponseSubmission),
    );

    expect(screen.getByText("Response awaiting confirmation")).toBeVisible();
    expect(screen.queryByText("Response recorded")).toBeNull();
  });

  it("renders a collection-defined choice form and validates required fields", async () => {
    render(
      <PickleApp
        repository={new FixturePickleRepository()}
        onDisconnect={vi.fn()}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: /Choose the default update channel/,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Send response" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Release channel is required.",
    );

    fireEvent.change(screen.getByLabelText("Release channel *"), {
      target: { value: "preview" },
    });
    fireEvent.click(screen.getByLabelText("Notify the team"));
    fireEvent.click(screen.getByRole("button", { name: "Send response" }));

    await waitFor(() => expect(screen.getByText("preview")).toBeVisible());
    expect(screen.getByText("true")).toBeVisible();
  });

  it("separates history, search, conflicts, and appearance settings", async () => {
    render(
      <PickleApp
        repository={new FixturePickleRepository()}
        onDisconnect={vi.fn()}
      />,
    );
    await screen.findByText("Approve production deployment");
    expect(
      screen.getByRole("button", { name: "Inbox, 4 unresolved" }),
    ).toBeVisible();
    expect(screen.getByText("Needs attention")).toBeVisible();
    expect(screen.getByText("Ready to answer")).toBeVisible();
    expect(screen.getByLabelText("Sort requests")).toHaveValue("urgency");

    fireEvent.change(screen.getByLabelText("Sort requests"), {
      target: { value: "oldest" },
    });
    const readyGroup = screen
      .getByRole("heading", { name: "Ready to answer" })
      .closest("section");
    expect(readyGroup).not.toBeNull();
    expect(within(readyGroup!).getAllByRole("button")[0]).toHaveTextContent(
      "Replace the empty inbox copy",
    );
    expect(screen.getByText("Oldest first")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Filter requests" }));
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "conflict" },
    });
    expect(screen.getByText("Conflicting environment choice")).toBeVisible();
    expect(screen.queryByText("Approve production deployment")).toBeNull();

    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "all" },
    });
    fireEvent.change(screen.getByLabelText("Priority"), {
      target: { value: "urgent" },
    });
    expect(screen.getByText("Approve production deployment")).toBeVisible();
    expect(screen.queryByText("Replace the empty inbox copy")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    fireEvent.change(
      screen.getByPlaceholderText("Search title, source, or tag"),
      {
        target: { value: "interface" },
      },
    );
    expect(screen.getByText("Replace the empty inbox copy")).toBeVisible();
    expect(screen.queryByText("Approve production deployment")).toBeNull();

    fireEvent.change(
      screen.getByPlaceholderText("Search title, source, or tag"),
      {
        target: { value: "" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /Conflicting environment choice/,
      }),
    );
    expect(screen.getByText("Conflicting responses")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByLabelText("Sort requests")).toHaveValue("newest");
    expect(
      await screen.findByText("Documentation review complete"),
    ).toBeVisible();
    expect(screen.queryByText("Conflicting environment choice")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Filter requests" }));
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "cancelled" },
    });
    expect(
      screen.getByRole("heading", {
        name: "No requests match these filters",
      }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(
      screen.getByText(/Pickle 0.3.0/).closest("footer"),
    ).toHaveTextContent("Records stay in your mdbase collection.");
  });

  it("returns from request detail before minimizing the native app", async () => {
    const callbacks = new Map<string, (value: unknown) => void>();
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    vi.spyOn(pickleNotifications, "start").mockResolvedValue(undefined);
    nativeApp.addListener.mockImplementation(
      (eventName: string, callback: (value: unknown) => void) => {
        callbacks.set(eventName, callback);
        return Promise.resolve({ remove: vi.fn() });
      },
    );
    nativeApp.minimizeApp.mockResolvedValue(undefined);

    render(
      <PickleApp
        repository={new FixturePickleRepository()}
        onDisconnect={vi.fn()}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Approve production deployment/,
      }),
    );

    act(() => callbacks.get("backButton")?.({ canGoBack: false }));

    expect(
      screen.queryByRole("heading", { name: "Approve production deployment" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /Approve production deployment/ }),
    ).toBeVisible();
    expect(nativeApp.minimizeApp).not.toHaveBeenCalled();
    expect(
      nativeApp.addListener.mock.calls.filter(
        ([eventName]) => eventName === "backButton",
      ),
    ).toHaveLength(1);
  });

  it("opens request detail at the top and restores list scroll on browser back", async () => {
    history.replaceState(null, "", "/");
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 412,
    });
    const scrollSpy = vi.spyOn(window, "scrollTo");
    render(
      <PickleApp
        repository={new FixturePickleRepository()}
        onDisconnect={vi.fn()}
      />,
    );
    scrollSpy.mockClear();

    fireEvent.click(
      await screen.findByRole("button", {
        name: /Approve production deployment/,
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Approve production deployment" }),
    ).toBeVisible();
    const marker = history.state as { pickle_request?: string };
    expect(typeof marker.pickle_request).toBe("string");
    expect(scrollSpy).toHaveBeenCalledWith({ top: 0 });

    await act(async () => {
      history.back();
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", {
          name: "Approve production deployment",
        }),
      ).toBeNull(),
    );

    expect(
      screen.getByRole("button", { name: /Approve production deployment/ }),
    ).toBeVisible();
    expect(scrollSpy).toHaveBeenCalledWith({ top: 412 });
    scrollSpy.mockRestore();
    delete (window as { scrollY?: unknown }).scrollY;
    history.replaceState(null, "", "/");
  });
});
