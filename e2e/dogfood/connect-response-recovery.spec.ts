import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";

const collectionDir = requiredEnvironment(
  "MDBASE_CONNECT_DOGFOOD_COLLECTION_DIR",
);
const userName =
  process.env.MDBASE_CONNECT_DOGFOOD_USER_NAME ?? "Pickle Dogfood";
const userEmail =
  process.env.MDBASE_CONNECT_DOGFOOD_USER_EMAIL ??
  "pickle-dogfood@localhost.test";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is required for the isolated dogfood test.`);
  return value;
}

async function responseFiles(): Promise<string[]> {
  try {
    return (await readdir(`${collectionDir}/responses`)).filter((file) =>
      file.endsWith(".md"),
    );
  } catch {
    return [];
  }
}

async function authorize(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Open your decision inbox." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to mdbase" }).click();
  await expect(
    page.getByRole("heading", { name: "Open your account" }),
  ).toBeVisible();
  await page.getByLabel("Name").fill(userName);
  await page.getByLabel("Email").fill(userEmail);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Pickle" })).toBeVisible();
  const collection = page.locator('input[type="radio"]').first();
  await expect(collection).toBeAttached();
  if (!(await collection.isChecked())) await collection.check();
  await page.getByRole("button", { name: "Allow Pickle" }).click();

  const inbox = page.getByRole("heading", { name: "Inbox" });
  const applyDefinitions = page.getByRole("button", {
    name: "Review and update definitions",
  });
  await expect(inbox.or(applyDefinitions)).toBeVisible();
  if (await applyDefinitions.isVisible()) await applyDefinitions.click();
  await expect(inbox).toBeVisible();
}

function isCreateOperation(route: Route): boolean {
  const request = route.request();
  if (request.method() !== "POST") return false;
  let body: Record<string, unknown>;
  try {
    body = request.postDataJSON() as Record<string, unknown>;
  } catch {
    return false;
  }
  return (
    body.operation === "create" || request.url().endsWith("/operations/create")
  );
}

test("recovers one exact response after the authority response is lost", async ({
  page,
}) => {
  await authorize(page);

  const requestId = `pickle-dogfood-${Date.now()}`;
  await mkdir(`${collectionDir}/requests`, { recursive: true });
  await writeFile(
    `${collectionDir}/requests/${requestId}.md`,
    `---\ntype: pickle_request\nid: ${requestId}\ntitle: Confirm durable response recovery\nsource: beta-hardening-dogfood\nmessage: Record this response once even when its HTTP responses are lost.\nkind: approval\npriority: urgent\nresponse_type: pickle_response_approval\ncreated_at: ${new Date().toISOString()}\n---\n\nThis request is isolated test data.\n`,
  );
  await expect(
    page.getByRole("button", { name: /Confirm durable response recovery/ }),
  ).toBeVisible();
  const responsesBefore = await responseFiles();

  let injectLoss = true;
  let droppedResponses = 0;
  await page.route("**/*", async (route) => {
    if (!injectLoss || !isCreateOperation(route)) {
      await route.continue();
      return;
    }
    await route.fetch();
    droppedResponses += 1;
    await route.abort("failed");
  });

  await page
    .getByRole("button", { name: /Confirm durable response recovery/ })
    .click();
  await page.getByLabel(/Comment/).fill("Recovered without a duplicate.");
  await page.getByRole("button", { name: "Approve", exact: true }).click();

  await expect(page.getByText("Response awaiting confirmation")).toBeVisible();
  expect(droppedResponses).toBeGreaterThan(0);

  injectLoss = false;
  await page.unrouteAll({ behavior: "wait" });
  await page.reload();
  await expect(
    page.getByText("Response awaiting confirmation"),
  ).not.toBeVisible();
  await expect(page.getByText("Response recorded")).toBeVisible();

  const responsesAfter = await responseFiles();
  const created = responsesAfter.filter(
    (file) => !responsesBefore.includes(file),
  );
  expect(created).toHaveLength(1);
  const markdown = await readFile(
    `${collectionDir}/responses/${created[0]}`,
    "utf8",
  );
  expect(markdown).toContain("decision: approve");
  expect(markdown).toContain("Recovered without a duplicate.");
  expect(markdown).toContain(`[[requests/${requestId}]]`);
});
