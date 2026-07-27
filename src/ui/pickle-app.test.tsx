import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FixturePickleRepository } from "../dev/fixture";
import { PickleApp } from "./pickle-app";

describe("Pickle inbox", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    localStorage.clear();
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
    expect(
      await screen.findByText("Documentation review complete"),
    ).toBeVisible();
    expect(screen.queryByText("Conflicting environment choice")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(
      screen.getByText(/Pickle 0.3.0/).closest("footer"),
    ).toHaveTextContent("Records stay in your mdbase collection.");
  });
});
