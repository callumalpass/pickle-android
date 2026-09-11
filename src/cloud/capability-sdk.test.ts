import { afterEach, describe, expect, it, vi } from "vitest";
import {
  effectiveCapabilities,
  MdbaseConnect,
  type MdbaseConnectionInfo,
} from "@mdbase-dev/connect";
import {
  MemoryApplicationIdentityStore,
  MemoryGrantKeyStore,
} from "@mdbase-dev/connect/crypto";
import {
  APPLICATION_AUTHORIZATION_V2_ISSUANCE_CAPABILITY,
  type MdbaseAppManifest,
} from "@mdbase-dev/connect-protocol";
import bundledManifest from "../generated/mdbase-app.json";

const manifest = bundledManifest as MdbaseAppManifest;
const operations: MdbaseConnectionInfo["operations"] = [
  "describe",
  "changes",
  "read",
  "query",
  "list_views",
  "execute_view",
  "read_view_source",
  "validate",
  "read_type",
  "create",
];
const info: MdbaseConnectionInfo = {
  collectionId: "sdk-test",
  displayName: "SDK test",
  operations,
  scope: { access: "full_collection", contracts: [] },
  authority: { kind: "hosted", durability: "provider" },
  route: "remote",
  directAccess: "disabled",
};

afterEach(() => vi.restoreAllMocks());

describe("real beta96 capability contract", () => {
  it("evaluates only reading and creation, without notification or replica readiness", () => {
    const result = effectiveCapabilities(
      manifest.requirements!.capabilities!,
      manifest,
      info,
    );
    expect(result.contractVersion).toBe(2);
    expect(result.requiredAvailable).toBe(true);
    expect(Object.keys(result.values)).toEqual([
      "collection.read",
      "records.create",
    ]);
    expect(result.values["records.create"]?.operations).toEqual(["create"]);
  });

  it("does not broaden retained legacy read grants", () => {
    const retained = ["describe", "changes", "read", "query"] as const;
    const result = effectiveCapabilities(
      manifest.requirements!.capabilities!,
      manifest,
      {
        ...info,
        operations: [...retained],
      },
    );
    expect(result.requiredAvailable).toBe(false);
    expect(result.values["collection.read"]?.state).toBe(
      "requires_authorization",
    );
    expect(result.values["records.create"]?.state).toBe(
      "requires_authorization",
    );
    expect(result.values["records.create"]?.missingOperations).toEqual([
      "create",
    ]);
    expect(retained).toEqual(["describe", "changes", "read", "query"]);
  });

  it("signs declaration-derived group, scoped file and setup authorization without extra rights", async () => {
    const navigate = vi.fn();
    const client = new MdbaseConnect({
      serverUrl: "https://connect.example.test",
      manifest,
      redirectUri: bundledManifest.redirect_uris[0],
      keyStore: new MemoryGrantKeyStore(),
      identityStore: new MemoryApplicationIdentityStore(),
      navigate,
    });
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) => {
        if (String(url) === "https://connect.example.test/health") {
          return Response.json({
            capabilities: [APPLICATION_AUTHORIZATION_V2_ISSUANCE_CAPABILITY],
          });
        }
        if (String(url) === "https://connect.example.test/v1/apps/register") {
          return Response.json({
            application: {
              id: "00000000-0000-4000-8000-000000000001",
              family_identity: "bundle:com.callumalpass.pickle",
              manifest_digest: "0".repeat(64),
              name: "Pickle",
              distribution: "web",
              requirements: manifest.requirements,
              provisions: manifest.provisions,
            },
          });
        }
        // Capture the genuine signed request; stop before any navigation or grant.
        expect(String(url)).toBe(
          "https://connect.example.test/oauth/authorization_request",
        );
        return Response.json({ error: "access_denied" }, { status: 403 });
      });
    const outcome = await client.authorize({
      presentation: "redirect",
      timeoutMs: 1000,
    });
    expect(outcome).toMatchObject({
      ok: false,
      problem: { code: "access_denied" },
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(3);
    const body = new URLSearchParams(
      String(
        fetch.mock.calls.find(([url]) =>
          String(url).endsWith("/oauth/authorization_request"),
        )![1]?.body,
      ),
    );
    expect(body.get("operations")?.split(",")).toEqual([
      ...operations,
      "assess_collection_setup",
      "apply_collection_setup",
    ]);
    const proof = JSON.parse(body.get("application_authorization")!);
    expect(proof.binding.contracts.semantic_capabilities).toBe(2);
    expect(proof.binding.requested_operations).toEqual([
      ...operations,
      "assess_collection_setup",
      "apply_collection_setup",
    ]);
    expect(proof.binding.requested_files).toEqual({
      actions: ["list", "read"],
      scope: { kind: "selected_folders", folders: ["attachments"] },
    });
    expect(client.connections()).toEqual([]);
  });
});
