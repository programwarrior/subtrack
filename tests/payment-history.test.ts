import { describe, expect, it } from "vitest";
import { createSubscription } from "@/hooks/use-subscriptions";
import { buildEstimatedPaymentHistory, normalizePriceHistory, priceAtDate } from "@/lib/payment-history";

describe("historical payment tracking", () => {
  it("creates estimated renewals from the first payment date", () => {
    const subscription = createSubscription({ name: "Netflix", price: 20, billingFrequency: "monthly", firstPaymentDate: "2026-01-15", nextPaymentDate: "2026-05-15" });
    const payments = buildEstimatedPaymentHistory(subscription, "2026-05-01");
    expect(payments.map((payment) => payment.paymentDate)).toEqual(["2026-04-15", "2026-03-15", "2026-02-15", "2026-01-15"]);
    expect(payments.every((payment) => payment.status === "estimated")).toBe(true);
  });
  it("does not duplicate a confirmed payment", () => {
    const subscription = createSubscription({ name: "Spotify", price: 12, billingFrequency: "monthly", firstPaymentDate: "2026-01-01", nextPaymentDate: "2026-03-01", payments: [{ id: "paid", paymentDate: "2026-02-01", amount: 12, status: "paid" }] });
    expect(buildEstimatedPaymentHistory(subscription, "2026-03-01")).toHaveLength(2);
  });
  it("uses the price effective on each historical payment", () => {
    const subscription = createSubscription({ name: "Software", price: 20, billingFrequency: "monthly", firstPaymentDate: "2026-01-01", nextPaymentDate: "2026-05-01", priceHistory: [{ id: "change", previousPrice: 10, newPrice: 20, effectiveDate: "2026-03-15", note: "Plan upgrade" }] });
    const payments = buildEstimatedPaymentHistory(subscription, "2026-05-01");
    expect(payments.find((payment) => payment.paymentDate === "2026-03-01")?.amount).toBe(10);
    expect(payments.find((payment) => payment.paymentDate === "2026-04-01")?.amount).toBe(20);
    expect(priceAtDate(subscription, "2026-04-01")).toBe(20);
  });
  it("relinks previous prices when a change is inserted in the middle", () => {
    const history = normalizePriceHistory([{ id: "a", previousPrice: 10, newPrice: 15, effectiveDate: "2026-01-01" }, { id: "c", previousPrice: 15, newPrice: 20, effectiveDate: "2026-06-01" }, { id: "b", previousPrice: 15, newPrice: 18, effectiveDate: "2026-03-01", note: "Mid-year change" }]);
    expect(history.map((item) => [item.previousPrice, item.newPrice])).toEqual([[10, 15], [15, 18], [18, 20]]);
  });
});
