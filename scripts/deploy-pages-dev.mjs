import { spawn } from "node:child_process";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const developmentDeployment = Object.freeze({
  appOrigin: "https://staging.pickle-9zb.pages.dev",
  connectOrigin: "https://connect-staging.mdbase.dev",
  loopbackOrigin: "http://127.0.0.1:28486",
  project: "pickle",
  branch: "staging",
  wranglerVersion: "4.114.0",
});

const projectRoot = resolve(import.meta.dirname, "..");
const manifestTargets = [
  resolve(projectRoot, "public", ".well-known", "mdbase-app.json"),
  resolve(projectRoot, "src", "generated", "mdbase-app.json"),
];
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await deployDevelopmentPickle(process.env);
}

export function developmentDeploymentEnvironment(environment) {
  return {
    ...environment,
    VITE_BASE_PATH: "/",
    PICKLE_APP_URL: developmentDeployment.appOrigin,
    PICKLE_WEB_ONLY: "1",
    PICKLE_FIREBASE_PROJECT_ID: "",
    VITE_MDBASE_CONNECT_URL: developmentDeployment.connectOrigin,
    VITE_MDBASE_CONNECT_LOOPBACK_URL: developmentDeployment.loopbackOrigin,
  };
}

export async function deployDevelopmentPickle(
  environment,
  dependencies = {
    run: runCommand,
    prepareRoutes: prepareDevelopmentRoutes,
    verifyBuild: verifyDevelopmentBuild,
    verifyDeployment: verifyLiveDeployment,
  },
) {
  const deploymentEnvironment = developmentDeploymentEnvironment(environment);
  const previousManifests = await Promise.all(
    manifestTargets.map((target) => readFile(target)),
  );

  try {
    await dependencies.run(pnpm, ["build"], deploymentEnvironment);
    await dependencies.prepareRoutes();
    await dependencies.verifyBuild();
  } finally {
    await Promise.all(
      manifestTargets.map((target, index) =>
        writeFile(target, previousManifests[index]),
      ),
    );
  }

  await dependencies.run(
    pnpm,
    [
      "dlx",
      `wrangler@${developmentDeployment.wranglerVersion}`,
      "pages",
      "deploy",
      "dist",
      `--project-name=${developmentDeployment.project}`,
      `--branch=${developmentDeployment.branch}`,
      "--commit-dirty=true",
    ],
    deploymentEnvironment,
  );
  await dependencies.verifyDeployment();

  console.log(
    `Development Pickle deployed: ${developmentDeployment.appOrigin}/`,
  );
}

async function prepareDevelopmentRoutes() {
  const index = resolve(projectRoot, "dist", "index.html");
  const callbackDirectory = resolve(
    projectRoot,
    "dist",
    "auth",
    "mdbase",
    "callback",
  );
  await mkdir(callbackDirectory, { recursive: true });
  await Promise.all([
    copyFile(index, resolve(callbackDirectory, "index.html")),
    copyFile(index, resolve(projectRoot, "dist", "404.html")),
  ]);
}

async function verifyDevelopmentBuild() {
  const manifest = JSON.parse(
    await readFile(
      resolve(projectRoot, "dist", ".well-known", "mdbase-app.json"),
      "utf8",
    ),
  );
  verifyManifest(manifest);

  const index = await readFile(resolve(projectRoot, "dist", "index.html"));
  const callback = await readFile(
    resolve(projectRoot, "dist", "auth", "mdbase", "callback", "index.html"),
  );
  const fallback = await readFile(resolve(projectRoot, "dist", "404.html"));
  if (!index.equals(callback) || !index.equals(fallback)) {
    throw new Error(
      "Pickle deployment callback routes do not match index.html.",
    );
  }

  const assetsDirectory = resolve(projectRoot, "dist", "assets");
  const scripts = (await readdir(assetsDirectory))
    .filter((file) => file.endsWith(".js"))
    .map((file) => resolve(assetsDirectory, file));
  const sources = await Promise.all(
    scripts.map((script) => readFile(script, "utf8")),
  );
  for (const expected of [
    developmentDeployment.connectOrigin,
    developmentDeployment.loopbackOrigin,
  ]) {
    if (!sources.some((source) => source.includes(expected))) {
      throw new Error(`Pickle deployment bundle does not contain ${expected}.`);
    }
  }
}

async function verifyLiveDeployment() {
  let lastError;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const manifestResponse = await fetch(
        `${developmentDeployment.appOrigin}/.well-known/mdbase-app.json?attempt=${attempt}`,
        { cache: "no-store" },
      );
      if (!manifestResponse.ok) {
        throw new Error(`manifest returned HTTP ${manifestResponse.status}`);
      }
      verifyManifest(await manifestResponse.json());

      const callbackResponse = await fetch(
        `${developmentDeployment.appOrigin}/auth/mdbase/callback`,
        { cache: "no-store" },
      );
      if (!callbackResponse.ok) {
        throw new Error(`callback returned HTTP ${callbackResponse.status}`);
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 12) await delay(5_000);
    }
  }
  throw new Error(
    `Pickle development deployment verification failed: ${String(lastError)}`,
  );
}

export function verifyManifest(manifest) {
  const callback = `${developmentDeployment.appOrigin}/auth/mdbase/callback`;
  if (
    manifest.homepage !== `${developmentDeployment.appOrigin}/` ||
    manifest.icon !== `${developmentDeployment.appOrigin}/icon.svg` ||
    manifest.redirect_uris?.length !== 1 ||
    manifest.redirect_uris[0] !== callback
  ) {
    throw new Error(
      `Pickle deployment manifest does not declare ${developmentDeployment.appOrigin}.`,
    );
  }
  if (manifest.notifications?.native_delivery !== undefined) {
    throw new Error(
      "Pickle staging must not declare native notification delivery.",
    );
  }
}

async function runCommand(command, arguments_, environment) {
  const child = spawn(command, arguments_, {
    cwd: projectRoot,
    env: environment,
    stdio: "inherit",
  });
  const exitCode = await new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", (code, signal) => {
      if (signal) rejectExit(new Error(`${command} was stopped by ${signal}.`));
      else resolveExit(code);
    });
  });
  if (exitCode !== 0) {
    throw new Error(
      `${command} ${arguments_.join(" ")} exited with code ${exitCode}.`,
    );
  }
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
