import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { format } from "prettier";

import {
  PICKLE_NOTIFICATION_CRITERION,
  PICKLE_NOTIFICATION_EVENT,
  PICKLE_REQUEST_CONTRACT,
  PICKLE_REQUEST_CONTRACT_DIGEST,
  PICKLE_REQUEST_CONTRACT_VERSION,
  PICKLE_TYPE_PACK_PROVISION,
} from "@mdbase-dev/pickle";

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
const pickleTypePack = structuredClone(PICKLE_TYPE_PACK_PROVISION);
const typePackDocuments = new Map(
  pickleTypePack.resources.map((resource) => [
    resource.source,
    resource.document,
  ]),
);
for (const resource of pickleTypePack.manifest.resources) {
  const document = typePackDocuments.get(resource.source);
  if (document === undefined) {
    throw new Error(`Missing embedded type-pack resource: ${resource.source}`);
  }
  resource.digest = `sha256:${createHash("sha256")
    .update(document, "utf8")
    .digest("hex")}`;
}

const manifest = {
  manifest_version: 1,
  id: "com.callumalpass.pickle",
  name: "Pickle",
  homepage: `${appUrl}/`,
  icon: `${appUrl}/icon.svg`,
  redirect_uris: [
    `${appUrl}/auth/mdbase/callback`,
    ...(!webOnly ? ["com.callumalpass.pickle://auth/mdbase/callback"] : []),
  ],
  requirements: {
    contracts: [
      {
        id: PICKLE_REQUEST_CONTRACT,
        version: PICKLE_REQUEST_CONTRACT_VERSION,
        digest: PICKLE_REQUEST_CONTRACT_DIGEST,
      },
    ],
    capabilities: {
      contract_version: 1,
      required: [
        "collection.inspect",
        "records.watch",
        "records.read",
        "records.query",
        "records.create",
        "definitions.type-pack.apply",
      ],
      optional: ["notifications.background-delivery"],
    },
    access: "full_collection",
  },
  provisions: {
    type_packs: [pickleTypePack],
  },
  notifications: {
    criteria: [
      {
        id: PICKLE_NOTIFICATION_CRITERION,
        event: PICKLE_NOTIFICATION_EVENT,
        if: {
          $expr:
            'event.data.types != null && "pickle_request" in event.data.types',
        },
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

const serialized = await format(JSON.stringify(manifest), { parser: "json" });
await Promise.all(
  targets.map(async (target) => {
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, serialized);
  }),
);
