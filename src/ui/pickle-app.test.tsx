import { Capacitor } from "@capacitor/core";
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
});
