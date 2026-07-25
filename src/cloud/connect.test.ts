import { describe, expect, it } from "vitest";

import bundledManifest from "../generated/mdbase-app.json";
import { isMdbaseCallback, pickleConnect } from "./connect";

describe("Pickle mdbase connection", () => {
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

  it("passes the generated declaration inline instead of loading a native asset URL", () => {
    expect(Reflect.get(pickleConnect, "manifest")).toEqual(bundledManifest);
    expect(typeof Reflect.get(pickleConnect, "manifest")).toBe("object");
  });
});
