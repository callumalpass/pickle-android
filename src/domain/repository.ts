import type { JsonObject, MdbaseConnection } from "@mdbase-dev/connect";
import type { PickleRequest } from "@mdbase-dev/pickle";
import { PickleCollection } from "@mdbase-dev/pickle";
import type { PickleFrontmatter } from "@mdbase-dev/pickle";

export interface PickleRepository {
  readonly collectionId: string;
  readonly authority: "hosted" | "connector" | "fixture";
  list(): Promise<PickleRequest[]>;
  respond(request: PickleRequest, payload: JsonObject): Promise<void>;
  subscribe(onChange: () => void): () => void;
}

export class ConnectedPickleRepository implements PickleRepository {
  readonly collectionId: string;
  readonly authority: "hosted" | "connector";
  private readonly collection: PickleCollection;

  constructor(
    private readonly connection: MdbaseConnection<PickleFrontmatter>,
  ) {
    this.collection = new PickleCollection(connection);
    this.collectionId = connection.collectionId;
    this.authority = connection.info()?.authority.kind ?? "connector";
  }

  list(): Promise<PickleRequest[]> {
    return this.collection.list();
  }

  async respond(request: PickleRequest, payload: JsonObject): Promise<void> {
    await this.collection.respond(request, payload);
  }

  subscribe(onChange: () => void): () => void {
    const controller = new AbortController();
    void (async () => {
      try {
        for await (const change of this.connection.watch({
          signal: controller.signal,
          pollIntervalMs: 1_500,
          retry: {
            initialDelayMs: 500,
            maxDelayMs: 15_000,
            multiplier: 1.8,
          },
        })) {
          void change;
          onChange();
        }
      } catch (reason) {
        if (!controller.signal.aborted)
          console.warn("Pickle watch stopped", reason);
      }
    })();
    return () => controller.abort();
  }
}
