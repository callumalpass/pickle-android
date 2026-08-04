import { Capacitor } from "@capacitor/core";
import { connectSuccess } from "@mdbase-dev/connect";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
import { pickleSession } from "./cloud/connect";

describe("Pickle connection", () => {
  afterEach(() => {
    localStorage.clear();
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

  it("starts choose authorization instead of targeting a stale bookmark", () => {
    history.replaceState(null, "", "/?collection=old-collection");
    const authorize = vi
      .spyOn(pickleSession, "authorize")
      .mockReturnValue(new Promise<never>(() => undefined));
    render(<App repository={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to mdbase" }));

    expect(authorize).toHaveBeenCalledWith("choose", {
      signal: expect.any(AbortSignal),
      timeoutMs: 30_000,
    });
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
    vi.spyOn(pickleSession, "start").mockResolvedValue(
      connectSuccess(pickleSession.getSnapshot()),
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

    await waitFor(() => expect(callback).toHaveBeenCalledOnce());
    expect(callback).toHaveBeenCalledWith(url, {
      signal: expect.any(AbortSignal),
      timeoutMs: 20_000,
    });
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
    vi.spyOn(pickleSession, "authorize").mockReturnValue(
      new Promise<never>(() => undefined),
    );
    render(<App />);
    await waitFor(() =>
      expect(browserCallbacks.has("browserFinished")).toBe(true),
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue to mdbase" }));

    act(() => browserCallbacks.get("browserFinished")?.());

    expect(await screen.findByText("Connection cancelled")).toBeVisible();
    expect(
      screen.getByText("Continue to mdbase when you are ready to try again."),
    ).toBeVisible();
  });
});
