import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("adds, pauses, records payment, and deletes a subscription", async ({ page }) => {
  await page.getByRole("button", { name: "Add subscription" }).first().click();
  await page.getByLabel("Name *").fill("Readwise");
  await page.getByLabel("Price *").fill("9.99");
  await page.getByRole("button", { name: "Save subscription" }).click();
  await expect(page.getByRole("article").filter({ hasText: "Readwise" })).toBeVisible();

  await page.getByRole("article").filter({ hasText: "Readwise" }).click();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("dialog").getByText("paused", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await page.getByRole("button", { name: "Mark as paid" }).click();
  await expect(page.getByRole("dialog").getByText("Paid", { exact: true })).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete subscription" }).click();
  await expect(page.getByRole("article").filter({ hasText: "Readwise" })).toHaveCount(0);
});

test("loads demo data and filters by name", async ({ page }) => {
  await page.getByRole("button", { name: "Load demo data" }).click();
  await page.getByRole("textbox", { name: "Search subscriptions" }).fill("Spotify");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText("Spotify");
});

test("reviews and imports subscriptions from a spreadsheet file", async ({ page }) => {
  await page.getByRole("button", { name: "Smart import" }).first().click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "subscriptions.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Name,Price,Currency,Billing frequency,Next payment date,Category\nReadwise,9.99,EUR,monthly,2026-08-15,Education"),
  });
  await expect(page.getByText("1 possible subscription found")).toBeVisible();
  await page.getByRole("button", { name: "Import 1 subscription" }).click();
  await expect(page.getByRole("article").filter({ hasText: "Readwise" })).toBeVisible();
});

test("shows safe account login without device pairing", async ({ page }) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("Sign in to sync everywhere")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByText("Device sync", { exact: true })).toHaveCount(0);
});

test("restores a subscription from the 30-day trash", async ({ page }) => {
  await page.getByRole("button", { name: "Add subscription" }).first().click();
  await page.getByLabel("Name *").fill("Recoverable plan");
  await page.getByLabel("Price *").fill("8");
  await page.getByRole("button", { name: "Save subscription" }).click();
  await page.getByRole("article").filter({ hasText: "Recoverable plan" }).click();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete subscription" }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Recently deleted" })).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("article").filter({ hasText: "Recoverable plan" })).toBeVisible();
});

test("builds past payment history and records a dated price change", async ({ page }) => {
  await page.getByRole("button", { name: "Add subscription" }).first().click();
  await page.getByLabel("Name *").fill("Archive Pro");
  await page.getByLabel("Price *").fill("12");
  await page.getByLabel("Next payment *").fill("2026-08-15");
  await page.getByLabel("First payment date Optional").fill("2026-01-15");
  await page.getByRole("button", { name: "Save subscription" }).click();

  await page.getByRole("article").filter({ hasText: "Archive Pro" }).click();
  await expect(page.getByRole("dialog").getByText("estimated", { exact: true })).toHaveCount(7);
  await page.getByRole("button", { name: "Price change" }).click();
  await page.getByLabel("New price").fill("18");
  await page.getByLabel("Effective date").fill("2026-04-15");
  await page.getByLabel("Note about this change").fill("Upgraded to the family plan");
  await page.getByRole("button", { name: "Save price change" }).click();

  await expect(page.getByText("Upgraded to the family plan")).toBeVisible();
  await expect(page.getByText(/Changed from/)).toBeVisible();
});
