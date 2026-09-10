import type {
  CollectionFileDescriptor,
  MdbaseConnection,
} from "@mdbase-dev/connect";
import { connectSuccess } from "@mdbase-dev/connect-testing";
import {
  PickleCollection,
  type PicklePendingResponse,
} from "@mdbase-dev/pickle";
import { describe, expect, it, vi } from "vitest";

import { ConnectedPickleRepository } from "./repository";

describe("ConnectedPickleRepository attachments", () => {
  it("finds and downloads the exact collection file", async () => {
    const descriptor: CollectionFileDescriptor = {
      fileId: "attachment-1",
      path: "attachments/request-1/1-context.md",
      revision: "one",
      contentDigest: `sha256:${"0".repeat(64)}`,
      size: 9,
      mediaType: "text/markdown",
      mediaClass: "other",
      modifiedAt: "2026-08-16T00:00:00Z",
    };
    const list = vi.fn(async function* () {
      yield descriptor;
    });
    const download = vi.fn(
      async () => new Blob(["# Context"], { type: "text/markdown" }),
    );
    const connection = {
      collectionId: "collection-1",
      info: () => ({ authority: { kind: "hosted" } }),
      read: vi.fn(async () => ({
        ok: false as const,
        problem: { code: "record_not_found", message: "legacy file" },
      })),
      files: { list, download },
    } as unknown as MdbaseConnection;
    const repository = new ConnectedPickleRepository(connection);

    const result = await repository.readAttachment({
      path: descriptor.path,
      filename: "context.md",
    });

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: "attachments/request-1",
        timeoutMs: 10_000,
      }),
    );
    expect(download).toHaveBeenCalledWith(
      descriptor,
      expect.objectContaining({ timeoutMs: 10_000 }),
    );
    expect(await result?.blob.text()).toBe("# Context");
  });

  it("reads Markdown attachment records without using the file API", async () => {
    const read = vi.fn(async () => ({
      ok: true as const,
      value: {
        path: "attachments/request-1/1-context.md",
        types: ["pickle_attachment"],
        frontmatter: {
          type: "pickle_attachment",
          request_id: "request-1",
          filename: "context.md",
          content_type: "text/markdown",
          size_bytes: 9,
          sha256: `sha256:${"0".repeat(64)}`,
        },
        body: "# Context",
      },
    }));
    const list = vi.fn(async function* () {
      yield* [];
    });
    const connection = {
      collectionId: "collection-1",
      info: () => ({ authority: { kind: "hosted" } }),
      read,
      files: { list },
    } as unknown as MdbaseConnection;
    const repository = new ConnectedPickleRepository(connection);

    const result = await repository.readAttachment({
      path: "attachments/request-1/1-context.md",
      filename: "1-context.md",
    });

    expect(read).toHaveBeenCalledWith(
      { path: "attachments/request-1/1-context.md" },
      expect.objectContaining({ timeoutMs: 10_000 }),
    );
    expect(result).toMatchObject({
      filename: "context.md",
      mediaType: "text/markdown",
      size: 9,
    });
    expect(await result?.blob.text()).toBe("# Context");
    expect(list).not.toHaveBeenCalled();
  });

  it("returns null when the attachment path is absent", async () => {
    const connection = {
      collectionId: "collection-1",
      info: () => ({ authority: { kind: "connector" } }),
      read: vi.fn(async () => ({
        ok: false as const,
        problem: { code: "record_not_found", message: "missing" },
      })),
      files: {
        list: async function* () {
          yield* [];
        },
      },
    } as unknown as MdbaseConnection;
    const repository = new ConnectedPickleRepository(connection);

    await expect(
      repository.readAttachment({
        path: "attachments/request-1/missing.pdf",
        filename: "missing.pdf",
      }),
    ).resolves.toBeNull();
  });
});

describe("ConnectedPickleRepository response recovery", () => {
  it("exposes every authority-backed pending response in creation order", async () => {
    const recover = vi
      .fn()
      .mockResolvedValue(
        connectSuccess({ path: "responses/one.md", frontmatter: {} }),
      );
    const newer = {
      requestId: "response-two",
      operation: "create",
      createdAt: "2026-08-05T00:00:00.000Z",
      recover: vi.fn(),
    } as unknown as PicklePendingResponse;
    const older = {
      requestId: "response-one",
      operation: "create",
      createdAt: "2026-08-04T00:00:00.000Z",
      recover,
    } as unknown as PicklePendingResponse;
    const connection = {
      collectionId: "collection-1",
      info: () => ({ authority: { kind: "hosted" } }),
      pendingMutations: () => [newer, older],
      pendingMutation: (requestId: string) =>
        requestId === older.requestId ? older : newer,
    } as unknown as MdbaseConnection;
    const repository = new ConnectedPickleRepository(connection);

    expect(
      repository.pendingResponses().map(({ requestId }) => requestId),
    ).toEqual(["response-one", "response-two"]);
    await expect(
      repository.recoverResponse("response-one"),
    ).resolves.toMatchObject({
      kind: "recorded",
      record: { path: "responses/one.md" },
    });
    expect(recover).toHaveBeenCalledWith({ timeoutMs: 20_000 });
  });
});

describe("ConnectedPickleRepository loading", () => {
  it("keeps body-free bounded queries and allows a longer whole-query budget", async () => {
    // Exercise Pickle's forwarding into Connect without duplicating its contract.
    const describe = vi
      .spyOn(PickleCollection.prototype, "describe")
      .mockResolvedValue({
        collection: {},
        contract: { implementations: [] },
      } as unknown as Awaited<ReturnType<PickleCollection["describe"]>>);
    const queryAll = vi.fn().mockResolvedValue(connectSuccess({ results: [] }));
    const connection = {
      collectionId: "collection-1",
      info: () => ({ authority: { kind: "hosted" } }),
      queryAll,
    } as unknown as MdbaseConnection;
    const repository = new ConnectedPickleRepository(connection);
    const controller = new AbortController();
    try {
      await expect(
        repository.list({ signal: controller.signal }),
      ).resolves.toEqual([]);
      expect(queryAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ includeBody: false }),
        {
          signal: controller.signal,
          timeoutMs: 60_000,
          pageSize: 256,
        },
      );
      await repository.list({ timeoutMs: 5_000 });
      expect(queryAll).toHaveBeenLastCalledWith(
        expect.objectContaining({ includeBody: false }),
        {
          timeoutMs: 5_000,
          pageSize: 256,
        },
      );
    } finally {
      describe.mockRestore();
    }
  });
});
