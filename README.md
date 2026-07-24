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
pnpm test:android-smoke
```

Use `VITE_MDBASE_CONNECT_URL` and `PICKLE_APP_URL` to point development builds
at a local mdbase connect control plane and manifest origin.

The checked-in mdbase packages are deterministic snapshots from the sibling
`mdbase-connect` workspace. Refresh them after compatible protocol changes.

## Notifications

Pickle declares `pickle.request.created` in its version 2 mdbase application
manifest. The collection authority evaluates new-record events and Connect
sends an opaque FCM wake-up signal. The signal has no request path or content;
the app refreshes the selected collection after opening.

Native FCM registration requires `android/app/google-services.json`. Keep that
public Firebase configuration out of ad-hoc development builds until the
Firebase Android app has been selected.

## Attachments

Attachment paths are displayed as part of the durable request record. Binary
preview and download controls can be added when mdbase connect exposes binary
collection operations without changing the Pickle protocol or app structure.
