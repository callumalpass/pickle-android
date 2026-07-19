# Pickle Android

Native Android client for the local Pickle inbox.

The app connects to the Rust Pickle server over a private URL, usually Tailscale,
and renders request response forms from each request's mdbase
`response_type_definition`. It no longer depends on the old JSON Schema request
field.

## Development

```bash
./gradlew testDebugUnitTest
./gradlew assembleDebug
./gradlew lintDebug
```

For an emulator, use:

```text
http://10.0.2.2:8787
```

For a phone on Tailscale, use the host Tailnet name or Tailscale IP, plus the
token from:

```bash
pickle token
```

The optional collection setting maps to the server's `X-Pickle-Collection`
header. Leave it blank to use the server default, or set it to a configured
collection such as `tasknotes`.

## Response Forms

Pickle request JSON includes:

```json
{
  "response_type": "pickle_response_approval",
  "response_type_definition": {
    "kind": "mdbase.type",
    "name": "pickle_response_approval",
    "version": 1,
    "schema": {
      "dialect": "json-schema-2020-12",
      "value": {
        "type": "object",
        "properties": {}
      }
    }
  }
}
```

The app reads v0.3 JSON Schema properties, required fields, collection links,
and lifecycle-managed fields. It also accepts the v0.2 `fields` grammar while
collections are migrated. System fields such as `request`, `responded_at`, and
`responder` are hidden; supported controls include strings, enums, booleans,
numbers, objects, and lists.
