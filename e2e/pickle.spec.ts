import { expect, test } from "@playwright/test";

test("reviews and approves a request", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Requests" })).toBeVisible();
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

  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByText("Documentation review complete")).toBeVisible();
  await page
    .getByRole("button", { name: /Conflicting environment choice/ })
    .click();
  await expect(page.getByText("Conflicting responses")).toBeVisible();
});

test("supports responsive navigation, search, and themes", async ({ page }) => {
  await page.goto("/");
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
