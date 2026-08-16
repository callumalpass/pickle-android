import { describe, expect, it, vi } from "vitest";

import {
  deployDevelopmentPickle,
  developmentDeployment,
  developmentDeploymentEnvironment,
  verifyManifest,
} from "./deploy-pages-dev.mjs";

describe("Pickle development deployment", () => {
  it("builds the staging Pages origin against staging Connect and its daemon", () => {
    const environment = developmentDeploymentEnvironment({ EXISTING: "kept" });

    expect(environment).toMatchObject({
      EXISTING: "kept",
      VITE_BASE_PATH: "/",
      PICKLE_APP_URL: "https://staging.pickle-9zb.pages.dev",
      PICKLE_WEB_ONLY: "1",
      PICKLE_FIREBASE_PROJECT_ID: "",
      VITE_MDBASE_CONNECT_URL: "https://connect-staging.mdbase.dev",
      VITE_MDBASE_CONNECT_LOOPBACK_URL: "http://127.0.0.1:28486",
    });
  });

  it("rejects production native notification delivery in staging", () => {
    const manifest = {
      homepage: `${developmentDeployment.appOrigin}/`,
      icon: `${developmentDeployment.appOrigin}/icon.svg`,
      redirect_uris: [
        `${developmentDeployment.appOrigin}/auth/mdbase/callback`,
      ],
      notifications: {
        native_delivery: {
          mode: "managed_fcm",
          firebase_project_id: "tasknotes-462906",
        },
      },
    };

    expect(() => verifyManifest(manifest)).toThrow(
      "Pickle staging must not declare native notification delivery.",
    );
    delete manifest.notifications.native_delivery;
    expect(() => verifyManifest(manifest)).not.toThrow();
  });

  it("deploys only the staging branch and verifies the stable alias", async () => {
    const run = vi.fn(async () => undefined);
    const prepareRoutes = vi.fn(async () => undefined);
    const verifyBuild = vi.fn(async () => undefined);
    const verifyDeployment = vi.fn(async () => undefined);

    await deployDevelopmentPickle(
      {},
      { run, prepareRoutes, verifyBuild, verifyDeployment },
    );

    expect(prepareRoutes).toHaveBeenCalledOnce();
    expect(verifyBuild).toHaveBeenCalledOnce();
    expect(verifyDeployment).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0][1]).toEqual(["build"]);
    expect(run.mock.calls[1][1]).toEqual(
      expect.arrayContaining([
        `wrangler@${developmentDeployment.wranglerVersion}`,
        "pages",
        "deploy",
        "dist",
        "--project-name=pickle",
        "--branch=staging",
      ]),
    );
  });
});
