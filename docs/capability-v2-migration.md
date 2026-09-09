# Capability contract v2 migration — release held

Production intent includes this consumer, but do not publish web assets or
install/release Android builds until the qualified rollout sequence completes:

1. Deploy beta.95 readers, retaining fresh v1 issuance only.
2. Qualify and deploy the subsequent v2 writer with beta.95 as rollback predecessor.
3. Complete consumer acceptance and release Pickle through its supported paths.

SDK support alone does not permit v2 issuance on a beta.95 server. No consumer
commit, push, browser/device operation or deployment has occurred in this work.

## Preserved authority

The outer `manifest_version` remains 1; capability contract version is 2.
Required groups are exactly `collection.read` and `records.create`. Pickle
creates linked responses and must not request record edit/delete or offline
replica authority. No optional groups or setup/file/notification aliases are used.

Attachments retain `selected_folders: [attachments]` with independently declared
`files.required: [list, read]`. Contracts, embedded type-pack provisions/digests,
collection access and notification criteria are preserved. Setup authority is
derived from provisions by the SDK, not a capability alias.

Notifications remain explicit native opt-in. OS permission alone does not trigger
registration. Managed FCM registration/unregistration does not require Connect
timers, and UI rendering is not background scheduling; no `background.schedule`
permission is added. File access remains provider-neutral and folder-confined.

## Current beta96 v2 candidate provenance

The active SDK pins now use authentic `0.1.0-beta.96` SHA-qualified development
packs from committed product source
`43c3dedd61bb44ca497e854702d87ef2c175b954`, supplied by the parent at
`/home/calluma/projects/mdbase-connect/.ops/artifacts/v2-sdk-43c3dedd61bb`.
The parent generated these with `pack-consumer-sdk.mjs` for phase
`v2-enablement`, supporting capability contracts `[1, 2]`.
These are **not signed Q artifacts or an npm publication**.

The existing vendor subset is preserved. Every copied archive was checked against
the supplied manifest's byte length and SHA-512, and its package version was
checked as `0.1.0-beta.96`. `vendor/mdbase-connect-sdk.json` records the new
revision, filenames, sizes and SHA-512 values. Dependency and transitive override
pins are updated together; package-manager installation regenerates the lockfile.
No archive is patched or relabelled and no package dependency is added.

The beta95 account below is historical, superseded for active pins by this
candidate. Release remains held: the parent owns rollout ordering, live/native
acceptance, and repinning immutable final release artifacts before consumer
publication if required. Existing v1 sessions remain retained; updated consent
requires explicit reauthorization without silent conversion or fallback.

## Historical beta95 provenance

The five Connect/protocol/devkit/testing/Pickle packages are genuine beta.95
artifacts produced by the supported product `package:consumer` command from clean
source `408c67bc10f128e0833f0da62cb3efb9d94657d7`. Dependencies, workspace
overrides, `pnpm-lock.yaml` and `vendor/mdbase-connect-sdk.json` are updated
together. The metadata records exact sizes and SHA-512 hashes; unrelated
dependency versions are preserved. Sync is not required by this dependency graph.

These are source-bound local builds, not signed images or published npm release
evidence. No old artifact identity was reused or vendor code patched. Existing
v1 grants must use explicit reauthorization where required, never silent
permission expansion or a v2-to-v1 fallback.

## Parent verification

With Node 24.19.0, final frozen installation and full `pnpm verify` passed:
formatting, typechecking, lint, two manifest-generator tests, all 49 unit tests,
strict installed-protocol manifest validation and production build.

Real-SDK tests evaluate the exact groups and inadequate retained operation sets.
A signed-request test uses the SDK's real in-memory key and identity stores in
the non-browser fixture; no browser IndexedDB is assumed. It asserts exact v2
semantics, operation union, provision-derived setup, list/read attachment scope,
denial propagation, no navigation and no created connection. Transport responses
are fixtures, not live authorization evidence. The navigation fixture provides
actual v2 file scope, full collection scope and required contract descriptions.

## Remaining acceptance

Parent-owned isolated browser/Connect/native acceptance must cover real consent
denial/revocation, retained v1 grants under the same application identity,
reconnect/selection, initial provision setup, attachment confinement, response
creation without edit/delete, and explicit notification enable/disable and
collection rebinding without timer grants. No Android store publication path is
claimed; establish the supported release/install route before using it.

Local validation is not signed release acceptance or evidence of a deployed
v2-writer server. Do not trigger auto-deploying main before the release gates.

## Beta96 candidate integration results — 2026-09-09

- Formatting, typecheck and lint passed in `pnpm verify`.
- `pnpm exec vitest run`: **8 files / 49 tests passed**; all original cases retained.
- `pnpm build`: passed, including installed manifest validation.
- Full `pnpm verify` / `pnpm test` remains failed at the manifest-generator tests.
  Diagnostic execution with `node --test --test-isolation=none` exposes **2 failed
  / 0 passed** generator tests: `execFileSync`/`spawnSync` reports `EPERM` with empty
  output. The unit suite and build were therefore run separately.
- pnpm 11's pre-run state check requires the same `CI=true` and writable store
  configuration as installation. Final runs use `pnpm_config_store_dir` and
  `pnpm_config_verify_deps_before_run=error`, so mismatches fail rather than
  silently reinstall. A later frozen reinstall attempt reached supply-chain
  policy revalidation and failed registry lookup (`EAI_AGAIN`); it was stopped.
  No audit waiver was used. Initial offline candidate installation succeeded with
  `--prod=false`; dev tools remain installed and were used by the final checks.

The installed beta96 SDK checks `/health` for
`application-authorization-v2-issuance` before fresh v2 authorization. TaskNotes,
Workouts and Pickle hermetic transport fixtures now model that endpoint; they
still assert exact signed intent and denial. Workouts additionally verifies a
v1-only server returns `capability_contract_incompatible` without an authorization
request or navigation. No production application source, authority declaration,
retained-session migration, or native route changed in this integration pass.

All checks used Node `v24.19.0` via the requested PATH. Initial cache writes
failed with `EROFS`; existing package-manager caches were copied into the private
log directory under `/tmp`, then offline installation succeeded in all four
worktrees (`pnpm install --no-frozen-lockfile --prod=false --offline --store-dir …`
or `npm install --include=dev --offline --cache …`). Lockfiles were regenerated
by package managers, with formatting restored where required. Every unrelated
package/snapshot lock entry is structurally unchanged from the starting draft.
No dependencies, audit waivers or timeout increases were introduced.

These are local fixture/unit results, not live browser, daemon, or native
acceptance. Parent acceptance still needs fresh registration and explicit v1
reauthorization, retained valid v1 grants, denial/revocation and recovery, exact
contract/setup and readonly view behavior, typed records and revision guards,
TaskNotes/Planner saved views, Workouts timers, and actual opt-in notifications
and opaque Pickle wakeups across the supported providers and native callbacks.
Parent owns release ordering and immutable final artifact repinning before
publication if required. Reader, bundled clients and canonical Connect were not
edited; no agents, browser operations, credentials, live service acceptance,
commits, pushes, publishing or deployments were used.

Private logs: `/tmp/v2-consumer-sdk-integration-20260909T130351/pickle-android`.
