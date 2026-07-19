import { describe, expect, it } from "vitest";
import { createSubscription } from "@/hooks/use-subscriptions";
import { buildEstimatedPaymentHistory, normalizePriceHistory, priceAtDate, reconcilePaymentPriceHistory, recordedSpend, samePaymentRecord } from "@/lib/payment-history";

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
  it("turns changing recorded charges into dated price history and actual spend", () => {
    const payments = [{ id: "one", paymentDate: "2026-01-01", amount: 10, status: "paid" as const }, { id: "two", paymentDate: "2026-02-01", amount: 14, status: "paid" as const }, { id: "estimate", paymentDate: "2026-03-01", amount: 14, status: "estimated" as const }];
    const history = reconcilePaymentPriceHistory([], payments);
    expect(history).toHaveLength(1); expect(history[0]).toMatchObject({ previousPrice: 10, newPrice: 14, effectiveDate: "2026-02-01", paymentId: "two" });
    expect(recordedSpend(payments)).toBe(24);
  });
  it("matches a legacy image payment to its new source-aware version", () => {
    const legacy = { id: "old", paymentDate: "2026-07-19", amount: 12, status: "paid" as const, note: "Imported from IMG_1001.jpg" };
    const sameFile = { ...legacy, id: "new", importSourceId: "IMG_1001.jpg:1200:1234:0" };
    const differentFile = { ...sameFile, id: "other", note: "Imported from IMG_1002.jpg", importSourceId: "IMG_1002.jpg:1200:1235:0" };
    expect(samePaymentRecord(legacy, sameFile)).toBe(true); expect(samePaymentRecord(sameFile, differentFile)).toBe(false);
  });
});
