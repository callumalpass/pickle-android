import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import {
  PushNotifications,
  type PermissionStatus,
} from "@capacitor/push-notifications";
import { parseMdbaseNativeNotificationData } from "@mdbase-dev/connect";
import type { MdbaseConnection } from "@mdbase-dev/connect";
import { PICKLE_NOTIFICATION_CRITERION } from "@mdbase-dev/pickle";

import { activePickleConnection } from "../cloud/connect";

export type NotificationState =
  | "unavailable"
  | "off"
  | "prompt"
  | "enabling"
  | "enabled"
  | "denied"
  | "error";

const PREFERENCE_KEY = "pickle.notifications.enabled";
const TOKEN_KEY = "pickle.notifications.fcm_token";
export const PICKLE_NOTIFICATION_CHANNEL = "mdbase-updates";

type NotificationConnection = Pick<
  MdbaseConnection,
  | "collectionId"
  | "registerNativeNotifications"
  | "unregisterNativeNotifications"
>;

export class PickleNotifications {
  private listeners: PluginListenerHandle[] = [];
  private statusListeners = new Set<(state: NotificationState) => void>();
  private signalListener: (() => void) | null = null;
  private boundConnection: NotificationConnection | null | undefined;
  private bindSequence = 0;
  private token: string | null = null;
  private started = false;
  private readonly testMode =
    import.meta.env.VITE_PICKLE_NOTIFICATION_TEST === "1";
  private state: NotificationState = Capacitor.isNativePlatform()
    ? "off"
    : "unavailable";

  constructor(
    private readonly selectedConnection: () => NotificationConnection | null = activePickleConnection,
  ) {}

  current(): NotificationState {
    return this.state;
  }

  onStatus(listener: (state: NotificationState) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.state);
    return () => this.statusListeners.delete(listener);
  }

  async start(onSignal: () => void): Promise<void> {
    this.signalListener = onSignal;
    if (!Capacitor.isNativePlatform() || this.started) return;
    this.started = true;
    await PushNotifications.createChannel({
      id: PICKLE_NOTIFICATION_CHANNEL,
      name: "Pickle requests",
      description: "New requests that need your response",
      importance: 4,
      visibility: 1,
      vibration: true,
    });
    this.listeners = await Promise.all([
      PushNotifications.addListener("registration", ({ value }) => {
        void this.registerWithConnect(value);
      }),
      PushNotifications.addListener("registrationError", () => {
        this.setState("error");
      }),
      PushNotifications.addListener("pushNotificationReceived", ({ data }) => {
        if (validSignal(data)) this.signalListener?.();
      }),
      PushNotifications.addListener(
        "pushNotificationActionPerformed",
        ({ notification }) => {
          if (validSignal(notification.data)) this.signalListener?.();
        },
      ),
    ]);
    const permission = await PushNotifications.checkPermissions();
    if (permission.receive === "denied") {
      this.setState("denied");
    } else if (localStorage.getItem(PREFERENCE_KEY) === "true") {
      await this.register(permission);
    } else {
      this.setState(permission.receive === "prompt" ? "prompt" : "off");
    }
  }

  async enable(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    this.setState("enabling");
    localStorage.setItem(PREFERENCE_KEY, "true");
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === "prompt") {
      permission = await PushNotifications.requestPermissions();
    }
    await this.register(permission);
  }

  async disable(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    await this.connection()?.unregisterNativeNotifications();
    await PushNotifications.unregister();
    localStorage.setItem(PREFERENCE_KEY, "false");
    localStorage.removeItem(TOKEN_KEY);
    this.token = null;
    this.setState("off");
  }

  async bindConnection(
    connection: NotificationConnection | null,
  ): Promise<void> {
    const previous =
      this.boundConnection === undefined
        ? this.selectedConnection()
        : this.boundConnection;
    this.boundConnection = connection;
    if (previous?.collectionId === connection?.collectionId) return;

    const sequence = ++this.bindSequence;
    if (!Capacitor.isNativePlatform()) return;
    if (localStorage.getItem(PREFERENCE_KEY) !== "true") return;

    await previous?.unregisterNativeNotifications().catch(() => undefined);
    if (sequence !== this.bindSequence) return;
    if (!connection) {
      this.setState("off");
      return;
    }

    const token = this.token ?? localStorage.getItem(TOKEN_KEY);
    if (!token) {
      this.setState("enabling");
      await PushNotifications.register();
      return;
    }
    try {
      await this.registerConnection(connection, token);
    } catch {
      if (sequence === this.bindSequence) this.setState("error");
    }
  }

  async stop(): Promise<void> {
    await Promise.all(this.listeners.map((listener) => listener.remove()));
    this.listeners = [];
    this.started = false;
  }

  private async register(permission: PermissionStatus): Promise<void> {
    if (permission.receive !== "granted") {
      localStorage.setItem(PREFERENCE_KEY, "false");
      this.setState(permission.receive === "denied" ? "denied" : "prompt");
      return;
    }
    await PushNotifications.register();
  }

  private async registerWithConnect(token: string): Promise<void> {
    this.token = token;
    localStorage.setItem(TOKEN_KEY, token);
    try {
      if (this.testMode) {
        localStorage.setItem("pickle.test.fcm_token", token);
        this.setState("enabled");
        return;
      }
      const connection = this.connection();
      if (!connection) throw new Error("Pickle is not connected.");
      await this.registerConnection(connection, token);
    } catch {
      this.setState("error");
    }
  }

  private connection(): NotificationConnection | null {
    return this.boundConnection === undefined
      ? this.selectedConnection()
      : this.boundConnection;
  }

  private async registerConnection(
    connection: NotificationConnection,
    token: string,
  ): Promise<void> {
    await connection.registerNativeNotifications({
      token,
      criteria: [PICKLE_NOTIFICATION_CRITERION],
    });
    this.setState("enabled");
  }

  private setState(state: NotificationState): void {
    this.state = state;
    this.statusListeners.forEach((listener) => listener(state));
  }
}

function validSignal(data: unknown): boolean {
  try {
    return (
      parseMdbaseNativeNotificationData(data).criterion_id ===
      PICKLE_NOTIFICATION_CRITERION
    );
  } catch {
    return false;
  }
}

export const pickleNotifications = new PickleNotifications();
