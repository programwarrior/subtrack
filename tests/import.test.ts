import { describe, expect, it } from "vitest";
import { importSubscriptionsCsv } from "@/lib/import-export";

describe("CSV import validation", () => {
  const header = "Name,Price,Currency,Billing frequency,Next payment date,Category,Reminder days,Note,Status,Website URL";
  it("imports a valid row", () => { const result = importSubscriptionsCsv(`${header}\nSpotify,11.99,EUR,monthly,2026-08-15,Entertainment,3,Music,active,https://spotify.com`, "EUR"); expect(result.errors).toEqual([]); expect(result.items[0].name).toBe("Spotify"); });
  it("reports malformed rows without importing them", () => { const result = importSubscriptionsCsv(`${header}\n,abc,EUR,bad-date,soon`, "EUR"); expect(result.items).toHaveLength(0); expect(result.errors[0]).toContain("Row 2"); });
});
