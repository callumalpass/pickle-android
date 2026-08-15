import type {
  CollectionFileDescriptor,
  MdbaseConnection,
} from "@mdbase-dev/connect";
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

  it("returns null when the attachment path is absent", async () => {
    const connection = {
      collectionId: "collection-1",
      info: () => ({ authority: { kind: "connector" } }),
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
