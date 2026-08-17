import type {
  ConnectProblem,
  ConnectRequestOptions,
  JsonObject,
  MdbaseConnection,
} from "@mdbase-dev/connect";
import {
  PickleCollection,
  type PickleAttachment,
  type PickleAttachmentContent,
  type PickleFrontmatter,
  type PicklePendingResponse,
  type PickleRequest,
  type PickleResponseSubmission,
} from "@mdbase-dev/pickle";

const READ_TIMEOUT_MS = 10_000;
const WRITE_TIMEOUT_MS = 20_000;
const WATCH_START_TIMEOUT_MS = 10_000;

export type { PickleAttachmentContent } from "@mdbase-dev/pickle";

export interface PickleRepository {
  readonly collectionId: string;
  readonly authority: "hosted" | "connector" | "fixture";
  list(options?: ConnectRequestOptions): Promise<PickleRequest[]>;
  readAttachment(
    attachment: PickleAttachment,
    options?: ConnectRequestOptions,
  ): Promise<PickleAttachmentContent | null>;
  respond(
    request: PickleRequest,
    payload: JsonObject,
    options?: ConnectRequestOptions,
  ): Promise<PickleResponseSubmission>;
  pendingResponse(): PicklePendingResponse | null;
  recoverResponse(
    requestId: string,
    options?: ConnectRequestOptions,
  ): Promise<PickleResponseSubmission>;
  subscribe(
    onChange: () => void,
    onProblem?: (problem: ConnectProblem) => void,
    options?: ConnectRequestOptions,
  ): () => void;
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

  list(options: ConnectRequestOptions = {}): Promise<PickleRequest[]> {
    return this.collection.list(withTimeout(options, READ_TIMEOUT_MS));
  }

  readAttachment(
    attachment: PickleAttachment,
    options: ConnectRequestOptions = {},
  ): Promise<PickleAttachmentContent | null> {
    return this.collection.readAttachment(
      attachment,
      withTimeout(options, READ_TIMEOUT_MS),
    );
  }

  respond(
    request: PickleRequest,
    payload: JsonObject,
    options: ConnectRequestOptions = {},
  ): Promise<PickleResponseSubmission> {
    return this.collection.respond(
      request,
      payload,
      withTimeout(options, WRITE_TIMEOUT_MS),
    );
  }

  pendingResponse(): PicklePendingResponse | null {
    return (
      [...this.collection.pendingResponses()].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      )[0] ?? null
    );
  }

  recoverResponse(
    requestId: string,
    options: ConnectRequestOptions = {},
  ): Promise<PickleResponseSubmission> {
    return this.collection.recoverResponse(
      requestId,
      withTimeout(options, WRITE_TIMEOUT_MS),
    );
  }

  subscribe(
    onChange: () => void,
    onProblem: (problem: ConnectProblem) => void = () => undefined,
    options: ConnectRequestOptions = {},
  ): () => void {
    const startup = new AbortController();
    const lifetime = new AbortController();
    let closeSubscription: (() => void) | null = null;
    const stop = () => {
      startup.abort("Pickle watch stopped");
      lifetime.abort("Pickle watch stopped");
      closeSubscription?.();
      closeSubscription = null;
    };
    if (options.signal?.aborted) {
      stop();
      return stop;
    }
    options.signal?.addEventListener("abort", stop, { once: true });
    void this.connection
      .watch(
        {
          pollIntervalMs: 1_500,
          retry: {
            initialDelayMs: 500,
            maxDelayMs: 15_000,
            multiplier: 1.8,
          },
          lifetimeSignal: lifetime.signal,
        },
        {
          signal: startup.signal,
          timeoutMs: options.timeoutMs ?? WATCH_START_TIMEOUT_MS,
        },
      )
      .then((outcome) => {
        if (startup.signal.aborted) return;
        if (!outcome.ok) {
          onProblem(outcome.problem);
          return;
        }
        const subscription = outcome.value;
        const unsubscribe = subscription.subscribe(
          () => onChange(),
          undefined,
          (problem) => {
            if (!lifetime.signal.aborted) onProblem(problem);
          },
        );
        closeSubscription = () => {
          unsubscribe();
          subscription.close();
        };
      });
    return stop;
  }
}

function withTimeout(
  options: ConnectRequestOptions,
  timeoutMs: number,
): ConnectRequestOptions {
  return { ...options, timeoutMs: options.timeoutMs ?? timeoutMs };
}
