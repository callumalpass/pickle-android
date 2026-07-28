import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./app";
import { pickleSession } from "./cloud/connect";

describe("Pickle connection", () => {
  afterEach(() => {
    localStorage.clear();
    pickleSession.clearSelection({ history: "replace" });
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

  it("starts choose authorization instead of targeting a stale bookmark", () => {
    history.replaceState(null, "", "/?collection=old-collection");
    const authorize = vi
      .spyOn(pickleSession, "authorize")
      .mockReturnValue(new Promise<never>(() => undefined));
    render(<App repository={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to mdbase" }));

    expect(authorize).toHaveBeenCalledWith("choose");
  });
});
