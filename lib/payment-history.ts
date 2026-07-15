import { calculateNextPaymentDate, todayDateOnly } from "./calculations";
import type { Payment, PriceChange, Subscription } from "./types";

export function normalizePriceHistory(history: PriceChange[]): PriceChange[] {
  const sorted = [...history].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.id.localeCompare(b.id));
  if (!sorted.length) return [];
  let previous = sorted[0].previousPrice;
  return sorted.map((change) => { const normalized = { ...change, previousPrice: previous }; previous = change.newPrice; return normalized; });
}

export function priceAtDate(subscription: Pick<Subscription, "price" | "priceHistory">, date: string): number {
  const history = normalizePriceHistory(subscription.priceHistory);
  if (!history.length) return subscription.price;
  let price = history[0].previousPrice;
  history.forEach((change) => { if (change.effectiveDate <= date) price = change.newPrice; });
  return price;
}

export function buildEstimatedPaymentHistory(subscription: Subscription, today = todayDateOnly()): Payment[] {
  const confirmed = subscription.payments.filter((payment) => payment.status !== "estimated");
  if (!subscription.firstPaymentDate || subscription.firstPaymentDate >= subscription.nextPaymentDate) return confirmed.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  const confirmedDates = new Set(confirmed.flatMap((payment) => [payment.paymentDate, payment.scheduledDate].filter(Boolean) as string[])); const estimated: Payment[] = [];
  let paymentDate = subscription.firstPaymentDate; let guard = 0;
  while (paymentDate < subscription.nextPaymentDate && paymentDate <= today && guard++ < 240) {
    if (!confirmedDates.has(paymentDate)) estimated.push({ id: `estimated-${subscription.id}-${paymentDate}`, paymentDate, amount: priceAtDate(subscription, paymentDate), status: "estimated", note: "Generated from the first payment date" });
    if (subscription.billingFrequency === "one-time") break;
    const next = calculateNextPaymentDate(paymentDate, subscription.billingFrequency, subscription.customIntervalNumber, subscription.customIntervalUnit);
    if (next <= paymentDate) break; paymentDate = next;
  }
  return [...confirmed, ...estimated].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
}
