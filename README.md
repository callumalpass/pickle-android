# Pickle

Pickle is a quiet mobile inbox for durable agent requests and human decisions.
The web-first application is packaged for Android with Capacitor and uses
mdbase connect for authorization, collection operations, live updates, and
managed notifications.

There is no Pickle server URL, bearer-token field, Tailscale connection,
foreground polling service, local collection, or offline record replica.
Request and response Markdown stays in the selected mdbase collection.

## Development

```bash
pnpm install
pnpm verify
pnpm cap:sync
```

Use `VITE_MDBASE_CONNECT_URL` and `PICKLE_APP_URL` to point development builds
at a local mdbase connect control plane and manifest origin.

The checked-in mdbase packages are deterministic snapshots from the sibling
`mdbase-connect` workspace. Refresh them after compatible protocol changes.

## Web deployment

Pushes to `main` deploy the web-first app to
`https://callumalpass.github.io/pickle-android/` through GitHub Pages. The
deployment build sets the Pages base path and generates a web-only application
manifest for that origin. Android builds keep the default
`https://pickle.mdbase.dev` application identity and native callback.

The native smoke test uses the fixture collection, a connected Android
emulator, Java 21, and the current gcloud account:

```bash
VITE_PICKLE_FIXTURE=1 VITE_PICKLE_NOTIFICATION_TEST=1 pnpm cap:sync
(cd android && ./gradlew test lint assembleDebug)
pnpm test:android-smoke
pnpm cap:sync
```

## Notifications

Pickle declares `pickle.request.created` in its bundled version 3 mdbase
application declaration. The collection authority evaluates new-record events and Connect
sends an opaque FCM wake-up signal. The signal has no request path or content;
the app refreshes the selected collection after opening.

The checked-in Firebase configuration binds `com.callumalpass.pickle` to the
same narrowly authorized sender project used by mdbase Connect. The live
Android smoke test registers a real token, creates `mdbase-updates`, sends an
opaque FCM v1 signal, and verifies the foreground refresh.

## Attachments

Attachment paths are displayed as part of the durable request record. Binary
preview and download controls can be added when mdbase connect exposes binary
collection operations without changing the Pickle protocol or app structure.
