import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  PICKLE_NOTIFICATION_CRITERION,
  PICKLE_PROVISION_TYPES,
  PICKLE_REQUEST_CONTRACT,
} from "@mdbase/pickle";

const development = process.argv.includes("--development");
const webOnly = process.env.PICKLE_WEB_ONLY === "1";
const appUrl = (
  process.env.PICKLE_APP_URL ??
  (development ? "http://127.0.0.1:4198" : "https://pickle.mdbase.dev")
).replace(/\/$/, "");
const targets = [
  resolve(
    import.meta.dirname,
    "..",
    "public",
    ".well-known",
    "mdbase-app.json",
  ),
  resolve(import.meta.dirname, "..", "src", "generated", "mdbase-app.json"),
];

const manifest = {
  manifest_version: 3,
  id: "com.callumalpass.pickle",
  name: "Pickle",
  homepage: `${appUrl}/`,
  icon: `${appUrl}/icon.svg`,
  redirect_uris: [
    `${appUrl}/auth/mdbase/callback`,
    ...(!webOnly ? ["com.callumalpass.pickle://auth/mdbase/callback"] : []),
  ],
  requirements: {
    contracts: [{ id: PICKLE_REQUEST_CONTRACT, version: 1 }],
    access: "full_collection",
  },
  provisions: {
    types: PICKLE_PROVISION_TYPES,
  },
  notifications: {
    criteria: [
      {
        id: PICKLE_NOTIFICATION_CRITERION,
        event: { id: "mdbase.record.created", version: 1 },
        if: { $expr: '"pickle_request" in event.payload.types' },
        debounce: "2s",
        presentation: {
          title: "New Pickle request",
          body: "Open Pickle to review the latest request.",
          tag: "pickle-requests",
        },
      },
    ],
    native_delivery: {
      mode: "managed_fcm",
      firebase_project_id:
        process.env.PICKLE_FIREBASE_PROJECT_ID ?? "tasknotes-462906",
    },
  },
};

const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
await Promise.all(
  targets.map(async (target) => {
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, serialized);
  }),
);
