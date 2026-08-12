import { execFileSync } from "node:child_process";

const PACKAGE = "com.callumalpass.pickle";
const FIREBASE_PROJECT = "tasknotes-462906";
const DEVTOOLS_PORT = 9238;
const APK = "android/app/build/outputs/apk/debug/app-debug.apk";

function adb(...args) {
  return execFileSync("adb", args, { encoding: "utf8" }).trim();
}

function launch() {
  adb("shell", "am", "force-stop", PACKAGE);
  adb(
    "shell",
    "monkey",
    "-p",
    PACKAGE,
    "-c",
    "android.intent.category.LAUNCHER",
    "1",
  );
}

async function main() {
  const devices = adb("devices")
    .split("\n")
    .slice(1)
    .filter((line) => line.endsWith("\tdevice"));
  if (devices.length !== 1)
    throw new Error(`Expected one Android device; found ${devices.length}.`);

  adb("install", "-r", APK);
  adb("shell", "pm", "clear", PACKAGE);
  adb("shell", "pm", "grant", PACKAGE, "android.permission.POST_NOTIFICATIONS");
  launch();

  let devtools;
  try {
    devtools = await connectToWebView();
    await waitFor(
      () => devtools.hasText("Approve production deployment"),
      "the native Pickle inbox",
      20_000,
    );
    await devtools.clickButton("Approve production deployment");
    await waitFor(
      () => devtools.hasText("release-report.pdf"),
      "the native request detail",
    );
    await devtools.fillLabel("Comment", "Approved by the Android smoke test.");
    await devtools.clickButton("Approve", true);
    await waitFor(
      () => devtools.hasText("Approved by the Android smoke test."),
      "the native response receipt",
    );

    adb("shell", "input", "keyevent", "KEYCODE_BACK");
    await waitFor(() => devtools.hasText("Inbox"), "hardware Back to inbox");
    if (await devtools.hasText("Approve production deployment"))
      throw new Error("Answered request remained in the pending inbox.");

    await devtools.clickButton("More", true);
    await waitFor(
      () => devtools.hasText("New request notifications"),
      "the native settings screen",
    );
    await waitFor(
      () => adb("shell", "dumpsys", "notification").includes("mdbase-updates"),
      "the mdbase Android notification channel",
    );
    await devtools.clickButton("Turn on", true);
    const fcmToken = await waitFor(
      () => devtools.evaluate('localStorage.getItem("pickle.test.fcm_token")'),
      "the Firebase registration token",
      30_000,
    );
    await sendNotification(fcmToken);
    await waitFor(
      () => devtools.hasText("New request received"),
      "the foreground mdbase notification signal",
      20_000,
    );

    launch();
    devtools.close();
    devtools = await connectToWebView();
    await waitFor(
      () => devtools.hasText("Inbox"),
      "the inbox after process restart",
      20_000,
    );

    console.log(
      "Android smoke passed: response flow, hardware Back, notification channel, FCM registration, live opaque push, and process restart.",
    );
  } finally {
    devtools?.close();
    try {
      adb("forward", "--remove", `tcp:${DEVTOOLS_PORT}`);
    } catch {
      // No forwarding existed.
    }
    adb("shell", "am", "force-stop", PACKAGE);
  }
}

async function sendNotification(token) {
  const accessToken = execFileSync("gcloud", ["auth", "print-access-token"], {
    encoding: "utf8",
  }).trim();
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT}/messages:send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        "x-goog-user-project": FIREBASE_PROJECT,
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title: "New Pickle request",
            body: "Open Pickle to review the latest request.",
          },
          data: {
            type: "mdbase.notification",
            version: "1",
            signal_id: `android-smoke-${Date.now()}`,
            criterion_id: "pickle.request.created",
            cursor: "smoke-1",
          },
          android: {
            priority: "high",
            notification: {
              channel_id: "mdbase-updates",
              tag: "pickle-requests",
            },
          },
        },
      }),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`FCM send failed (${response.status}): ${body}`);
  }
}

async function waitFor(check, description, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function connectToWebView() {
  const processId = await waitFor(() => {
    try {
      return adb("shell", "pidof", PACKAGE).split(/\s+/)[0] || undefined;
    } catch {
      return undefined;
    }
  }, "the Pickle process");
  const socket = await waitFor(() => {
    const name = `webview_devtools_remote_${processId}`;
    return adb("shell", "cat", "/proc/net/unix").includes(`@${name}`)
      ? name
      : undefined;
  }, "the Android WebView debugger");
  adb("forward", `tcp:${DEVTOOLS_PORT}`, `localabstract:${socket}`);
  const target = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/list`);
    if (!response.ok) return undefined;
    const targets = await response.json();
    return targets.find((candidate) => candidate.type === "page");
  }, "the Pickle WebView page");
  return new DevtoolsSession(target.webSocketDebuggerUrl);
}

class DevtoolsSession {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.opened = new Promise((resolve, reject) => {
      this.socket = new WebSocket(url);
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
      this.socket.addEventListener("message", (event) => {
        const value = JSON.parse(event.data);
        if (!value.id) return;
        const pending = this.pending.get(value.id);
        if (!pending) return;
        this.pending.delete(value.id);
        if (value.error) pending.reject(new Error(value.error.message));
        else pending.resolve(value.result);
      });
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.text ?? "WebView evaluation failed.",
      );
    return result.result.value;
  }

  hasText(text) {
    return this.evaluate(
      `document.body?.innerText.includes(${JSON.stringify(text)})`,
    );
  }

  clickButton(text, exact = false) {
    return this.evaluate(`(() => {
      const expected = ${JSON.stringify(text)};
      const button = [...document.querySelectorAll("button")].find((candidate) =>
        ${
          exact
            ? "candidate.innerText.trim() === expected"
            : "candidate.innerText.includes(expected)"
        }
      );
      if (!button) throw new Error("Button not found: " + expected);
      button.click();
      return true;
    })()`);
  }

  fillLabel(text, value) {
    return this.evaluate(`(() => {
      const expected = ${JSON.stringify(text)};
      const label = [...document.querySelectorAll("label")].find((candidate) =>
        candidate.innerText.includes(expected)
      );
      const input = label?.querySelector("input, textarea, select");
      if (!input) throw new Error("Field not found: " + expected);
      const prototype = input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(
        input,
        ${JSON.stringify(value)}
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
  }

  async send(method, params = {}) {
    await this.opened;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket?.close();
  }
}

await main();
