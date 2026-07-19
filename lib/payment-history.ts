import { calculateNextPaymentDate, todayDateOnly } from "./calculations";
import type { Payment, PriceChange, Subscription } from "./types";

export function normalizePriceHistory(history: PriceChange[]): PriceChange[] {
  const sorted = [...history].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.id.localeCompare(b.id));
  if (!sorted.length) return [];
  let previous = sorted[0].previousPrice;
  return sorted.map((change) => { const normalized = { ...change, previousPrice: previous }; previous = change.newPrice; return normalized; });
}

export function confirmedPayments(payments: Payment[]): Payment[] {
  return payments.filter((payment) => payment.status !== "estimated").sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.id.localeCompare(b.id));
}

export function samePaymentRecord(left: Payment, right: Payment): boolean {
  if (left.paymentDate !== right.paymentDate || left.amount !== right.amount || left.status !== right.status) return false;
  if (left.importSourceId && right.importSourceId) return left.importSourceId === right.importSourceId;
  return (left.note ?? "") === (right.note ?? "");
}

export function priceChangesFromPayments(payments: Payment[]): PriceChange[] {
  const paid = confirmedPayments(payments).filter((payment) => payment.status === "paid");
  if (paid.length < 2) return [];
  let previous = paid[0].amount;
  return paid.slice(1).flatMap((payment) => {
    if (payment.amount === previous) return [];
    const change: PriceChange = { id: `payment-price-${payment.id}`, paymentId: payment.id, previousPrice: previous, newPrice: payment.amount, effectiveDate: payment.paymentDate, note: "Renewal amount updated from a recorded charge" };
    previous = payment.amount;
    return [change];
  });
}

export function reconcilePaymentPriceHistory(history: PriceChange[], payments: Payment[]): PriceChange[] {
  const manual = history.filter((change) => !change.paymentId);
  const inferred = priceChangesFromPayments(payments).filter((change) => !manual.some((item) => item.effectiveDate === change.effectiveDate && item.newPrice === change.newPrice));
  return normalizePriceHistory([...manual, ...inferred]);
}

export function recordedSpend(payments: Payment[]): number {
  return confirmedPayments(payments).filter((payment) => payment.status === "paid").reduce((total, payment) => total + payment.amount, 0);
}

export function priceAtDate(subscription: Pick<Subscription, "price" | "priceHistory">, date: string): number {
  const history = normalizePriceHistory(subscription.priceHistory);
  if (!history.length) return subscription.price;
  let price = history[0].previousPrice;
  history.forEach((change) => { if (change.effectiveDate <= date) price = change.newPrice; });
  return price;
}

export function buildEstimatedPaymentHistory(subscription: Subscription, today = todayDateOnly()): Payment[] {
  const confirmed = confirmedPayments(subscription.payments);
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
