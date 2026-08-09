import type { MdbaseConnection } from "@mdbase-dev/connect";
import type { PickleFrontmatter } from "@mdbase-dev/pickle";
import { describe, expect, it, vi } from "vitest";

import { ConnectedPickleRepository } from "./repository";

describe("ConnectedPickleRepository attachments", () => {
  it("resolves an attachment descriptor in its folder and downloads it", async () => {
    const descriptor = {
      fileId: "file-1",
      path: "attachments/request-1/1-review.md",
      revision: "revision-1",
      contentDigest: `sha256:${"a".repeat(64)}` as const,
      size: 12,
      mediaType: "text/markdown",
      mediaClass: "other" as const,
      modifiedAt: "2026-08-09T00:00:00Z",
    };
    const list = vi.fn(async function* () {
      yield descriptor;
    });
    const content = new Blob(["# Review\n"], { type: "text/markdown" });
    const download = vi.fn().mockResolvedValue(content);
    const repository = new ConnectedPickleRepository({
      collectionId: "collection-1",
      info: () => ({ authority: { kind: "connector" } }),
      files: { list, download },
    } as unknown as MdbaseConnection<PickleFrontmatter>);
    const controller = new AbortController();

    await expect(
      repository.readAttachment(
        { path: descriptor.path, filename: "review.md" },
        { signal: controller.signal, timeoutMs: 2_000 },
      ),
    ).resolves.toBe(content);
    expect(list).toHaveBeenCalledWith({
      folder: "attachments/request-1",
      signal: controller.signal,
      timeoutMs: 2_000,
    });
    expect(download).toHaveBeenCalledWith(descriptor, {
      signal: controller.signal,
      timeoutMs: 2_000,
    });
  });

  it("reports a stale attachment path without downloading another file", async () => {
    const list = vi.fn(async function* () {
      yield {
        path: "attachments/request-1/2-other.md",
      };
    });
    const download = vi.fn();
    const repository = new ConnectedPickleRepository({
      collectionId: "collection-1",
      info: () => ({ authority: { kind: "hosted" } }),
      files: { list, download },
    } as unknown as MdbaseConnection<PickleFrontmatter>);

    await expect(
      repository.readAttachment({
        path: "attachments/request-1/1-missing.md",
        filename: "missing.md",
      }),
    ).rejects.toThrow(
      "Attachment not found: attachments/request-1/1-missing.md",
    );
    expect(download).not.toHaveBeenCalled();
  });
});
