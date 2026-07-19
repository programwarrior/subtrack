import { describe, expect, it } from "vitest";
import { candidateToSubscription, consolidateImportCandidates, inferCategory, normalizeDate, parseDateValue, parseDocumentText, parseImageReceiptText, parseMoney, parseSpreadsheetRows } from "@/lib/smart-import";

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
  it("supports month-first and ordinal receipt dates", () => { expect(parseDateValue("Jul 4th, 2025")).toBe("2025-07-04"); expect(parseDateValue("4-Jul-25")).toBe("2025-07-04"); });
  it("supports OCR dates with spaces around separators and commas", () => { expect(parseDateValue("04 / 07 / 2025")).toBe("2025-07-04"); expect(parseDateValue("July 4,2025")).toBe("2025-07-04"); });
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
  it("deduplicates the same dated transaction when screenshots overlap", () => {
    const base = { selected: true, name: "Netflix", price: 12, currency: "EUR", billingFrequency: "monthly" as const, nextPaymentDate: "2026-08-19", paymentDate: "2026-07-19", category: "Entertainment", note: "Imported", confidence: "high" as const, warnings: [], source: "receipt.jpg" };
    const images = [1, 2, 3, 4].map((number) => ({ ...base, id: `image-${number}`, sourceId: `iphone-image-${number}` }));
    const grouped = consolidateImportCandidates([...images, { ...images[0], id: "same-file-again" }]);
    expect(grouped).toHaveLength(1); expect(grouped[0].chargeCount).toBe(1); expect(grouped[0].payments).toHaveLength(1);
  });
  it("uses charged dates instead of renewal dates for payments and price changes", () => {
    const receipts = [["10.00", "May 3, 2026", "August 3, 2026"], ["12.00", "June 3rd, 2026", "August 3, 2026"]].flatMap(([amount, charged, renewal], index) => parseImageReceiptText(`NETFLIX.COM\nMonthly subscription\nAmount €${amount}\nNext renewal\n${renewal}\nCharged on\n${charged}`, "EUR", `netflix-${index + 1}.jpg`));
    const grouped = consolidateImportCandidates(receipts);
    expect(grouped[0].payments?.map((payment) => payment.paymentDate)).toEqual(["2026-05-03", "2026-06-03"]);
    expect(grouped[0].priceHistory?.[0]).toMatchObject({ previousPrice: 10, newPrice: 12, effectiveDate: "2026-06-03" });
  });
  it("never silently substitutes today when an image charge date is unreadable", () => {
    const receipt = parseImageReceiptText("A2 Hosting monthly subscription\nAmount €29.72\nPayment successful", "EUR", "a2-charge.png");
    expect(receipt[0].paymentDate).toBe("");
    expect(receipt[0].warnings).toContain("Payment date could not be read. Choose it below before importing.");
    const grouped = consolidateImportCandidates(receipt);
    expect(grouped[0].payments).toHaveLength(1);
    expect(grouped[0].payments?.[0].paymentDate).toBe("");
    expect(grouped[0].chargeCount).toBe(1);
  });
  it("pairs bank-app date headings with every following A2 Hosting charge", () => {
    const screenshots = [
      "13:32 all F112\nQ A2 hosting\n8 Sep 2024\n2 A2 Hosting 27.54 EUR\n8 Aug 2024\n2 A2 Hosting 27.54 EUR\n22 Jul 2024\n2 A2 Hosting 27.54 EUR\nA2 Hosting\n0 USD\nCard checked",
      "13:32 all F112\nQ A2 hosting\n8 Jan 2025\n2 A2 Hosting 27.54 EUR\n8 Dec 2024\n2 A2 Hosting 27.54 EUR\n8 Nov 2024\n2 A2 Hosting 27.54 EUR\n8 Oct 2024\n2 A2 Hosting 27.54 EUR",
      "13:33 all F112\nQ A2 hosting\n5 May 2025\n2 A2 Hosting 24.77 EUR\n8 Apr 2025\n2 A2 Hosting 29.72 EUR\n8 Mar 2025\n2 A2 Hosting 27.54 EUR\n8 Feb 2025\n2 A2 Hosting 27.54 EUR\n2 Jan 2025",
      "13:33 all F112\nQ A2 hosting\n5 Jul 2026\n2 A2 Hosting 29.72 EUR\n5 Jun 2026\n2 A2 Hosting 29.72 EUR\n5 May 2026\n2 A2 Hosting 29.72 EUR\n5 May 2025\n2 A2 Hosting 24.77 EUR\n8 Apr 2025",
    ].flatMap((text, index) => parseImageReceiptText(text, "EUR", `IMG_788${index + 2}.PNG`).map((item, itemIndex) => ({ ...item, sourceId: `image-${index}:${itemIndex}` })));
    const grouped = consolidateImportCandidates(screenshots);
    expect(grouped).toHaveLength(1); expect(grouped[0].name).toBe("A2 Hosting"); expect(grouped[0].chargeCount).toBe(14);
    expect(grouped[0].payments?.map((payment) => [payment.paymentDate, payment.amount])).toEqual([
      ["2024-07-22", 27.54], ["2024-08-08", 27.54], ["2024-09-08", 27.54], ["2024-10-08", 27.54], ["2024-11-08", 27.54], ["2024-12-08", 27.54], ["2025-01-08", 27.54], ["2025-02-08", 27.54], ["2025-03-08", 27.54], ["2025-04-08", 29.72], ["2025-05-05", 24.77], ["2026-05-05", 29.72], ["2026-06-05", 29.72], ["2026-07-05", 29.72],
    ]);
    expect(grouped[0].priceHistory?.map((change) => change.effectiveDate)).toEqual(["2025-04-08", "2025-05-05", "2026-05-05"]);
  });
});
