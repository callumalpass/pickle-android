import type { JsonObject, MdbaseConnection } from "@mdbase/connect";
import type { PickleRequest } from "@mdbase/pickle";
import { PickleCollection } from "@mdbase/pickle";
import type { PickleFrontmatter } from "@mdbase/pickle";

export interface PickleRepository {
  readonly collectionId: string;
  readonly route: "remote" | "direct" | "relay" | "fixture";
  list(): Promise<PickleRequest[]>;
  respond(request: PickleRequest, payload: JsonObject): Promise<void>;
  subscribe(onChange: () => void): () => void;
}

export class ConnectedPickleRepository implements PickleRepository {
  readonly collectionId: string;
  readonly route: "remote" | "direct" | "relay";
  private readonly collection: PickleCollection;

  constructor(
    private readonly connection: MdbaseConnection<PickleFrontmatter>,
  ) {
    this.collection = new PickleCollection(connection);
    this.collectionId = connection.collectionId;
    this.route = connection.info()?.route ?? "relay";
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
