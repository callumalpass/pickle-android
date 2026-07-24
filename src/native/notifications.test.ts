import { Capacitor } from "@capacitor/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => ({
  createChannel: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  addListener: vi.fn(),
}));

vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: push,
}));

import { pickleConnect } from "../cloud/connect";
import {
  PICKLE_NOTIFICATION_CHANNEL,
  PickleNotifications,
} from "./notifications";

describe("Pickle native notifications", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    push.createChannel.mockResolvedValue(undefined);
    push.register.mockResolvedValue(undefined);
    push.unregister.mockResolvedValue(undefined);
  });

  it("creates the Android channel and registers the FCM token with mdbase", async () => {
    const callbacks = new Map<string, (value: never) => void>();
    push.checkPermissions.mockResolvedValue({ receive: "granted" });
    push.addListener.mockImplementation(
      (eventName: string, callback: (value: never) => void) => {
        callbacks.set(eventName, callback);
        return Promise.resolve({ remove: vi.fn() });
      },
    );
    const register = vi
      .spyOn(pickleConnect, "registerNativeNotifications")
      .mockResolvedValue({
        channelId: "channel-1",
        installationId: "installation-1",
        transport: "fcm",
        criteria: ["pickle.request.created"],
      });
    const notifications = new PickleNotifications();

    await notifications.start(vi.fn());
    await notifications.enable();
    callbacks.get("registration")?.({ value: "fcm-token" } as never);
    await vi.waitFor(() => expect(register).toHaveBeenCalled());

    expect(push.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: PICKLE_NOTIFICATION_CHANNEL,
        importance: 4,
      }),
    );
    expect(register).toHaveBeenCalledWith({
      token: "fcm-token",
      criteria: ["pickle.request.created"],
    });
    expect(notifications.current()).toBe("enabled");
  });

  it("refreshes only for a valid opaque Pickle signal", async () => {
    const callbacks = new Map<string, (value: never) => void>();
    push.checkPermissions.mockResolvedValue({ receive: "prompt" });
    push.addListener.mockImplementation(
      (eventName: string, callback: (value: never) => void) => {
        callbacks.set(eventName, callback);
        return Promise.resolve({ remove: vi.fn() });
      },
    );
    const refresh = vi.fn();
    const notifications = new PickleNotifications();
    await notifications.start(refresh);

    callbacks.get("pushNotificationReceived")?.({
      data: { request_path: "/private/collection/requests/secret.md" },
    } as never);
    expect(refresh).not.toHaveBeenCalled();

    callbacks.get("pushNotificationReceived")?.({
      data: {
        type: "mdbase.notification",
        version: "1",
        signal_id: "signal-1",
        criterion_id: "pickle.request.created",
        cursor: "42",
      },
    } as never);
    expect(refresh).toHaveBeenCalledOnce();
  });
});
