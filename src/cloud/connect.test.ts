import { afterEach, describe, expect, it, vi } from "vitest";

import bundledManifest from "../generated/mdbase-app.json";
import {
  clearPickleSelection,
  isMdbaseCallback,
  pickleConnect,
} from "./connect";

describe("Pickle mdbase connection", () => {
  afterEach(() => {
    history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });
  it("accepts browser and native authorization callbacks", () => {
    expect(
      isMdbaseCallback("https://pickle.example/auth/mdbase/callback?code=one"),
    ).toBe(true);
    expect(
      isMdbaseCallback(
        "com.callumalpass.pickle://auth/mdbase/callback?error=denied",
      ),
    ).toBe(true);
  });

  it("ignores ordinary application locations", () => {
    expect(isMdbaseCallback("https://pickle.example/")).toBe(false);
  });

  it("clears a stale bookmarked collection without dropping app state", () => {
    history.replaceState(
      { preserved: true },
      "",
      "/?collection=old-collection&view=inbox#request",
    );

    clearPickleSelection();

    expect(location.pathname).toBe("/");
    expect(location.search).toBe("?view=inbox");
    expect(location.hash).toBe("#request");
    expect(history.state).toEqual({ preserved: true });
  });

  it("registers the generated declaration inline", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          application: {
            id: "00000000-0000-0000-0000-000000000001",
            name: "Pickle",
            homepage: "https://pickle.example/",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    await pickleConnect.register();

    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
      manifest: bundledManifest,
    });
  });
});
