# Pickle application

Read `PRODUCT.md` and `DESIGN.md` before changing user-facing behaviour or
visuals.

The application is web-first and packaged for Android through Capacitor. Keep
all mdbase semantics in `@mdbase-dev/pickle`; UI code must not implement a parallel
request lifecycle or direct filesystem protocol.

Use mdbase connect for every collection operation and notification
registration. Do not add a Pickle HTTP server URL, bearer token, direct
Tailscale access, a foreground polling service, or a local record replica.

Keep native and browser callback routes compatible. Notification payloads are
opaque wake-up hints and must never be treated as request data.

Run `pnpm verify`, `pnpm test:e2e`, and `pnpm test:android-smoke` before
handing off changes that affect a user flow.
