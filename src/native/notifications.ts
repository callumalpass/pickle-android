import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import {
  PushNotifications,
  type PermissionStatus,
} from "@capacitor/push-notifications";
import { parseMdbaseNativeNotificationData } from "@mdbase/connect";
import type { MdbaseConnection } from "@mdbase/connect";
import { PICKLE_NOTIFICATION_CRITERION } from "@mdbase/pickle";

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
export const PICKLE_NOTIFICATION_CHANNEL = "mdbase-updates";

export class PickleNotifications {
  private listeners: PluginListenerHandle[] = [];
  private statusListeners = new Set<(state: NotificationState) => void>();
  private signalListener: (() => void) | null = null;
  private started = false;
  private readonly testMode =
    import.meta.env.VITE_PICKLE_NOTIFICATION_TEST === "1";
  private state: NotificationState = Capacitor.isNativePlatform()
    ? "off"
    : "unavailable";

  constructor(
    private readonly connection: () => Pick<
      MdbaseConnection,
      "registerNativeNotifications" | "unregisterNativeNotifications"
    > | null = activePickleConnection,
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
    this.setState("off");
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
    try {
      if (this.testMode) {
        localStorage.setItem("pickle.test.fcm_token", token);
        this.setState("enabled");
        return;
      }
      const connection = this.connection();
      if (!connection) throw new Error("Pickle is not connected.");
      await connection.registerNativeNotifications({
        token,
        criteria: [PICKLE_NOTIFICATION_CRITERION],
      });
      this.setState("enabled");
    } catch {
      this.setState("error");
    }
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
