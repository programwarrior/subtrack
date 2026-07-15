import { describe, expect, it } from "vitest";
import { candidateToSubscription, consolidateImportCandidates, inferCategory, normalizeDate, parseDocumentText, parseImageReceiptText, parseMoney, parseSpreadsheetRows } from "@/lib/smart-import";

describe("smart document import", () => {
  it("extracts recurring services from statement text", () => {
    const items = parseDocumentText("NETFLIX monthly renewal 18/08/2026 €19,99\nGrocery Store €42.50\nAdobe annual subscription 2026-09-01 USD 120.00", "EUR");
    expect(items).toHaveLength(2); expect(items[0]).toMatchObject({ price: 19.99, currency: "EUR", billingFrequency: "monthly" }); expect(items[1].billingFrequency).toBe("yearly");
  });
  it("maps typed spreadsheet columns", () => {
    const items = parseSpreadsheetRows([["Service", "Amount", "Currency", "Cycle", "Next payment"], ["Spotify", 11.99, "EUR", "Monthly", "2026-08-20"]]);
    expect(items[0]).toMatchObject({ name: "Spotify", price: 11.99, nextPaymentDate: "2026-08-20", confidence: "high" }); expect(items[0].paymentDate).toBeUndefined();
  });
  it("supports locale money and inferred metadata", () => { expect(parseMoney("€ 1.299,50")).toEqual({ amount: 1299.5, currency: "EUR" }); expect(inferCategory("Netflix Premium")).toBe("Entertainment"); expect(normalizeDate("", "yearly").inferred).toBe(true); });
  it("groups differently priced charges for one merchant into one subscription", () => {
    const base = { selected: true, currency: "EUR", billingFrequency: "monthly" as const, nextPaymentDate: "2026-08-01", category: "Entertainment", note: "Imported", confidence: "high" as const, warnings: [], source: "statement.png" };
    const grouped = consolidateImportCandidates([{ ...base, id: "one", name: "Netflix", price: 10, paymentDate: "2026-05-01" }, { ...base, id: "two", name: "NETFLIX.COM", price: 14, paymentDate: "2026-06-01" }]);
    expect(grouped).toHaveLength(1); expect(grouped[0]).toMatchObject({ price: 14, firstPaymentDate: "2026-05-01", chargeCount: 2 });
    const subscription = candidateToSubscription(grouped[0]);
    expect(subscription.payments).toHaveLength(2); expect(subscription.priceHistory?.[0]).toMatchObject({ previousPrice: 10, newPrice: 14 });
  });
  it("keeps four separate receipt providers as four subscriptions", () => {
    const receipts = [
      ["CloudBox Pro", "9.99", "01/04/2026"],
      ["Focus Journal", "5.49", "02/04/2026"],
      ["Trail Maps Plus", "14.00", "03/04/2026"],
      ["Language Club", "7.50", "04/04/2026"],
    ].flatMap(([name, amount, date], index) => parseImageReceiptText(`Merchant\n${name}\nPayment successful\nAmount\n€${amount}\nTransaction date\n${date}`, "EUR", `receipt-${index + 1}.png`));
    const grouped = consolidateImportCandidates(receipts);
    expect(receipts).toHaveLength(4); expect(grouped).toHaveLength(4);
    expect(grouped.map((item) => item.name)).toEqual(["CloudBox Pro", "Focus Journal", "Trail Maps Plus", "Language Club"]);
    expect(grouped.every((item) => item.payments?.length === 1)).toBe(true);
  });
  it("collects four separate-line receipts for one provider as four payments", () => {
    const receipts = [
      ["10.00", "01/03/2026"], ["10.00", "01/04/2026"], ["12.00", "01/05/2026"], ["12.00", "01/06/2026"],
    ].flatMap(([amount, date], index) => parseImageReceiptText(`NETFLIX.COM\nPayment successful\nAmount €${amount}\nTransaction date ${date}`, "EUR", `netflix-${index + 1}.png`));
    const grouped = consolidateImportCandidates(receipts);
    expect(grouped).toHaveLength(1); expect(grouped[0]).toMatchObject({ name: "NETFLIX.COM", price: 12, chargeCount: 4, firstPaymentDate: "2026-03-01" });
    expect(candidateToSubscription(grouped[0]).payments).toHaveLength(4);
  });
});
