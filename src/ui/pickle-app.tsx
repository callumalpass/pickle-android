import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { Haptics, NotificationType } from "@capacitor/haptics";
import type { ConnectProblem, JsonObject } from "@mdbase-dev/connect";
import type { PickleAttachment, PickleRequest } from "@mdbase-dev/pickle";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  Bell,
  BellOff,
  Check,
  ChevronRight,
  Circle,
  Cloud,
  ExternalLink,
  History as HistoryIcon,
  Inbox,
  LogOut,
  Monitor,
  Moon,
  Paperclip,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Sun,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import markUrl from "../assets/pickle-mark.svg";
import { connectProblemFromError } from "../cloud/outcome";
import type { PickleRepository } from "../domain/repository";
import {
  pickleNotifications,
  type NotificationState,
} from "../native/notifications";
import { ResponseForm } from "./response-form";
import { applyTheme, currentTheme, type Theme } from "./theme";

type View = "inbox" | "history" | "settings";
type RequestView = Exclude<View, "settings">;
type SortOrder = "urgency" | "newest" | "oldest" | "title";
type StateFilter = "all" | PickleRequest["state"];
type PriorityFilter = "all" | PickleRequest["priority"];

interface RequestFilters {
  state: StateFilter;
  priority: PriorityFilter;
}

interface RequestGroup {
  id: string;
  label: string;
  description: string;
  requests: PickleRequest[];
}

interface PickleAppProps {
  repository: PickleRepository;
  onChangeCollection?: () => void;
  onDisconnect: () => void;
}

export function PickleApp({
  repository,
  onChangeCollection,
  onDisconnect,
}: PickleAppProps) {
  const [requests, setRequests] = useState<PickleRequest[]>([]);
  const [view, setView] = useState<View>("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortOrders, setSortOrders] = useState<Record<RequestView, SortOrder>>({
    inbox: "urgency",
    history: "newest",
  });
  const [filters, setFilters] = useState<Record<RequestView, RequestFilters>>({
    inbox: { state: "all", priority: "all" },
    history: { state: "all", priority: "all" },
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingResponseId, setPendingResponseId] = useState<string | null>(
    () => repository.pendingResponse()?.requestId ?? null,
  );
  const [pendingResponseIssue, setPendingResponseIssue] = useState<
    string | null
  >(null);
  const [recoveringResponse, setRecoveringResponse] = useState(false);
  const loadSequence = useRef(0);
  const loadRequest = useRef<AbortController | null>(null);
  const responseRequest = useRef<AbortController | null>(null);
  const foregroundRequest = useRef<AbortController | null>(null);
  const navigationState = useRef({ selectedId, view });

  useEffect(() => {
    navigationState.current = { selectedId, view };
  }, [selectedId, view]);

  const load = useCallback(
    async (quiet = false, parentSignal?: AbortSignal) => {
      const sequence = ++loadSequence.current;
      loadRequest.current?.abort("A newer Pickle load started");
      const controller = linkedController(parentSignal);
      loadRequest.current = controller;
      if (!quiet) setRefreshing(true);
      try {
        const current = await repository.list({
          signal: controller.signal,
          timeoutMs: 10_000,
        });
        if (sequence !== loadSequence.current) return;
        setRequests(current);
        setError(null);
      } catch (reason) {
        if (sequence === loadSequence.current && !controller.signal.aborted)
          setError(issueMessage(reason));
      } finally {
        if (sequence === loadSequence.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [repository],
  );

  const recoverPendingResponse = useCallback(
    async (parentSignal?: AbortSignal) => {
      const pending = repository.pendingResponse();
      if (!pending) {
        setPendingResponseId(null);
        setPendingResponseIssue(null);
        return;
      }
      const controller = linkedController(parentSignal);
      responseRequest.current?.abort("A response recovery superseded it");
      responseRequest.current = controller;
      setPendingResponseId(pending.requestId);
      setRecoveringResponse(true);
      try {
        const submission = await repository.recoverResponse(pending.requestId, {
          signal: controller.signal,
          timeoutMs: 20_000,
        });
        if (submission.kind === "pending") {
          setPendingResponseId(submission.requestId);
          setPendingResponseIssue(
            "The collection is not reachable yet. Pickle kept the original response and will resume it without sending another.",
          );
          return;
        }
        setPendingResponseId(null);
        setPendingResponseIssue(null);
        setToast("Response recorded");
        await load(true, parentSignal);
      } catch (reason) {
        if (!controller.signal.aborted)
          setPendingResponseIssue(issueMessage(reason));
      } finally {
        if (responseRequest.current === controller)
          setRecoveringResponse(false);
      }
    },
    [load, repository],
  );

  useEffect(() => {
    let unsubscribe: () => void = () => undefined;
    const startForeground = () => {
      foregroundRequest.current?.abort("Pickle foreground restarted");
      unsubscribe();
      const controller = new AbortController();
      foregroundRequest.current = controller;
      queueMicrotask(() => void load(true, controller.signal));
      queueMicrotask(() => void recoverPendingResponse(controller.signal));
      unsubscribe = repository.subscribe(
        () => void load(true, controller.signal),
        (problem) => {
          if (!controller.signal.aborted) setError(problemMessage(problem));
        },
        { signal: controller.signal, timeoutMs: 10_000 },
      );
      void pickleNotifications
        .start(
          () => {
            setView("inbox");
            setSelectedId(null);
            setQuery("");
            setFilters((current) => ({
              ...current,
              inbox: { state: "all", priority: "all" },
            }));
            setToast("New request received");
            void load(true, controller.signal);
          },
          { signal: controller.signal },
        )
        .catch((reason) => {
          if (!controller.signal.aborted) setError(issueMessage(reason));
        });
    };
    const stopForeground = () => {
      foregroundRequest.current?.abort("Pickle moved to the background");
      loadRequest.current?.abort("Pickle moved to the background");
      responseRequest.current?.abort("Pickle moved to the background");
      unsubscribe();
      unsubscribe = () => undefined;
    };
    startForeground();
    const visibility = () => {
      if (document.visibilityState === "visible") startForeground();
      else stopForeground();
    };
    document.addEventListener("visibilitychange", visibility);
    const appState = Capacitor.isNativePlatform()
      ? CapacitorApp.addListener("appStateChange", ({ isActive }) => {
          if (isActive) startForeground();
          else stopForeground();
        })
      : null;
    return () => {
      stopForeground();
      document.removeEventListener("visibilitychange", visibility);
      void appState?.then((handle) => handle.remove());
    };
  }, [load, recoverPendingResponse, repository]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener("backButton", () => {
      const current = navigationState.current;
      if (current.selectedId) {
        navigationState.current = { ...current, selectedId: null };
        setSelectedId(null);
        return;
      }
      if (current.view !== "inbox") {
        navigationState.current = { ...current, view: "inbox" };
        setView("inbox");
        return;
      }
      void CapacitorApp.minimizeApp();
    });
    return () => void listener.then((handle) => handle.remove());
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3_500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const requestView: RequestView = view === "history" ? "history" : "inbox";
  const sortOrder = sortOrders[requestView];
  const activeFilters = filters[requestView];
  const activeFilterCount =
    Number(activeFilters.state !== "all") +
    Number(activeFilters.priority !== "all");
  const visibleRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const matching = requests.filter((request) => {
      const belongs =
        view === "inbox"
          ? request.state === "pending" || request.state === "conflict"
          : view === "history"
            ? request.state === "answered" || request.state === "cancelled"
            : false;
      const matchesState =
        activeFilters.state === "all" || request.state === activeFilters.state;
      const matchesPriority =
        activeFilters.priority === "all" ||
        request.priority === activeFilters.priority;
      return (
        belongs &&
        matchesState &&
        matchesPriority &&
        (!normalizedQuery ||
          [
            request.title,
            request.message,
            request.source,
            ...request.tags,
          ].some((value) =>
            value.toLocaleLowerCase().includes(normalizedQuery),
          ))
      );
    });
    return matching.sort((left, right) =>
      compareRequests(left, right, sortOrder),
    );
  }, [activeFilters, query, requests, sortOrder, view]);
  const requestGroups = useMemo<RequestGroup[]>(() => {
    if (view === "history") {
      return [
        {
          id: "history",
          label: "Completed record",
          description: `Answered and cancelled · ${sortDescription(sortOrder)}`,
          requests: visibleRequests,
        },
      ];
    }
    const conflicts = visibleRequests.filter(
      (request) => request.state === "conflict",
    );
    const pending = visibleRequests.filter(
      (request) => request.state === "pending",
    );
    return [
      {
        id: "attention",
        label: "Needs attention",
        description: "Resolve in the collection",
        requests: conflicts,
      },
      {
        id: "ready",
        label: "Ready to answer",
        description: sortDescription(sortOrder),
        requests: pending,
      },
    ].filter((group) => group.requests.length);
  }, [sortOrder, view, visibleRequests]);
  const selected =
    requests.find((request) => request.id === selectedId) ?? null;
  const pendingCount = requests.filter(
    (request) => request.state === "pending",
  ).length;
  const conflictCount = requests.filter(
    (request) => request.state === "conflict",
  ).length;
  const answeredCount = requests.filter(
    (request) => request.state === "answered",
  ).length;
  const cancelledCount = requests.filter(
    (request) => request.state === "cancelled",
  ).length;
  const inboxCount = pendingCount + conflictCount;

  function navigate(next: View) {
    setView(next);
    setSelectedId(null);
    setQuery("");
    setFiltersOpen(false);
  }

  function setFilter<Key extends keyof RequestFilters>(
    key: Key,
    value: RequestFilters[Key],
  ) {
    setFilters((current) => ({
      ...current,
      [requestView]: {
        ...current[requestView],
        [key]: value,
      },
    }));
  }

  function clearFilters() {
    setFilters((current) => ({
      ...current,
      [requestView]: { state: "all", priority: "all" },
    }));
  }

  return (
    <div className={`app-frame ${selected ? "has-detail" : ""}`}>
      <Navigation inboxCount={inboxCount} view={view} onNavigate={navigate} />

      <main className="workspace">
        {pendingResponseId ? (
          <div className="response-recovery" role="status">
            <AlertTriangle aria-hidden="true" size={18} />
            <div>
              <strong>Response awaiting confirmation</strong>
              <p>
                {pendingResponseIssue ??
                  "Pickle saved this exact response and is checking whether the collection recorded it."}
              </p>
            </div>
            <button
              disabled={recoveringResponse}
              type="button"
              onClick={() =>
                void recoverPendingResponse(foregroundRequest.current?.signal)
              }
            >
              {recoveringResponse ? "Checking…" : "Resume response"}
            </button>
          </div>
        ) : null}
        {view === "settings" ? (
          <SettingsView
            repository={repository}
            onChangeCollection={onChangeCollection}
            onDisconnect={onDisconnect}
          />
        ) : (
          <section className={`request-pane ${selected ? "detail-open" : ""}`}>
            <div className="request-list-pane">
              <header className="page-header">
                <div>
                  <p className="eyebrow">
                    {view === "inbox" ? "Decision queue" : "Decision record"}
                  </p>
                  <h1>{view === "inbox" ? "Inbox" : "History"}</h1>
                  <p className="page-status">
                    {view === "inbox"
                      ? inboxSummary(pendingCount, conflictCount)
                      : historySummary(answeredCount, cancelledCount)}
                  </p>
                </div>
                <button
                  aria-label="Refresh requests"
                  className="icon-action"
                  disabled={refreshing}
                  type="button"
                  onClick={() => void load()}
                >
                  <RefreshCw
                    className={refreshing ? "spinning" : ""}
                    size={19}
                  />
                </button>
              </header>

              <div className="request-tools">
                <label className="search-field">
                  <Search aria-hidden="true" size={17} />
                  <span className="sr-only">Search requests</span>
                  <input
                    placeholder="Search title, source, or tag"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <div className="request-tool-actions">
                  <label className="sort-field">
                    <ArrowUpDown aria-hidden="true" size={16} />
                    <span className="sr-only">Sort requests</span>
                    <select
                      value={sortOrder}
                      onChange={(event) =>
                        setSortOrders((current) => ({
                          ...current,
                          [requestView]: event.target.value as SortOrder,
                        }))
                      }
                    >
                      <option value="urgency">Urgency</option>
                      <option value="newest">Newest</option>
                      <option value="oldest">Oldest</option>
                      <option value="title">Title A–Z</option>
                    </select>
                  </label>
                  <button
                    aria-controls="request-filters"
                    aria-expanded={filtersOpen}
                    aria-label={
                      activeFilterCount
                        ? `Filter requests, ${activeFilterCount} active`
                        : "Filter requests"
                    }
                    className={`filter-action ${
                      activeFilterCount ? "filter-action-active" : ""
                    }`}
                    type="button"
                    onClick={() => setFiltersOpen((current) => !current)}
                  >
                    <SlidersHorizontal aria-hidden="true" size={16} />
                    <span>Filter</span>
                    {activeFilterCount ? (
                      <span aria-hidden="true" className="filter-count">
                        {activeFilterCount}
                      </span>
                    ) : null}
                  </button>
                </div>
              </div>

              {filtersOpen ? (
                <div
                  id="request-filters"
                  className="filter-panel"
                  role="group"
                  aria-label="Request filters"
                >
                  <label className="filter-field">
                    <span>Status</span>
                    <select
                      value={activeFilters.state}
                      onChange={(event) =>
                        setFilter("state", event.target.value as StateFilter)
                      }
                    >
                      <option value="all">All statuses</option>
                      {view === "inbox" ? (
                        <>
                          <option value="pending">Ready to answer</option>
                          <option value="conflict">Needs attention</option>
                        </>
                      ) : (
                        <>
                          <option value="answered">Answered</option>
                          <option value="cancelled">Cancelled</option>
                        </>
                      )}
                    </select>
                  </label>
                  <label className="filter-field">
                    <span>Priority</span>
                    <select
                      value={activeFilters.priority}
                      onChange={(event) =>
                        setFilter(
                          "priority",
                          event.target.value as PriorityFilter,
                        )
                      }
                    >
                      <option value="all">All priorities</option>
                      <option value="urgent">Urgent</option>
                      <option value="high">High</option>
                      <option value="normal">Normal</option>
                      <option value="low">Low</option>
                    </select>
                  </label>
                  <button
                    className="clear-filter-action"
                    disabled={!activeFilterCount}
                    type="button"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </button>
                </div>
              ) : null}

              {error ? (
                <div className="load-error" role="alert">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Could not read this collection</strong>
                    <p>{error}</p>
                  </div>
                  <button type="button" onClick={() => void load()}>
                    Try again
                  </button>
                </div>
              ) : loading ? (
                <LoadingRows />
              ) : visibleRequests.length ? (
                <div className="request-groups">
                  {requestGroups.map((group) => (
                    <section
                      key={group.id}
                      className={`request-group request-group-${group.id}`}
                      aria-labelledby={`${group.id}-heading`}
                    >
                      <header className="request-group-heading">
                        <div>
                          <h2 id={`${group.id}-heading`}>{group.label}</h2>
                          <p>{group.description}</p>
                        </div>
                        <span aria-label={`${group.requests.length} requests`}>
                          {group.requests.length}
                        </span>
                      </header>
                      <div className="request-list">
                        {group.requests.map((request) => (
                          <RequestRow
                            key={request.id}
                            request={request}
                            selected={request.id === selectedId}
                            onSelect={() => setSelectedId(request.id)}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <EmptyState
                  view={view}
                  hasFilters={Boolean(activeFilterCount)}
                  hasQuery={Boolean(query)}
                />
              )}
            </div>

            <aside className="detail-pane" aria-label="Request detail">
              {selected ? (
                <RequestDetail
                  request={selected}
                  onBack={() => setSelectedId(null)}
                  onReadAttachment={(attachment, signal) =>
                    repository.readAttachment(attachment, {
                      signal: linkedSignal(
                        signal,
                        foregroundRequest.current?.signal,
                      ),
                      timeoutMs: 120_000,
                    })
                  }
                  onRespond={async (payload) => {
                    responseRequest.current?.abort(
                      "A newer Pickle response started",
                    );
                    const controller = linkedController(
                      foregroundRequest.current?.signal,
                    );
                    responseRequest.current = controller;
                    const submission = await repository.respond(
                      selected,
                      payload,
                      { signal: controller.signal, timeoutMs: 20_000 },
                    );
                    if (submission.kind === "pending") {
                      setPendingResponseId(submission.requestId);
                      setPendingResponseIssue(null);
                      setToast("Response saved for confirmation");
                      return;
                    }
                    if (Capacitor.isNativePlatform()) {
                      await Haptics.notification({
                        type: NotificationType.Success,
                      }).catch(() => undefined);
                    }
                    setToast("Response recorded");
                    await load(true);
                  }}
                />
              ) : (
                <div className="detail-placeholder">
                  <img alt="" src={markUrl} />
                  <p>Select a request to read its context and respond.</p>
                </div>
              )}
            </aside>
          </section>
        )}
      </main>

      {toast ? (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      ) : null}
    </div>
  );
}

interface NavigationProps {
  view: View;
  inboxCount: number;
  onNavigate: (view: View) => void;
}

function Navigation({ view, inboxCount, onNavigate }: NavigationProps) {
  const items = [
    { id: "inbox" as const, label: "Inbox", icon: Inbox },
    { id: "history" as const, label: "History", icon: HistoryIcon },
    { id: "settings" as const, label: "More", icon: Settings },
  ];
  return (
    <nav className="primary-nav" aria-label="Primary">
      <div className="nav-brand">
        <img alt="" src={markUrl} />
        <span>Pickle</span>
      </div>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            aria-label={
              item.id === "inbox" && inboxCount
                ? `Inbox, ${inboxCount} unresolved`
                : item.label
            }
            aria-current={view === item.id ? "page" : undefined}
            className="nav-item"
            type="button"
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">
              <Icon size={20} />
              {item.id === "inbox" && inboxCount ? (
                <span aria-hidden="true" className="nav-count">
                  {Math.min(inboxCount, 99)}
                </span>
              ) : null}
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function RequestRow({
  request,
  selected,
  onSelect,
}: {
  request: PickleRequest;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      aria-current={selected ? "true" : undefined}
      className="request-row"
      type="button"
      onClick={onSelect}
    >
      <StateMark state={request.state} />
      <span className="request-row-copy">
        <span className="request-kicker">
          <span>{request.source || "Unknown source"}</span>
          <time dateTime={request.createdAt}>
            {relativeDate(request.createdAt)}
          </time>
        </span>
        <strong className="request-title">{request.title}</strong>
        <span className="request-message">
          {request.message || request.body || "No request message"}
        </span>
        <span className="request-metadata">
          {request.priority !== "normal" ? (
            <span className={`priority priority-${request.priority}`}>
              {request.priority}
            </span>
          ) : null}
          {request.dueAt ? (
            <span className="due-date">Due {relativeDate(request.dueAt)}</span>
          ) : null}
          {request.tags.slice(0, 2).map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="row-chevron" size={17} />
    </button>
  );
}

function StateMark({ state }: { state: PickleRequest["state"] }) {
  return (
    <span className={`state-mark state-${state}`}>
      {state === "answered" ? (
        <Check size={13} />
      ) : state === "conflict" ? (
        <AlertTriangle size={13} />
      ) : state === "cancelled" ? (
        <X size={13} />
      ) : (
        <Circle size={12} />
      )}
      <span className="sr-only">{state}</span>
    </span>
  );
}

function RequestDetail({
  request,
  onBack,
  onReadAttachment,
  onRespond,
}: {
  request: PickleRequest;
  onBack: () => void;
  onReadAttachment: (
    attachment: PickleAttachment,
    signal?: AbortSignal,
  ) => Promise<Blob>;
  onRespond: (payload: JsonObject) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function respond(payload: JsonObject) {
    setBusy(true);
    setError(null);
    try {
      await onRespond(payload);
    } catch (reason) {
      setError(issueMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="request-detail">
      <header className="detail-header">
        <button
          aria-label="Back to requests"
          className="back-action"
          type="button"
          onClick={onBack}
        >
          <ArrowLeft size={20} />
        </button>
        <span className={`state-label state-${request.state}`}>
          <StateMark state={request.state} />
          {request.state}
        </span>
      </header>

      <div className="detail-content">
        <div className="detail-title">
          <p className="eyebrow">{request.source}</p>
          <h2>{request.title}</h2>
          <p className="detail-message">{request.message}</p>
        </div>

        <dl className="detail-facts">
          <div>
            <dt>Received</dt>
            <dd>{fullDate(request.createdAt)}</dd>
          </div>
          {request.dueAt ? (
            <div>
              <dt>Due</dt>
              <dd>{fullDate(request.dueAt)}</dd>
            </div>
          ) : null}
          <div>
            <dt>Kind</dt>
            <dd>{request.kind}</dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>{request.priority}</dd>
          </div>
        </dl>

        {request.body ? (
          <section className="request-body" aria-label="Context">
            <p className="eyebrow">Context</p>
            <PlainMarkdown value={request.body} />
          </section>
        ) : null}

        {request.tags.length ? (
          <div className="tag-list" aria-label="Tags">
            {request.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        ) : null}

        {request.links.length ? (
          <section className="resource-list">
            <p className="eyebrow">Links</p>
            {request.links.map((link) =>
              link.url ? (
                <button
                  key={`${link.label}-${link.url}`}
                  type="button"
                  onClick={() => void openLink(link.url!)}
                >
                  <ExternalLink size={16} />
                  <span>{link.label}</span>
                </button>
              ) : (
                <div key={`${link.label}-${link.path}`}>
                  <ExternalLink size={16} />
                  <span>{link.label}</span>
                  <code>{link.path}</code>
                </div>
              ),
            )}
          </section>
        ) : null}

        {request.attachments.length ? (
          <section className="resource-list attachments">
            <p className="eyebrow">Attachments</p>
            {request.attachments.map((attachment) => (
              <AttachmentRow
                key={attachment.path}
                attachment={attachment}
                onRead={onReadAttachment}
              />
            ))}
          </section>
        ) : null}

        {request.state === "pending" ? (
          request.responseTypeDefinition ? (
            <ResponseForm busy={busy} request={request} onSubmit={respond} />
          ) : (
            <p className="inline-error">
              This collection does not provide the required response type.
            </p>
          )
        ) : request.state === "conflict" ? (
          <div className="state-notice state-notice-danger">
            <AlertTriangle size={19} />
            <div>
              <strong>Conflicting responses</strong>
              <p>
                This request has {request.responseCount} linked responses.
                Resolve them in the collection before responding here.
              </p>
            </div>
          </div>
        ) : request.response ? (
          <ResponseReceipt request={request} />
        ) : (
          <div className="state-notice">
            <X size={18} />
            <p>This request was cancelled without a response.</p>
          </div>
        )}
        {error ? (
          <p className="inline-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function AttachmentRow({
  attachment,
  onRead,
}: {
  attachment: PickleAttachment;
  onRead: (attachment: PickleAttachment, signal?: AbortSignal) => Promise<Blob>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readRequest = useRef<AbortController | null>(null);

  useEffect(
    () => () => readRequest.current?.abort("Attachment view closed"),
    [],
  );

  function open() {
    if (busy) return;
    const target = window.open("about:blank", "_blank");
    if (!target) {
      setError(
        "The attachment viewer was blocked. Allow pop-ups and try again.",
      );
      return;
    }
    try {
      target.opener = null;
    } catch {
      // Some WebViews expose a read-only opener.
    }
    readRequest.current?.abort("A newer attachment read started");
    const controller = new AbortController();
    readRequest.current = controller;
    setBusy(true);
    setError(null);
    void onRead(attachment, controller.signal)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        target.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      })
      .catch((reason) => {
        target.close();
        if (!controller.signal.aborted) setError(issueMessage(reason));
      })
      .finally(() => {
        if (readRequest.current === controller) {
          readRequest.current = null;
          setBusy(false);
        }
      });
  }

  return (
    <div className="attachment-entry">
      <button
        aria-busy={busy}
        aria-label={`Open ${attachment.filename}`}
        disabled={busy}
        type="button"
        onClick={open}
      >
        <Paperclip aria-hidden="true" size={16} />
        <span>
          {busy ? `Opening ${attachment.filename}…` : attachment.filename}
        </span>
        <code>{attachment.path}</code>
      </button>
      {error ? (
        <small className="attachment-error" role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}

function ResponseReceipt({ request }: { request: PickleRequest }) {
  const response = request.response!;
  return (
    <section className="response-receipt">
      <p className="eyebrow">Response recorded</p>
      <dl>
        {Object.entries(response.payload).map(([key, value]) => (
          <div key={key}>
            <dt>{key.replaceAll("_", " ")}</dt>
            <dd>{displayValue(value)}</dd>
          </div>
        ))}
        <div>
          <dt>Responder</dt>
          <dd>{response.responder}</dd>
        </div>
        {response.respondedAt ? (
          <div>
            <dt>Recorded</dt>
            <dd>{fullDate(response.respondedAt)}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function SettingsView({
  repository,
  onChangeCollection,
  onDisconnect,
}: {
  repository: PickleRepository;
  onChangeCollection?: () => void;
  onDisconnect: () => void;
}) {
  const [theme, setTheme] = useState<Theme>(() => currentTheme());
  const [notificationState, setNotificationState] = useState<NotificationState>(
    () => pickleNotifications.current(),
  );
  const [notificationError, setNotificationError] = useState<string | null>(
    null,
  );

  useEffect(() => pickleNotifications.onStatus(setNotificationState), []);

  function chooseTheme(next: Theme) {
    setTheme(next);
    localStorage.setItem("pickle.theme", next);
    applyTheme(next);
  }

  async function toggleNotifications() {
    setNotificationError(null);
    try {
      if (notificationState === "enabled") await pickleNotifications.disable();
      else await pickleNotifications.enable();
    } catch (reason) {
      setNotificationError(issueMessage(reason));
    }
  }

  return (
    <section className="settings-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Pickle</p>
          <h1>More</h1>
        </div>
      </header>

      <div className="settings-sections">
        <section className="settings-section">
          <div className="settings-heading">
            <p className="eyebrow">Appearance</p>
            <p>Follow the device or choose a fixed theme.</p>
          </div>
          <div className="theme-choices" role="group" aria-label="Theme">
            {[
              { id: "system" as const, label: "System", icon: Monitor },
              { id: "light" as const, label: "Light", icon: Sun },
              { id: "dark" as const, label: "Dark", icon: Moon },
            ].map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  aria-pressed={theme === option.id}
                  type="button"
                  onClick={() => chooseTheme(option.id)}
                >
                  <Icon size={18} />
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="settings-section setting-row">
          <div className="setting-icon">
            {notificationState === "enabled" ? (
              <Bell size={19} />
            ) : (
              <BellOff size={19} />
            )}
          </div>
          <div className="setting-copy">
            <strong>New request notifications</strong>
            <p>{notificationDescription(notificationState)}</p>
            {notificationError ? (
              <p className="inline-error">{notificationError}</p>
            ) : null}
          </div>
          {notificationState !== "unavailable" ? (
            <button
              className="outline-action compact-action"
              disabled={notificationState === "enabling"}
              type="button"
              onClick={() => void toggleNotifications()}
            >
              {notificationState === "enabled" ? "Turn off" : "Turn on"}
            </button>
          ) : null}
        </section>

        <section className="settings-section">
          <div className="settings-heading">
            <p className="eyebrow">Collection</p>
          </div>
          <dl className="connection-facts">
            <div>
              <dt>
                {repository.authority === "hosted" ? <Cloud /> : <Monitor />}
              </dt>
              <dd>
                <strong>{authorityLabel(repository.authority)}</strong>
                <span>{repository.collectionId}</span>
              </dd>
            </div>
          </dl>
          {onChangeCollection ? (
            <button
              className="disconnect-action"
              type="button"
              onClick={onChangeCollection}
            >
              <LogOut size={17} />
              Open another collection
            </button>
          ) : null}
          <button
            className="disconnect-action"
            type="button"
            onClick={onDisconnect}
          >
            <LogOut size={17} />
            Disconnect this collection
          </button>
        </section>

        <footer className="app-note">
          <img alt="" src={markUrl} />
          <p>
            Pickle 0.3.0
            <br />
            Records stay in your mdbase collection.
          </p>
        </footer>
      </div>
    </section>
  );
}

function LoadingRows() {
  return (
    <div className="loading-rows" aria-label="Loading requests">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="loading-row">
          <span />
          <div>
            <i />
            <i />
            <i />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  view,
  hasFilters,
  hasQuery,
}: {
  view: View;
  hasFilters: boolean;
  hasQuery: boolean;
}) {
  return (
    <div className="empty-state">
      {hasQuery || hasFilters ? <Search size={23} /> : <Check size={23} />}
      <h2>
        {hasQuery
          ? "No matching requests"
          : hasFilters
            ? "No requests match these filters"
            : view === "inbox"
              ? "No requests need a response"
              : "No request history yet"}
      </h2>
      <p>
        {hasQuery
          ? "Try a title, source, or tag."
          : hasFilters
            ? "Change or clear the active filters."
            : view === "inbox"
              ? "New agent requests will appear here."
              : "Answered and cancelled requests will appear here."}
      </p>
    </div>
  );
}

function PlainMarkdown({ value }: { value: string }) {
  return (
    <div className="plain-markdown">
      {value.split(/\n{2,}/).map((block, index) =>
        block.split("\n").every((line) => /^\s*[-*]\s+/.test(line)) ? (
          <ul key={index}>
            {block.split("\n").map((line) => (
              <li key={line}>{line.replace(/^\s*[-*]\s+/, "")}</li>
            ))}
          </ul>
        ) : (
          <p key={index}>{block.replace(/^#{1,6}\s+/, "")}</p>
        ),
      )}
    </div>
  );
}

function notificationDescription(state: NotificationState): string {
  if (state === "enabled")
    return "On. mdbase connect will signal new requests.";
  if (state === "enabling") return "Connecting this device…";
  if (state === "denied") return "Blocked by the device notification setting.";
  if (state === "error")
    return "Setup needs attention. Try turning it on again.";
  if (state === "unavailable") return "Available in the installed Android app.";
  return "Off. You can still refresh the inbox at any time.";
}

function authorityLabel(authority: PickleRepository["authority"]): string {
  if (authority === "hosted") return "Hosted by mdbase";
  if (authority === "connector") return "On a connected computer";
  return "Interface test collection";
}

function inboxSummary(pending: number, conflicts: number): string {
  if (!pending && !conflicts) return "No unresolved requests";
  return [
    pending ? `${pending} ready to answer` : "",
    conflicts
      ? `${conflicts} ${conflicts === 1 ? "needs" : "need"} attention`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function historySummary(answered: number, cancelled: number): string {
  if (!answered && !cancelled) return "No completed requests";
  return [
    answered ? `${answered} answered` : "",
    cancelled ? `${cancelled} cancelled` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function compareInboxRequests(
  left: PickleRequest,
  right: PickleRequest,
): number {
  if (left.state !== right.state) {
    if (left.state === "conflict") return -1;
    if (right.state === "conflict") return 1;
  }
  const priorities: Record<string, number> = {
    urgent: 4,
    high: 3,
    normal: 2,
    low: 1,
  };
  const priorityDifference =
    (priorities[right.priority] ?? 0) - (priorities[left.priority] ?? 0);
  if (priorityDifference) return priorityDifference;
  const leftDue = timestamp(left.dueAt, Number.POSITIVE_INFINITY);
  const rightDue = timestamp(right.dueAt, Number.POSITIVE_INFINITY);
  if (leftDue !== rightDue) return leftDue - rightDue;
  return timestamp(right.createdAt, 0) - timestamp(left.createdAt, 0);
}

function compareRequests(
  left: PickleRequest,
  right: PickleRequest,
  order: SortOrder,
): number {
  if (order === "urgency") return compareInboxRequests(left, right);
  if (order === "newest") {
    return timestamp(right.createdAt, 0) - timestamp(left.createdAt, 0);
  }
  if (order === "oldest") {
    return (
      timestamp(left.createdAt, Number.POSITIVE_INFINITY) -
      timestamp(right.createdAt, Number.POSITIVE_INFINITY)
    );
  }
  return (
    left.title.localeCompare(right.title, undefined, {
      numeric: true,
      sensitivity: "base",
    }) || timestamp(right.createdAt, 0) - timestamp(left.createdAt, 0)
  );
}

function sortDescription(order: SortOrder): string {
  if (order === "urgency") return "Highest urgency first";
  if (order === "newest") return "Newest first";
  if (order === "oldest") return "Oldest first";
  return "Title A–Z";
}

function timestamp(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = new Date(value).valueOf();
  return Number.isNaN(parsed) ? fallback : parsed;
}

function relativeDate(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const days = Math.round(
    (date.valueOf() - new Date().setHours(0, 0, 0, 0)) / 86_400_000,
  );
  if (days === 0)
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  if (days === -1) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(date);
}

function fullDate(value?: string): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

async function openLink(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) await Browser.open({ url });
  else window.open(url, "_blank", "noopener,noreferrer");
}

function issueMessage(reason: unknown): string {
  const problem = connectProblemFromError(reason);
  if (problem) return problemMessage(problem);
  return reason instanceof Error ? reason.message : String(reason);
}

function problemMessage(problem: ConnectProblem): string {
  if (problem.code === "timeout")
    return "The collection did not respond in time. Pickle will try again while the app is active.";
  if (
    problem.code === "connector_offline" ||
    problem.code === "relay_unavailable" ||
    problem.code === "hosted_provider_unavailable" ||
    problem.code === "temporarily_unavailable"
  )
    return "This collection is offline. Your collection remains the source of truth; try again when it is reachable.";
  if (
    problem.code === "connector_upgrade_required" ||
    problem.code === "transport_protocol_incompatible" ||
    problem.code === "capability_contract_incompatible"
  )
    return "This collection needs a compatible mdbase Connect update before Pickle can continue.";
  if (problem.code === "access_paused")
    return "Access to this collection is paused. Resume Pickle in mdbase Connect to continue.";
  if (problem.code === "operation_cancelled")
    return "This action paused when Pickle moved to the background.";
  if (problem.code === "invalid_operation_response")
    return "mdbase returned an invalid response. Update Pickle and mdbase Connect before trying again.";
  return problem.message;
}

function linkedController(parentSignal?: AbortSignal): AbortController {
  const controller = new AbortController();
  if (parentSignal?.aborted) controller.abort(parentSignal.reason);
  else
    parentSignal?.addEventListener(
      "abort",
      () => controller.abort(parentSignal.reason),
      { once: true },
    );
  return controller;
}

function linkedSignal(
  ...values: Array<AbortSignal | undefined>
): AbortSignal | undefined {
  const signals = values.filter(
    (signal): signal is AbortSignal => signal !== undefined,
  );
  if (!signals.length) return undefined;
  return signals.length === 1 ? signals[0] : AbortSignal.any(signals);
}
