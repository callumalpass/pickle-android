import type { JsonObject } from "@mdbase-dev/connect";
import type { PickleRequest, PickleResponse } from "@mdbase-dev/pickle";
import type { CollectionTypeDescriptor } from "@mdbase-dev/connect-protocol";

import type { PickleRepository } from "../domain/repository";

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
      { path: "artifacts/release-report.pdf", filename: "release-report.pdf" },
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
  readonly route = "fixture" as const;
  private requests = structuredClone(samples);
  private listeners = new Set<() => void>();

  async list(): Promise<PickleRequest[]> {
    return structuredClone(this.requests);
  }

  async respond(
    requestToAnswer: PickleRequest,
    payload: JsonObject,
  ): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 180));
    this.requests = this.requests.map((item) =>
      item.id === requestToAnswer.id
        ? {
            ...item,
            state: "answered",
            responseCount: 1,
            response: {
              path: `responses/${item.id}.md`,
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
  }

  subscribe(onChange: () => void): () => void {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  }
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
