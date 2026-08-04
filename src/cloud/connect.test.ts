import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import bundledManifest from "../generated/mdbase-app.json";
import {
  isNativeMdbaseCallback,
  pickleConnect,
  pickleSession,
} from "./connect";

describe("Pickle mdbase connection", () => {
  beforeAll(async () => {
    await pickleSession.start();
  });

  afterAll(() => pickleSession.destroy());

  afterEach(() => {
    history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });
  it("accepts the native authorization callback route", () => {
    expect(
      isNativeMdbaseCallback(
        "com.callumalpass.pickle://auth/mdbase/callback?error=denied",
      ),
    ).toBe(true);
  });

  it("ignores ordinary application locations", () => {
    expect(isNativeMdbaseCallback("https://pickle.example/")).toBe(false);
  });

  it("clears a stale bookmarked collection without dropping app state", () => {
    history.replaceState(
      { preserved: true },
      "",
      "/?collection=old-collection&view=inbox#request",
    );

    pickleSession.clearSelection({ history: "replace" });

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

  it("pins type-pack resources to their exact embedded documents", async () => {
    for (const pack of bundledManifest.provisions.type_packs) {
      const documents = new Map(
        pack.resources.map((resource) => [resource.source, resource.document]),
      );
      for (const resource of pack.manifest.resources) {
        const document = documents.get(resource.source);
        expect(document).toBeDefined();
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(document),
        );
        expect(resource.digest).toBe(
          `sha256:${Array.from(new Uint8Array(digest), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join("")}`,
        );
      }
    }
  });

  it("filters record events through the canonical CloudEvent data field", () => {
    expect(bundledManifest.notifications.criteria[0]?.if).toEqual({
      $expr: 'event.data.types != null && "pickle_request" in event.data.types',
    });
  });
});
