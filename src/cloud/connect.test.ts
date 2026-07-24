import { describe, expect, it } from "vitest";

import { isMdbaseCallback } from "./connect";

describe("mdbase callback routing", () => {
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
});
