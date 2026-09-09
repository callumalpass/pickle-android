import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");
const bundled = JSON.parse(
  await readFile(resolve(root, "src/generated/mdbase-app.json"), "utf8"),
);

for (const development of [false, true]) {
  test(`generates create-only v2 declaration (${development ? "development" : "production"})`, async () => {
    const workspace = await mkdtemp(resolve(tmpdir(), "pickle-manifest-"));
    try {
      await mkdir(resolve(workspace, "scripts"));
      await copyFile(
        resolve(root, "scripts/write-manifest.mjs"),
        resolve(workspace, "scripts/write-manifest.mjs"),
      );
      await symlink(
        resolve(root, "node_modules"),
        resolve(workspace, "node_modules"),
      );
      execFileSync(
        process.execPath,
        [
          resolve(workspace, "scripts/write-manifest.mjs"),
          ...(development ? ["--development"] : []),
        ],
        {
          env: {
            ...process.env,
            PICKLE_APP_URL: development
              ? "http://127.0.0.1:4198"
              : "https://pickle.mdbase.dev",
            PICKLE_WEB_ONLY: "0",
            PICKLE_FIREBASE_PROJECT_ID: "tasknotes-462906",
          },
        },
      );
      const publicJson = await readFile(
        resolve(workspace, "public/.well-known/mdbase-app.json"),
        "utf8",
      );
      assert.equal(
        publicJson,
        await readFile(
          resolve(workspace, "src/generated/mdbase-app.json"),
          "utf8",
        ),
      );
      const manifest = JSON.parse(publicJson);
      assert.equal(manifest.manifest_version, 1);
      assert.deepEqual(manifest.requirements.capabilities, {
        contract_version: 2,
        required: ["collection.read", "records.create"],
      });
      assert.deepEqual(manifest.requirements.files, {
        required: ["list", "read"],
        scope: { kind: "selected_folders", folders: ["attachments"] },
      });
      assert.equal(manifest.requirements.access, "full_collection");
      assert.deepEqual(
        manifest.requirements.contracts,
        bundled.requirements.contracts,
      );
      assert.deepEqual(manifest.provisions, bundled.provisions);
      assert.deepEqual(manifest.notifications, bundled.notifications);
      assert.ok(
        manifest.redirect_uris.includes(
          "com.callumalpass.pickle://auth/mdbase/callback",
        ),
      );
      if (!development)
        assert.equal(
          publicJson,
          await readFile(
            resolve(root, "public/.well-known/mdbase-app.json"),
            "utf8",
          ),
        );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
}
