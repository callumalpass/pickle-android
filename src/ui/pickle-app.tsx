import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { Haptics, NotificationType } from "@capacitor/haptics";
import type { JsonObject } from "@mdbase/connect";
import type { PickleRequest } from "@mdbase/pickle";
import {
  AlertTriangle,
  ArrowLeft,
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
  Sun,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import markUrl from "../assets/pickle-mark.svg";
import type { PickleRepository } from "../domain/repository";
import {
  pickleNotifications,
  type NotificationState,
} from "../native/notifications";
import { ResponseForm } from "./response-form";
import { applyTheme, currentTheme, type Theme } from "./theme";

type View = "inbox" | "history" | "settings";

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const loadSequence = useRef(0);

  const load = useCallback(
    async (quiet = false) => {
      const sequence = ++loadSequence.current;
      if (!quiet) setRefreshing(true);
      try {
        const current = await repository.list();
        if (sequence !== loadSequence.current) return;
        setRequests(current);
        setError(null);
      } catch (reason) {
        if (sequence === loadSequence.current) setError(message(reason));
      } finally {
        if (sequence === loadSequence.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [repository],
  );

  useEffect(() => {
    queueMicrotask(() => void load(true));
    const unsubscribe = repository.subscribe(() => void load(true));
    const visibility = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", visibility);
    const appState = Capacitor.isNativePlatform()
      ? CapacitorApp.addListener("appStateChange", ({ isActive }) => {
          if (isActive) void load(true);
        })
      : null;
    void pickleNotifications.start(() => {
      setView("inbox");
      setSelectedId(null);
      setToast("New request received");
      void load(true);
    });
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", visibility);
      void appState?.then((handle) => handle.remove());
    };
  }, [load, repository]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener("backButton", () => {
      if (selectedId) setSelectedId(null);
      else if (view !== "inbox") setView("inbox");
      else void CapacitorApp.minimizeApp();
    });
    return () => void listener.then((handle) => handle.remove());
  }, [selectedId, view]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3_500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const visibleRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return requests.filter((request) => {
      const belongs =
        view === "inbox"
          ? request.state === "pending" || request.state === "conflict"
          : view === "history"
            ? request.state !== "pending"
            : false;
      return (
        belongs &&
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
  }, [query, requests, view]);
  const selected =
    requests.find((request) => request.id === selectedId) ?? null;
  const pendingCount = requests.filter(
    (request) => request.state === "pending",
  ).length;

  function navigate(next: View) {
    setView(next);
    setSelectedId(null);
    setQuery("");
  }

  return (
    <div className={`app-frame ${selected ? "has-detail" : ""}`}>
      <Navigation
        pendingCount={pendingCount}
        view={view}
        onNavigate={navigate}
      />

      <main className="workspace">
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
                    {view === "inbox" ? "Decision inbox" : "Record"}
                  </p>
                  <h1>{view === "inbox" ? "Requests" : "History"}</h1>
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
                <div className="request-list">
                  {visibleRequests.map((request) => (
                    <RequestRow
                      key={request.id}
                      request={request}
                      selected={request.id === selectedId}
                      onSelect={() => setSelectedId(request.id)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState view={view} hasQuery={Boolean(query)} />
              )}
            </div>

            <aside className="detail-pane" aria-label="Request detail">
              {selected ? (
                <RequestDetail
                  request={selected}
                  onBack={() => setSelectedId(null)}
                  onRespond={async (payload) => {
                    await repository.respond(selected, payload);
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
  pendingCount: number;
  onNavigate: (view: View) => void;
}

function Navigation({ view, pendingCount, onNavigate }: NavigationProps) {
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
            aria-current={view === item.id ? "page" : undefined}
            className="nav-item"
            type="button"
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">
              <Icon size={20} />
              {item.id === "inbox" && pendingCount ? (
                <span className="nav-count">{Math.min(pendingCount, 99)}</span>
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
        <span className="request-row-topline">
          <strong>{request.title}</strong>
          <time dateTime={request.createdAt}>
            {relativeDate(request.createdAt)}
          </time>
        </span>
        <span className="request-message">
          {request.message || request.body || "No request message"}
        </span>
        <span className="request-metadata">
          <span>{request.source}</span>
          {request.priority !== "normal" ? (
            <span className={`priority priority-${request.priority}`}>
              {request.priority}
            </span>
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
  onRespond,
}: {
  request: PickleRequest;
  onBack: () => void;
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
      setError(message(reason));
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
              <div key={attachment.path}>
                <Paperclip size={16} />
                <span>{attachment.filename}</span>
                <code>{attachment.path}</code>
              </div>
            ))}
            <small>
              Attachment previews will appear when mdbase binary reads are
              available.
            </small>
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
      setNotificationError(message(reason));
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
              <dt>{repository.route === "hosted" ? <Cloud /> : <Monitor />}</dt>
              <dd>
                <strong>{routeLabel(repository.route)}</strong>
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

function EmptyState({ view, hasQuery }: { view: View; hasQuery: boolean }) {
  return (
    <div className="empty-state">
      {hasQuery ? <Search size={23} /> : <Check size={23} />}
      <h2>
        {hasQuery
          ? "No matching requests"
          : view === "inbox"
            ? "No requests need a response"
            : "No request history yet"}
      </h2>
      <p>
        {hasQuery
          ? "Try a title, source, or tag."
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

function routeLabel(route: PickleRepository["route"]): string {
  if (route === "hosted") return "mdbase cloud";
  if (route === "direct") return "Local mdbase connector";
  if (route === "relay") return "mdbase connect relay";
  return "Interface test collection";
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

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
