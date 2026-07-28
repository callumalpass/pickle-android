import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./app";
import { pickleConnect } from "./cloud/connect";
import { FixturePickleRepository } from "./dev/fixture";

describe("Pickle connection", () => {
  afterEach(() => {
    localStorage.clear();
    history.replaceState(null, "", "/");
    vi.restoreAllMocks();
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

  it("clears the bookmarked collection before opening another one", () => {
    history.replaceState(null, "", "/?collection=old-collection");
    render(<App repository={new FixturePickleRepository()} />);

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Open another collection" }),
    );

    expect(location.search).toBe("");
    expect(
      screen.getByRole("heading", { name: "Open your decision inbox." }),
    ).toBeVisible();
  });

  it("does not pin a stale bookmarked collection when starting authorization", () => {
    history.replaceState(null, "", "/?collection=old-collection");
    const authorize = vi
      .spyOn(pickleConnect, "authorize")
      .mockReturnValue(new Promise<never>(() => undefined));
    render(<App repository={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to mdbase" }));

    expect(authorize).toHaveBeenCalledWith({
      operations: expect.any(Array),
      returnTo: "/?collection=old-collection",
    });
    expect(authorize.mock.calls[0]?.[0]).not.toHaveProperty("collectionId");
  });
});
