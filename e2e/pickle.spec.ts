import { expect, test } from "@playwright/test";

test("reviews and approves a request", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Approve production deployment/ }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: /Approve production deployment/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Approve production deployment" }),
  ).toBeVisible();
  await expect(
    page.getByText("release-report.pdf", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /release-notes\.md/ }).click();
  await expect(
    page.getByRole("heading", { name: "Release notes" }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("button", { name: /deployment-map\.svg/ }).click();
  await expect(
    page.getByRole("img", { name: "deployment-map.svg" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /release-report\.pdf/ }).click();
  await expect(page.getByRole("img", { name: "Page 1" })).toBeVisible();
  await page.getByLabel(/Comment/).fill("Approved from the live app test.");
  await page.getByRole("button", { name: "Approve", exact: true }).click();

  await expect(page.getByText("Response recorded").last()).toBeVisible();
  await expect(
    page.getByText("Approved from the live app test."),
  ).toBeVisible();
});

test("uses collection-defined forms and history", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Choose the default update channel/ })
    .click();
  await page.getByLabel("Release channel *").selectOption("preview");
  await page.getByLabel("Notify the team").check();
  await page.getByRole("button", { name: "Send response" }).click();
  await expect(
    page.locator(".response-receipt").getByText("preview", { exact: true }),
  ).toBeVisible();

  const backToRequests = page.getByRole("button", {
    name: "Back to requests",
  });
  if (await backToRequests.isVisible()) await backToRequests.click();
  await page
    .getByRole("button", { name: /Conflicting environment choice/ })
    .click();
  await expect(page.getByText("Conflicting responses")).toBeVisible();

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByText("Documentation review complete")).toBeVisible();
  await expect(
    page.getByText("Conflicting environment choice"),
  ).not.toBeVisible();
});

test("supports sorting, responsive navigation, search, and themes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Sort requests").selectOption("oldest");
  await expect(
    page.locator(".request-group-ready .request-title").first(),
  ).toHaveText("Replace the empty inbox copy");
  await expect(page.getByText("Oldest first")).toBeVisible();

  await page.getByRole("button", { name: "Filter requests" }).click();
  await page.getByLabel("Status").selectOption("conflict");
  await expect(page.getByText("Conflicting environment choice")).toBeVisible();
  await expect(
    page.getByText("Approve production deployment"),
  ).not.toBeVisible();

  await page.getByLabel("Status").selectOption("all");
  await page.getByLabel("Priority").selectOption("urgent");
  await expect(page.getByText("Approve production deployment")).toBeVisible();
  await expect(
    page.getByText("Replace the empty inbox copy"),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();

  await page.getByPlaceholder("Search title, source, or tag").fill("interface");
  await expect(page.getByText("Replace the empty inbox copy")).toBeVisible();
  await expect(
    page.getByText("Approve production deployment"),
  ).not.toBeVisible();

  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("keeps long request details inside the phone viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await page
    .getByRole("button", { name: /Approve production deployment/ })
    .click();

  const unbrokenText = "collectionidentifier".repeat(40);
  await page.locator(".detail-title .eyebrow").evaluate((element, value) => {
    element.textContent = value;
  }, unbrokenText);
  await page
    .locator(".markdown p")
    .first()
    .evaluate((element, value) => {
      element.textContent = value;
    }, unbrokenText);
  await page
    .locator(".resource-list span")
    .first()
    .evaluate((element, value) => {
      element.textContent = value;
    }, unbrokenText);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const navigation = await page.getByRole("navigation", { name: "Primary" });
  await expect(navigation).toBeInViewport();
  await expect(navigation).toHaveCSS("width", "320px");
});
