import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./app";

describe("Pickle connection", () => {
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
});
