import type { PickleAttachment } from "@mdbase-dev/pickle";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileImage,
  FileText,
  LoaderCircle,
  Paperclip,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

import type {
  PickleAttachmentContent,
  PickleRepository,
} from "../domain/repository";
import { Markdown } from "./markdown";

type AttachmentKind = "image" | "markdown" | "pdf" | "other";
type AttachmentState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; content: PickleAttachmentContent }
  | { status: "missing"; message: string }
  | { status: "error"; message: string };

export function Attachments({
  attachments,
  repository,
}: {
  attachments: PickleAttachment[];
  repository: PickleRepository;
}) {
  if (!attachments.length) return null;
  return (
    <section className="attachments" aria-labelledby="attachments-heading">
      <p className="eyebrow" id="attachments-heading">
        Attachments
      </p>
      <div className="attachment-list">
        {attachments.map((attachment) => (
          <AttachmentItem
            key={attachment.path}
            attachment={attachment}
            repository={repository}
          />
        ))}
      </div>
    </section>
  );
}

function AttachmentItem({
  attachment,
  repository,
}: {
  attachment: PickleAttachment;
  repository: PickleRepository;
}) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<AttachmentState>({ status: "idle" });
  const request = useRef<AbortController | null>(null);
  const fallbackKind = attachmentKind(attachment.filename);
  const kind =
    state.status === "ready"
      ? attachmentKind(
          attachment.filename,
          state.content.mediaType || state.content.blob.type,
        )
      : fallbackKind;
  const previewId = `attachment-${safeId(attachment.path)}`;

  useEffect(
    () => () => request.current?.abort("Attachment preview closed"),
    [],
  );

  function toggle() {
    const willExpand = !expanded;
    setExpanded(willExpand);
    if (willExpand && state.status === "idle") void load();
  }

  async function load() {
    request.current?.abort("A newer attachment load started");
    const controller = new AbortController();
    request.current = controller;
    setState({ status: "loading" });
    try {
      const content = await repository.readAttachment(attachment, {
        signal: controller.signal,
        timeoutMs: 30_000,
      });
      if (controller.signal.aborted) return;
      setState(
        content
          ? { status: "ready", content }
          : {
              status: "missing",
              message: "This file is no longer present in the collection.",
            },
      );
    } catch {
      if (controller.signal.aborted) return;
      setState({
        status: "error",
        message:
          "Pickle could not read this attachment. Check that the collection is connected, then try again.",
      });
    }
  }

  return (
    <article className={`attachment attachment-${kind}`}>
      <button
        aria-controls={previewId}
        aria-expanded={expanded}
        className="attachment-summary"
        type="button"
        onClick={toggle}
      >
        <span className="attachment-type-mark" aria-hidden="true">
          <AttachmentIcon kind={kind} />
        </span>
        <span className="attachment-name">
          <strong>{attachment.filename}</strong>
          <span>
            {attachmentLabel(kind)}
            {state.status === "ready"
              ? ` · ${formatBytes(state.content.size)}`
              : ""}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="attachment-chevron"
          size={18}
        />
      </button>
      {expanded ? (
        <div
          aria-label={`${attachment.filename} preview`}
          className="attachment-preview"
          id={previewId}
          role="region"
        >
          <AttachmentPreview
            attachment={attachment}
            kind={kind}
            onRetry={() => void load()}
            state={state}
          />
        </div>
      ) : null}
    </article>
  );
}

function AttachmentPreview({
  attachment,
  kind,
  onRetry,
  state,
}: {
  attachment: PickleAttachment;
  kind: AttachmentKind;
  onRetry: () => void;
  state: AttachmentState;
}) {
  if (state.status === "idle" || state.status === "loading")
    return (
      <p className="attachment-status" role="status">
        <LoaderCircle className="spinning" size={17} />
        Loading preview…
      </p>
    );
  if (state.status === "missing" || state.status === "error")
    return (
      <div className="attachment-error" role="alert">
        <p>{state.message}</p>
        {state.status === "error" ? (
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </div>
    );
  return (
    <LoadedAttachment
      attachment={attachment}
      content={state.content}
      kind={kind}
    />
  );
}

function LoadedAttachment({
  attachment,
  content,
  kind,
}: {
  attachment: PickleAttachment;
  content: PickleAttachmentContent;
  kind: AttachmentKind;
}) {
  const [objectUrl, setObjectUrl] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [decodeError, setDecodeError] = useState(false);

  useEffect(() => {
    if (kind === "markdown") {
      let active = true;
      void content.blob
        .text()
        .then((value) => {
          if (active) setMarkdown(value);
        })
        .catch(() => {
          if (active) setDecodeError(true);
        });
      return () => {
        active = false;
      };
    }
    if (kind !== "image") return;
    let active = true;
    let url = "";
    void Promise.resolve().then(() => {
      if (!active) return;
      url = URL.createObjectURL(content.blob);
      setObjectUrl(url);
    });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [content.blob, kind]);

  if (kind === "markdown") {
    if (decodeError)
      return <p className="attachment-status">Markdown preview unavailable.</p>;
    if (!markdown)
      return (
        <p className="attachment-status" role="status">
          <LoaderCircle className="spinning" size={17} />
          Preparing document…
        </p>
      );
    return <Markdown className="attachment-markdown" source={markdown} />;
  }
  if (kind === "image")
    return objectUrl ? (
      <figure className="attachment-image">
        <img alt={attachment.filename} src={objectUrl} />
        <figcaption>{attachment.filename}</figcaption>
      </figure>
    ) : null;
  if (kind === "pdf")
    return <PdfPreview blob={content.blob} filename={attachment.filename} />;
  return (
    <p className="attachment-status">
      <Download size={17} />
      Preview is not available for this file type.
    </p>
  );
}

function PdfPreview({ blob, filename }: { blob: Blob; filename: string }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    let loadingTask:
      ReturnType<(typeof import("pdfjs-dist"))["getDocument"]> | undefined;
    void (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      if (!active) return;
      const data = new Uint8Array(await blob.arrayBuffer());
      if (!active) return;
      loadingTask = pdfjs.getDocument({
        data,
      });
      const loadedDocument = await loadingTask.promise;
      if (active) {
        setPage(1);
        setDocument(loadedDocument);
      }
    })().catch((reason: unknown) => {
      if (active)
        setError(
          reason instanceof Error ? reason.message : "PDF preview unavailable.",
        );
    });
    return () => {
      active = false;
      void loadingTask?.destroy();
    };
  }, [blob]);

  if (error)
    return (
      <div className="attachment-error" role="alert">
        <p>PDF preview unavailable. {error}</p>
      </div>
    );
  if (!document)
    return (
      <p className="attachment-status" role="status">
        <LoaderCircle className="spinning" size={17} />
        Preparing PDF…
      </p>
    );
  return (
    <div className="pdf-document" aria-label={filename}>
      <div className="pdf-document-heading">
        <span>
          Page {page} of {document.numPages}
        </span>
        {document.numPages > 1 ? (
          <span className="pdf-page-actions">
            <button
              aria-label="Previous PDF page"
              disabled={page === 1}
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              aria-label="Next PDF page"
              disabled={page === document.numPages}
              type="button"
              onClick={() =>
                setPage((current) => Math.min(document.numPages, current + 1))
              }
            >
              <ChevronRight size={18} />
            </button>
          </span>
        ) : null}
      </div>
      <PdfPage document={document} number={page} />
    </div>
  );
}

function PdfPage({
  document,
  number,
}: {
  document: PDFDocumentProxy;
  number: number;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const container = frame.current;
    const target = canvas.current;
    if (!container || !target) return;
    let renderTask: RenderTask | null = null;
    let sequence = 0;
    let active = true;
    const render = async () => {
      const current = ++sequence;
      renderTask?.cancel();
      const page = await document.getPage(number);
      if (current !== sequence) return;
      const base = page.getViewport({ scale: 1 });
      const cssWidth = Math.max(1, container.clientWidth);
      const scale = cssWidth / base.width;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: scale * pixelRatio });
      target.width = Math.floor(viewport.width);
      target.height = Math.floor(viewport.height);
      target.style.width = `${Math.floor(viewport.width / pixelRatio)}px`;
      target.style.height = `${Math.floor(viewport.height / pixelRatio)}px`;
      renderTask = page.render({ canvas: target, viewport });
      try {
        await renderTask.promise;
      } catch (reason) {
        if (
          reason instanceof Error &&
          reason.name === "RenderingCancelledException"
        )
          return;
        throw reason;
      }
    };
    const scheduleRender = () =>
      void render().catch(() => {
        if (active) setError(true);
      });
    const observer = new ResizeObserver(scheduleRender);
    observer.observe(container);
    scheduleRender();
    return () => {
      active = false;
      sequence += 1;
      observer.disconnect();
      renderTask?.cancel();
    };
  }, [document, number]);

  if (error)
    return (
      <p className="attachment-status" role="alert">
        Page {number} could not be rendered.
      </p>
    );
  return (
    <figure className="pdf-page">
      <div ref={frame} className="pdf-page-frame">
        <canvas ref={canvas} aria-label={`Page ${number}`} role="img" />
      </div>
      <figcaption>Page {number}</figcaption>
    </figure>
  );
}

function attachmentKind(filename: string, mediaType = ""): AttachmentKind {
  const normalizedType = mediaType.toLocaleLowerCase();
  const extension = filename.split(".").pop()?.toLocaleLowerCase();
  if (
    normalizedType.startsWith("image/") ||
    imageExtensions.has(extension ?? "")
  )
    return "image";
  if (
    normalizedType === "text/markdown" ||
    normalizedType === "text/x-markdown" ||
    extension === "md" ||
    extension === "markdown"
  )
    return "markdown";
  if (normalizedType === "application/pdf" || extension === "pdf") return "pdf";
  return "other";
}

function AttachmentIcon({ kind }: { kind: AttachmentKind }) {
  if (kind === "image") return <FileImage size={18} />;
  if (kind === "markdown" || kind === "pdf") return <FileText size={18} />;
  return <Paperclip size={18} />;
}

function attachmentLabel(kind: AttachmentKind): string {
  if (kind === "image") return "Image";
  if (kind === "markdown") return "Markdown";
  if (kind === "pdf") return "PDF document";
  return "File";
}

function formatBytes(value: number): string {
  if (value < 1_000) return `${value} B`;
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)} kB`;
  return `${(value / 1_000_000).toFixed(1)} MB`;
}

function safeId(value: string): string {
  return value.replace(/[^a-z0-9_-]+/giu, "-");
}

const imageExtensions = new Set([
  "avif",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);
