import type { ConnectRequestOptions, JsonObject } from "@mdbase-dev/connect";
import type {
  PickleAttachment,
  PicklePendingResponse,
  PickleRequest,
  PickleResponse,
  PickleResponseSubmission,
} from "@mdbase-dev/pickle";
import type { CollectionTypeDescriptor } from "@mdbase-dev/connect-protocol";

import type {
  PickleAttachmentContent,
  PickleRepository,
} from "../domain/repository";

const approvalType: CollectionTypeDescriptor = {
  name: "pickle_response_approval",
  description: "Approve, reject, or request revision.",
  schema: {
    dialect: "json-schema-2020-12",
    value: {
      type: "object",
      required: ["request", "decision"],
      properties: {
        request: { type: "string" },
        decision: {
          enum: ["approve", "reject", "revise"],
          title: "Decision",
        },
        comment: {
          type: "string",
          title: "Comment",
          description: "Optional context for the agent.",
        },
      },
    },
  },
  collection: { path: { folder: "responses" } },
  extensions: {},
};

const choiceType: CollectionTypeDescriptor = {
  name: "release_channel_choice",
  description: "Choose a release channel.",
  schema: {
    value: {
      type: "object",
      required: ["request", "channel"],
      properties: {
        request: { type: "string" },
        channel: {
          enum: ["stable", "preview", "nightly"],
          title: "Release channel",
        },
        notify_team: { type: "boolean", title: "Notify the team" },
        note: { type: "string", title: "Note" },
      },
    },
  },
  collection: { path: { folder: "responses" } },
  extensions: {},
};

const inputType: CollectionTypeDescriptor = {
  name: "copy_response",
  description: "Provide final copy.",
  schema: {
    value: {
      type: "object",
      required: ["request", "copy"],
      properties: {
        request: { type: "string" },
        copy: {
          type: "string",
          title: "Replacement copy",
          description: "This text will be used verbatim.",
        },
      },
    },
  },
  collection: { path: { folder: "responses" } },
  extensions: {},
};

const samples: PickleRequest[] = [
  request({
    id: "req-deploy",
    title: "Approve production deployment",
    source: "release-agent",
    message: "Deploy mdbase connect v0.3.0 to production?",
    body: "The release candidate passed the workspace test suite.\n\n- 143 tests passed\n- No schema migrations\n- Rollback image is retained",
    priority: "urgent",
    createdAt: "2026-07-24T07:42:00Z",
    dueAt: "2026-07-24T09:00:00Z",
    tags: ["release", "production"],
    links: [
      { label: "Release notes", url: "https://example.com/releases/0.3.0" },
    ],
    attachments: [
      {
        path: "attachments/req-deploy/1-release-report.pdf",
        filename: "release-report.pdf",
      },
      {
        path: "attachments/req-deploy/2-deployment-map.svg",
        filename: "deployment-map.svg",
      },
      {
        path: "attachments/req-deploy/3-release-notes.md",
        filename: "release-notes.md",
      },
    ],
    responseType: approvalType.name,
    responseTypeDefinition: approvalType,
  }),
  request({
    id: "req-channel",
    title: "Choose the default update channel",
    source: "product-planning",
    message: "Which channel should new installations follow?",
    body: "Stable receives tested releases. Preview receives release candidates about one week earlier.",
    kind: "choice",
    createdAt: "2026-07-24T06:18:00Z",
    tags: ["product"],
    responseType: choiceType.name,
    responseTypeDefinition: choiceType,
  }),
  request({
    id: "req-copy",
    title: "Replace the empty inbox copy",
    source: "interface-agent",
    message: "Provide the sentence shown when every request is answered.",
    body: "Keep it brief and literal. Avoid congratulatory language.",
    kind: "input",
    priority: "low",
    createdAt: "2026-07-23T22:11:00Z",
    responseType: inputType.name,
    responseTypeDefinition: inputType,
  }),
  request({
    id: "req-docs",
    title: "Documentation review complete",
    source: "docs-agent",
    message: "The connector security review has been recorded.",
    body: "No action remains. This entry is retained in history.",
    kind: "notice",
    state: "answered",
    createdAt: "2026-07-23T05:30:00Z",
    responseType: approvalType.name,
    responseTypeDefinition: approvalType,
    response: response("approve", "Reviewed by Callum."),
  }),
  request({
    id: "req-conflict",
    title: "Conflicting environment choice",
    source: "migration-agent",
    message: "Two responses exist for this request.",
    state: "conflict",
    responseCount: 2,
    createdAt: "2026-07-22T10:05:00Z",
    responseType: approvalType.name,
    responseTypeDefinition: approvalType,
  }),
];

export class FixturePickleRepository implements PickleRepository {
  readonly collectionId = "demo-pickle-collection";
  readonly authority = "fixture" as const;
  private requests = structuredClone(samples);
  private listeners = new Set<() => void>();

  async list(): Promise<PickleRequest[]> {
    return structuredClone(this.requests);
  }

  async readAttachment(
    attachment: PickleAttachment,
  ): Promise<PickleAttachmentContent | null> {
    const fixture = attachmentFixtures[attachment.path];
    if (!fixture) return null;
    const blob = fixture();
    return {
      blob,
      path: attachment.path,
      filename: attachment.filename,
      size: blob.size,
      mediaType: blob.type,
    };
  }

  async respond(
    requestToAnswer: PickleRequest,
    payload: JsonObject,
    options: ConnectRequestOptions = {},
  ): Promise<PickleResponseSubmission> {
    await fixtureDelay(options.signal);
    const responsePath = `responses/${requestToAnswer.id}.md`;
    this.requests = this.requests.map((item) =>
      item.id === requestToAnswer.id
        ? {
            ...item,
            state: "answered",
            responseCount: 1,
            response: {
              path: responsePath,
              type: item.responseType,
              responder: "human",
              respondedAt: new Date().toISOString(),
              payload,
              frontmatter: payload,
            },
          }
        : item,
    );
    this.listeners.forEach((listener) => listener());
    return {
      kind: "recorded",
      record: {
        path: responsePath,
        frontmatter: { ...payload, type: requestToAnswer.responseType },
      },
    } as PickleResponseSubmission;
  }

  pendingResponse(): PicklePendingResponse | null {
    return null;
  }

  async recoverResponse(): Promise<PickleResponseSubmission> {
    throw new Error("The fixture has no pending response.");
  }

  subscribe(onChange: () => void): () => void {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  }
}

function fixtureDelay(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, 180);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function request(
  value: Partial<PickleRequest> &
    Pick<PickleRequest, "id" | "title" | "source" | "message" | "responseType">,
): PickleRequest {
  return {
    path: `requests/${value.id}.md`,
    body: "",
    kind: "approval",
    priority: "normal",
    state: "pending",
    responseCount: 0,
    tags: [],
    links: [],
    attachments: [],
    metadata: {},
    frontmatter: {},
    ...value,
  };
}

function response(decision: string, comment: string): PickleResponse {
  const payload = { decision, comment };
  return {
    path: "responses/demo.md",
    type: approvalType.name,
    responder: "human",
    respondedAt: "2026-07-23T05:42:00Z",
    payload,
    frontmatter: payload,
  };
}

const attachmentFixtures: Record<string, () => Blob> = {
  "attachments/req-deploy/1-release-report.pdf": () => demoPdf(),
  "attachments/req-deploy/2-deployment-map.svg": () =>
    new Blob(
      [
        `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
          <rect width="960" height="540" fill="#f3f6f8"/>
          <path d="M120 270h180l70-110h220l70 110h180" fill="none" stroke="#356f96" stroke-width="10"/>
          <g fill="#fff" stroke="#20242c" stroke-width="4">
            <rect x="70" y="220" width="180" height="100" rx="12"/>
            <rect x="390" y="110" width="180" height="100" rx="12"/>
            <rect x="710" y="220" width="180" height="100" rx="12"/>
          </g>
          <g fill="#20242c" font-family="system-ui,sans-serif" font-size="26" text-anchor="middle">
            <text x="160" y="280">Build</text><text x="480" y="170">Verify</text><text x="800" y="280">Deploy</text>
          </g>
        </svg>`,
      ],
      { type: "image/svg+xml" },
    ),
  "attachments/req-deploy/3-release-notes.md": () =>
    new Blob(
      [
        `# Release notes

The candidate is ready for **production review**.

- [x] Contract tests passed
- [x] Rollback image retained
- [ ] Deployment approved

| Check | Result |
| --- | --- |
| Unit suite | 143 passed |
| Schema changes | None |

> Roll back if the health check fails twice.

Run \`deploy --channel stable\` after approval.`,
      ],
      { type: "text/markdown" },
    ),
};

function demoPdf(): Blob {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    "<< /Length 98 >>\nstream\nBT /F1 22 Tf 72 710 Td (Release report) Tj 0 -34 Td /F1 12 Tf (143 checks passed. No schema migrations.) Tj ET\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let document = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(new TextEncoder().encode(document).byteLength);
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = new TextEncoder().encode(document).byteLength;
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  document += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([document], { type: "application/pdf" });
}
