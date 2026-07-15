import type { BillingFrequency, Subscription } from "./types";

const MS_DAY = 86_400_000;

export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayDateOnly(): string {
  return toDateOnly(new Date());
}

export function daysUntil(value: string, today = todayDateOnly()): number {
  return Math.round((parseDateOnly(value).getTime() - parseDateOnly(today).getTime()) / MS_DAY);
}

export function yearlyEquivalent(subscription: Pick<Subscription, "price" | "billingFrequency" | "customIntervalNumber" | "customIntervalUnit">): number {
  const { price, billingFrequency: frequency } = subscription;
  const multiplier: Partial<Record<BillingFrequency, number>> = {
    weekly: 52, monthly: 12, bimonthly: 6, quarterly: 4, biannual: 2, yearly: 1, "one-time": 0,
  };
  if (frequency !== "custom") return price * (multiplier[frequency] ?? 0);
  const interval = Math.max(1, subscription.customIntervalNumber ?? 1);
  const custom: Record<string, number> = { days: 365 / interval, weeks: 52 / interval, months: 12 / interval, years: 1 / interval };
  return price * (custom[subscription.customIntervalUnit ?? "months"] ?? 0);
}

export function monthlyEquivalent(subscription: Pick<Subscription, "price" | "billingFrequency" | "customIntervalNumber" | "customIntervalUnit">): number {
  return yearlyEquivalent(subscription) / 12;
}

function addMonthsClamped(date: Date, months: number): Date {
  const day = date.getDate();
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0, 12).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

export function calculateNextPaymentDate(dateValue: string, frequency: BillingFrequency, interval = 1, unit: Subscription["customIntervalUnit"] = "months"): string {
  const date = parseDateOnly(dateValue);
  if (frequency === "one-time") return dateValue;
  if (frequency === "weekly") date.setDate(date.getDate() + 7);
  else if (frequency === "monthly") return toDateOnly(addMonthsClamped(date, 1));
  else if (frequency === "bimonthly") return toDateOnly(addMonthsClamped(date, 2));
  else if (frequency === "quarterly") return toDateOnly(addMonthsClamped(date, 3));
  else if (frequency === "biannual") return toDateOnly(addMonthsClamped(date, 6));
  else if (frequency === "yearly") return toDateOnly(addMonthsClamped(date, 12));
  else if (frequency === "custom") {
    if (unit === "days") date.setDate(date.getDate() + interval);
    if (unit === "weeks") date.setDate(date.getDate() + interval * 7);
    if (unit === "months") return toDateOnly(addMonthsClamped(date, interval));
    if (unit === "years") return toDateOnly(addMonthsClamped(date, interval * 12));
  }
  return toDateOnly(date);
}

export function formatMoney(amount: number, currency: string): string {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

export function formatDate(value: string, format: string, compact = false): string {
  const date = parseDateOnly(value);
  if (compact) return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date);
  if (format === "YYYY-MM-DD") return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return format === "MM/DD/YYYY" ? `${month}/${day}/${date.getFullYear()}` : `${day}/${month}/${date.getFullYear()}`;
}

export function frequencyLabel(value: BillingFrequency, interval?: number, unit?: string): string {
  const labels: Record<BillingFrequency, string> = { weekly: "Weekly", monthly: "Monthly", bimonthly: "Every 2 months", quarterly: "Quarterly", biannual: "Every 6 months", yearly: "Yearly", custom: `Every ${interval ?? 1} ${unit ?? "months"}`, "one-time": "One-time" };
  return labels[value];
}
