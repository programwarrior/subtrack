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
  await expect(page.getByRole("dialog").getByText("paid", { exact: true })).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete subscription" }).click();
  await expect(page.getByRole("article").filter({ hasText: "Readwise" })).toHaveCount(0);
});

test("offers PDF, spreadsheet, and image import inside Add subscription", async ({ page }) => {
  await page.getByRole("button", { name: "Add subscription" }).first().click();
  await expect(page.getByText("Read subscription details from a file")).toBeVisible();
  await expect(page.getByText("Excel / CSV")).toBeVisible();
  await page.getByRole("button", { name: "Choose files" }).click();
  await expect(page.getByText("Drop files here or choose multiple files")).toBeVisible();
  const fileInput = page.locator('input[type="file"]');
  await expect(fileInput).toHaveAttribute("multiple", "");
  await fileInput.setInputFiles([
    { name: "one.csv", mimeType: "text/csv", buffer: Buffer.from("Name,Price\nFirst plan,10") },
    { name: "two.csv", mimeType: "text/csv", buffer: Buffer.from("Name,Price\nSecond plan,20") },
  ]);
  await expect(page.getByText("2 subscriptions found")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Name *")).toBeVisible();
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
  await expect(page.getByText("1 subscription found")).toBeVisible();
  await page.getByRole("button", { name: "Import 1 subscription" }).click();
  await expect(page.getByRole("article").filter({ hasText: "Readwise" })).toBeVisible();
});

test("groups repeated imported charges into one subscription", async ({ page }) => {
  await page.getByRole("button", { name: "Smart import" }).first().click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "statement.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Name,Price,Currency,Billing frequency,Payment date,Category\nNetflix,10,EUR,monthly,2026-05-01,Entertainment\nNETFLIX.COM,14,EUR,monthly,2026-06-01,Entertainment"),
  });
  await expect(page.getByText("1 subscription and 2 payments found")).toBeVisible();
  await expect(page.getByText(/2 recorded charges/)).toBeVisible();
  await page.getByRole("button", { name: "Import 1 subscription" }).click();
  await expect(page.getByRole("article").filter({ hasText: "Netflix" })).toHaveCount(1);
  await page.getByRole("article").filter({ hasText: "Netflix" }).click();
  await expect(page.getByRole("dialog").getByText("paid", { exact: true })).toHaveCount(2);
  await expect(page.getByText("€14.00", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Smart import" }).first().click();
  await page.locator('input[type="file"]').setInputFiles({ name: "new-charge.csv", mimeType: "text/csv", buffer: Buffer.from("Name,Price,Currency,Billing frequency,Payment date\nNetflix,16,EUR,monthly,2026-07-01") });
  await expect(page.getByText(/Charges will be added to the existing .* subscription/)).toBeVisible();
  await page.getByRole("button", { name: "Import 1 subscription" }).click();
  await expect(page.getByRole("article").filter({ hasText: "Netflix" })).toHaveCount(1);
  await page.getByRole("article").filter({ hasText: "Netflix" }).click();
  await expect(page.getByRole("dialog").getByText("paid", { exact: true })).toHaveCount(3);
  await expect(page.getByRole("dialog").getByText("estimated", { exact: true })).toHaveCount(0);
  await expect(page.getByText("€16.00", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("01/08/2026");
  await page.getByRole("button", { name: "Add missing charge" }).click();
  await page.getByLabel("Payment date").fill("2026-06-15");
  await page.getByLabel("Amount charged").fill("13");
  await page.getByLabel("Note").fill("Recovered from bank statement");
  await page.getByRole("button", { name: "Add charge" }).click();
  await expect(page.getByRole("dialog").getByText("paid", { exact: true })).toHaveCount(4);
  await expect(page.getByRole("dialog")).toContainText("15/06/2026");
  await expect(page.getByRole("dialog")).toContainText("01/08/2026");
});

test("classifies bank statement spending before importing subscriptions", async ({ page }) => {
  await page.getByRole("button", { name: "Smart import" }).first().click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "bank-statements.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Booking date,Description,Amount,Currency\n2026-03-05,Netflix,-15.99,EUR\n2026-04-05,NETFLIX.COM,-15.99,EUR\n2026-05-06,Netflix payment,-17.99,EUR\n2026-04-03,Fresh Grocery Market,-42.10,EUR\n2026-04-11,Fresh Grocery Market,-18.40,EUR\n2026-04-09,Design Studio,-25.00,EUR\n2026-05-17,Design Studio,-60.00,EUR"),
  });
  await expect(page.getByText(/1 likely subscription/).first()).toBeVisible();
  await expect(page.getByText("1 need review", { exact: true })).toBeVisible();
  await expect(page.getByText("1 normal spending", { exact: true })).toBeVisible();
  await expect(page.getByText("Fresh Grocery Market", { exact: true })).toBeVisible();
  const designRow = page.getByRole("article").filter({ hasText: "Design Studio" });
  await expect(designRow.getByText("Needs review", { exact: true })).toBeVisible();
  await designRow.getByRole("button", { name: "Add as subscription" }).click();
  await expect(page.getByRole("button", { name: "Import 2 subscriptions" })).toBeEnabled();
  await page.getByRole("button", { name: "Import 2 subscriptions" }).click();
  await expect(page.getByRole("article").filter({ hasText: "Netflix" })).toBeVisible();
  await expect(page.getByRole("article").filter({ hasText: "Design Studio" })).toBeVisible();
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
  await expect(page.getByText("€18.00", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Edit payment from 2026-07-15" }).click();
  await page.getByLabel("Amount charged").fill("22");
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect(page.getByText("€22.00", { exact: true }).first()).toBeVisible();
});
