import { describe, expect, it } from "vitest";
import { inferCategory, normalizeDate, parseDocumentText, parseMoney, parseSpreadsheetRows } from "@/lib/smart-import";

describe("smart document import", () => {
  it("extracts recurring services from statement text", () => {
    const items = parseDocumentText("NETFLIX monthly renewal 18/08/2026 €19,99\nGrocery Store €42.50\nAdobe annual subscription 2026-09-01 USD 120.00", "EUR");
    expect(items).toHaveLength(2); expect(items[0]).toMatchObject({ price: 19.99, currency: "EUR", billingFrequency: "monthly" }); expect(items[1].billingFrequency).toBe("yearly");
  });
  it("maps typed spreadsheet columns", () => {
    const items = parseSpreadsheetRows([["Service", "Amount", "Currency", "Cycle", "Next payment"], ["Spotify", 11.99, "EUR", "Monthly", "2026-08-20"]]);
    expect(items[0]).toMatchObject({ name: "Spotify", price: 11.99, nextPaymentDate: "2026-08-20", confidence: "high" });
  });
  it("supports locale money and inferred metadata", () => { expect(parseMoney("€ 1.299,50")).toEqual({ amount: 1299.5, currency: "EUR" }); expect(inferCategory("Netflix Premium")).toBe("Entertainment"); expect(normalizeDate("", "yearly").inferred).toBe(true); });
});
