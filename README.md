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

Publish the current working tree to the permanent Cloudflare Pages development
surface with:

```bash
pnpm dlx wrangler@4.114.0 login # first use only
pnpm deploy:dev
```

This builds a web-only manifest for
<https://staging.pickle-9zb.pages.dev>, connects it to the hosted staging
Connect service and the isolated connector on `127.0.0.1:28486`, deploys only
the Cloudflare `staging` branch, and verifies the live application. It does not
change the GitHub Pages deployment or Cloudflare's production branch. Start the
matching local connector from the sibling `mdbase-connect` checkout with
`pnpm dev:desktop:staging`.

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

Pickle stores Markdown attachments as typed `pickle_attachment` records and
reads them through the ordinary record capability. Binary attachments remain
files and use the scoped mdbase Connect file capability. Attachment rows load
on demand and render images, PDFs, and Markdown inline in the request inspector.
The application declaration limits file listing and reading to the collection's
`attachments` folder.
