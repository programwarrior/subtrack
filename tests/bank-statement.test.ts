import { describe, expect, it } from "vitest";
import { classifyBankTransactions, parseBankStatementRows, parseBankStatementText, statementGroupToCandidate } from "@/lib/bank-statement";

describe("bank statement analysis", () => {
  it("separates recurring subscriptions, everyday spending, and uncertain repeats", () => {
    const rows = [
      ["Booking date", "Description", "Amount", "Currency"],
      ["2026-04-05", "Netflix.com", "-15.99", "EUR"],
      ["2026-05-05", "NETFLIX", "-15.99", "EUR"],
      ["2026-06-06", "Netflix payment", "-17.99", "EUR"],
      ["2026-04-03", "Fresh Grocery Market", "-42.10", "EUR"],
      ["2026-04-11", "Fresh Grocery Market", "-18.40", "EUR"],
      ["2026-04-09", "Design Studio", "-25.00", "EUR"],
      ["2026-05-17", "Design Studio", "-60.00", "EUR"],
      ["2026-06-02", "Salary", "2400", "EUR"],
    ];
    const transactions = parseBankStatementRows(rows, "EUR", "three-months.csv"); const groups = classifyBankTransactions(transactions);
    expect(groups.find((group) => group.key === "netflix")).toMatchObject({ classification: "recurring", billingFrequency: "monthly", confidence: "high" });
    expect(groups.find((group) => group.merchant.includes("Fresh Grocery"))?.classification).toBe("normal");
    expect(groups.find((group) => group.merchant === "Design Studio")?.classification).toBe("review");
    expect(groups.some((group) => group.merchant === "Salary")).toBe(false);
  });

  it("pairs date headings with transactions extracted from statement images", () => {
    const text = "8 Apr 2026\n2 A2 Hosting 29.72 EUR\nFresh Grocery Market 44.20 EUR\n8 May 2026\n2 A2 Hosting 29.72 EUR";
    const transactions = parseBankStatementText(text, "EUR", "statement.png"); const groups = classifyBankTransactions(transactions);
    const hosting = groups.find((group) => group.key === "hosting")!; expect(hosting).toMatchObject({ classification: "recurring", billingFrequency: "monthly" });
    const candidate = statementGroupToCandidate(hosting); expect(candidate.payments).toHaveLength(2); expect(candidate.price).toBe(29.72); expect(candidate.nextPaymentDate).toBe("2026-08-08");
    expect(groups.find((group) => group.merchant.includes("Fresh Grocery"))?.classification).toBe("normal");
  });

  it("recognizes a known subscription from a single statement while keeping confidence low", () => {
    const transactions = parseBankStatementRows([["Date", "Payee", "Debit"], ["2026-07-03", "Spotify", "11.99"]]); const groups = classifyBankTransactions(transactions);
    expect(groups[0]).toMatchObject({ classification: "recurring", confidence: "low", billingFrequency: "monthly" });
  });

  it("does not treat generic invoice labels as bank-statement merchants", () => {
    expect(parseBankStatementText("16:01\nPayment of 12/06/2025 € 9,30\nPayment of 12/05/2025 € 9,30", "EUR", "IMG_8052.PNG")).toEqual([]);
  });
});
