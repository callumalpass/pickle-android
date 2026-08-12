import { describe, expect, it, vi } from "vitest";

import {
  deployDevelopmentPickle,
  developmentDeployment,
  developmentDeploymentEnvironment,
} from "./deploy-pages-dev.mjs";

describe("Pickle development deployment", () => {
  it("builds the staging Pages origin against staging Connect and its daemon", () => {
    const environment = developmentDeploymentEnvironment({ EXISTING: "kept" });

    expect(environment).toMatchObject({
      EXISTING: "kept",
      VITE_BASE_PATH: "/",
      PICKLE_APP_URL: "https://staging.pickle-9zb.pages.dev",
      PICKLE_WEB_ONLY: "1",
      VITE_MDBASE_CONNECT_URL: "https://connect-staging.mdbase.dev",
      VITE_MDBASE_CONNECT_LOOPBACK_URL: "http://127.0.0.1:28486",
    });
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
