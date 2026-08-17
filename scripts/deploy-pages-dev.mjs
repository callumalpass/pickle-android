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

export const candidateBDevelopmentDeployment = Object.freeze({
  ...developmentDeployment,
  appOrigin: "https://candidate-b.pickle-9zb.pages.dev",
  connectOrigin: "https://mdbase-connect-candidate-b.onrender.com",
  branch: "candidate-b",
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

export function developmentDeploymentFor(environment) {
  const requested = environment.MDBASE_CANDIDATE_B_CONNECT_URL;
  if (requested === undefined || requested === "") return developmentDeployment;
  if (requested !== candidateBDevelopmentDeployment.connectOrigin) {
    throw new Error(
      `Candidate B Pickle requires ${candidateBDevelopmentDeployment.connectOrigin}.`,
    );
  }
  return candidateBDevelopmentDeployment;
}

export function developmentDeploymentEnvironment(
  environment,
  deployment = developmentDeploymentFor(environment),
) {
  return {
    ...environment,
    VITE_BASE_PATH: "/",
    PICKLE_APP_URL: deployment.appOrigin,
    PICKLE_WEB_ONLY: "1",
    PICKLE_FIREBASE_PROJECT_ID: "",
    VITE_MDBASE_CONNECT_URL: deployment.connectOrigin,
    VITE_MDBASE_CONNECT_LOOPBACK_URL: deployment.loopbackOrigin,
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
  const deployment = developmentDeploymentFor(environment);
  const deploymentEnvironment = developmentDeploymentEnvironment(
    environment,
    deployment,
  );
  const previousManifests = await Promise.all(
    manifestTargets.map((target) => readFile(target)),
  );

  try {
    await dependencies.run(pnpm, ["build"], deploymentEnvironment);
    await dependencies.prepareRoutes();
    await dependencies.verifyBuild(deployment);
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
      `wrangler@${deployment.wranglerVersion}`,
      "pages",
      "deploy",
      "dist",
      `--project-name=${deployment.project}`,
      `--branch=${deployment.branch}`,
      "--commit-dirty=true",
    ],
    deploymentEnvironment,
  );
  await dependencies.verifyDeployment(deployment);

  console.log(`Development Pickle deployed: ${deployment.appOrigin}/`);
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

async function verifyDevelopmentBuild(deployment = developmentDeployment) {
  const manifest = JSON.parse(
    await readFile(
      resolve(projectRoot, "dist", ".well-known", "mdbase-app.json"),
      "utf8",
    ),
  );
  verifyManifest(manifest, deployment);

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
    deployment.connectOrigin,
    deployment.loopbackOrigin,
  ]) {
    if (!sources.some((source) => source.includes(expected))) {
      throw new Error(`Pickle deployment bundle does not contain ${expected}.`);
    }
  }
}

async function verifyLiveDeployment(deployment = developmentDeployment) {
  let lastError;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const manifestResponse = await fetch(
        `${deployment.appOrigin}/.well-known/mdbase-app.json?attempt=${attempt}`,
        { cache: "no-store" },
      );
      if (!manifestResponse.ok) {
        throw new Error(`manifest returned HTTP ${manifestResponse.status}`);
      }
      verifyManifest(await manifestResponse.json(), deployment);

      const callbackResponse = await fetch(
        `${deployment.appOrigin}/auth/mdbase/callback`,
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

export function verifyManifest(manifest, deployment = developmentDeployment) {
  const callback = `${deployment.appOrigin}/auth/mdbase/callback`;
  if (
    manifest.homepage !== `${deployment.appOrigin}/` ||
    manifest.icon !== `${deployment.appOrigin}/icon.svg` ||
    manifest.redirect_uris?.length !== 1 ||
    manifest.redirect_uris[0] !== callback
  ) {
    throw new Error(
      `Pickle deployment manifest does not declare ${deployment.appOrigin}.`,
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
