import { inferCategory, nextRenewalFromCharge, parseDateValue, parseMoney, subscriptionMatchKey, type ImportConfidence, type SmartImportCandidate } from "./smart-import";
import type { BillingFrequency, Payment } from "./types";

export type StatementClassification = "recurring" | "normal" | "review";

export interface BankTransaction {
  id: string;
  merchant: string;
  amount: number;
  currency: string;
  date: string;
  direction: "debit" | "credit" | "unknown";
  source: string;
  sourceId?: string;
}

export interface StatementMerchantGroup {
  id: string;
  key: string;
  merchant: string;
  currency: string;
  classification: StatementClassification;
  confidence: ImportConfidence;
  reason: string;
  billingFrequency: BillingFrequency;
  transactions: BankTransaction[];
}

const dateHeaders = ["date", "transaction date", "booking date", "posted date", "value date", "charged date"];
const merchantHeaders = ["description", "merchant", "payee", "vendor", "details", "narrative", "transaction", "name"];
const amountHeaders = ["amount", "debit", "withdrawal", "spent", "outflow", "charge"];
const creditHeaders = ["credit", "deposit", "money in", "inflow"];
const currencyHeaders = ["currency", "currency code", "ccy"];
const recurringPattern = /\b(?:netflix|spotify|adobe|amazon prime|youtube premium|icloud|google one|dropbox|notion|canva|microsoft|office 365|github|chatgpt|openai|hosting|insurance|membership|subscription|broadband|internet|mobile plan|gym)\b/i;
const ordinaryPattern = /\b(?:supermarket|grocery|restaurant|cafe|coffee|bakery|pharmacy|petrol|fuel|taxi|uber|atm|cash|transfer|marketplace|ikea|zara|clothing|hotel|airline|parking)\b/i;
const nonSpendPattern = /\b(?:salary|payroll|refund|reversal|cashback|interest|deposit|received|money in|internal transfer)\b/i;
const datePattern = /\b\d{4}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{1,2}\b|\b\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4}\b|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*,?\s*\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?\s*,?\s*\d{2,4}\b/i;
const moneyPattern = /(?:€|£|\$|₹|\b(?:EUR|USD|GBP|INR|CAD|AUD|JPY)\b)?\s*\(?-?\d+(?:[.,]\d{1,2})\)?(?:\s*\b(?:EUR|USD|GBP|INR|CAD|AUD|JPY)\b)?/gi;

function uid(): string { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function normalized(value: unknown): string { return String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " "); }
function findHeader(headers: string[], aliases: string[]): number { return headers.findIndex((header) => aliases.some((alias) => header === alias || header.includes(alias))); }

function cleanStatementMerchant(value: unknown): string {
  const raw = String(value ?? "").replace(datePattern, " ").replace(/\b(?:card|visa|mastercard|pos|purchase|online|contactless|direct debit|sepa|transaction|reference|ref)\b/gi, " ").replace(/\b\d{4,}\b/g, " ").replace(/[*#_|]+/g, " ").replace(/\s+/g, " ").trim();
  return raw.replace(/^\d{1,2}\s+(?=[a-z])/i, "").slice(0, 80);
}

function merchantKey(merchant: string): string {
  const known = subscriptionMatchKey(merchant); const generic = normalized(merchant).replace(/[^a-z0-9 ]/g, " ").replace(/\b(?:store|shop|payment|limited|ltd|inc|gmbh|sas|sa)\b/g, " ").replace(/\s+/g, " ").trim();
  return recurringPattern.test(merchant) ? known : generic.split(" ").slice(0, 4).join(" ");
}

function signedDirection(value: unknown, header = ""): BankTransaction["direction"] {
  const text = `${header} ${String(value ?? "")}`;
  if (nonSpendPattern.test(text) || /\bcredit\b/i.test(header)) return "credit";
  if (/\b(?:debit|withdrawal|spent|outflow|charge)\b/i.test(header) || /[-(]\s*(?:€|£|\$|₹)?\s*\d/.test(String(value ?? ""))) return "debit";
  return "unknown";
}

export function parseBankStatementRows(rows: unknown[][], fallbackCurrency = "EUR", source = "Bank statement"): BankTransaction[] {
  const meaningful = rows.filter((row) => row.some((cell) => String(cell ?? "").trim()));
  const headerIndex = meaningful.findIndex((row) => {
    const headers = row.map(normalized); return findHeader(headers, dateHeaders) >= 0 && findHeader(headers, merchantHeaders) >= 0 && (findHeader(headers, amountHeaders) >= 0 || findHeader(headers, creditHeaders) >= 0);
  });
  if (headerIndex < 0) return [];
  const headers = meaningful[headerIndex].map(normalized); const dateColumn = findHeader(headers, dateHeaders); const merchantColumn = findHeader(headers, merchantHeaders); const debitColumn = findHeader(headers, amountHeaders); const creditColumn = findHeader(headers, creditHeaders); const currencyColumn = findHeader(headers, currencyHeaders);
  return meaningful.slice(headerIndex + 1).flatMap((row, index) => {
    const date = parseDateValue(row[dateColumn]); const merchant = cleanStatementMerchant(row[merchantColumn]);
    const debitValue = debitColumn >= 0 ? row[debitColumn] : undefined; const creditValue = creditColumn >= 0 ? row[creditColumn] : undefined; const value = String(debitValue ?? "").trim() ? debitValue : creditValue;
    const currencyHint = currencyColumn >= 0 ? String(row[currencyColumn] || fallbackCurrency) : fallbackCurrency; const money = parseMoney(value, currencyHint); const direction = nonSpendPattern.test(merchant) ? "credit" : String(debitValue ?? "").trim() ? signedDirection(debitValue, headers[debitColumn]) : signedDirection(creditValue, headers[creditColumn] ?? "");
    if (!date || !merchant || !money?.amount) return [];
    return [{ id: uid(), merchant, amount: money.amount, currency: money.currency, date, direction, source, sourceId: `${source}:row-${headerIndex + index + 2}` }];
  });
}

export function parseBankStatementText(text: string, fallbackCurrency = "EUR", source = "Bank statement"): BankTransaction[] {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter((line) => line.length > 1); const transactions: BankTransaction[] = []; let activeDate: string | null = null;
  lines.forEach((line, index) => {
    const token = line.match(datePattern)?.[0]; const parsedDate = token ? parseDateValue(token) : null;
    if (parsedDate) activeDate = parsedDate;
    if (/\b(?:opening|closing|available|current) balance|\b(?:subtotal|statement total)\b/i.test(line)) return;
    const withoutDate = token ? line.replace(token, " ") : line; const moneyMatches = [...withoutDate.matchAll(moneyPattern)]; if (!moneyMatches.length || !activeDate) return;
    const match = moneyMatches.find((candidate) => /[€£$₹]|\b(?:EUR|USD|GBP|INR|CAD|AUD|JPY)\b|[.,]\d{1,2}\b/i.test(candidate[0])) ?? moneyMatches[0]; const money = parseMoney(match[0], fallbackCurrency); if (!money?.amount) return;
    const before = withoutDate.slice(0, match.index ?? 0); const after = withoutDate.slice((match.index ?? 0) + match[0].length); const merchant = cleanStatementMerchant(before.length >= 2 ? before : after);
    if (!merchant || !/[a-z]{2}/i.test(merchant) || nonSpendPattern.test(merchant)) return;
    transactions.push({ id: uid(), merchant, amount: money.amount, currency: money.currency, date: activeDate, direction: signedDirection(match[0], line), source, sourceId: `${source}:line-${index + 1}` });
  });
  return transactions;
}

function daysBetween(left: string, right: string): number { return Math.round((Date.parse(`${right}T12:00:00`) - Date.parse(`${left}T12:00:00`)) / 86400000); }

function cadenceFor(transactions: BankTransaction[]): { frequency: BillingFrequency; matches: number; intervals: number[] } | null {
  const dates = [...new Set(transactions.map((item) => item.date))].sort(); const intervals = dates.slice(1).map((date, index) => daysBetween(dates[index], date)); if (!intervals.length) return null;
  const ranges: Array<{ frequency: BillingFrequency; min: number; max: number }> = [{ frequency: "weekly", min: 5, max: 9 }, { frequency: "monthly", min: 20, max: 40 }, { frequency: "bimonthly", min: 45, max: 75 }, { frequency: "quarterly", min: 76, max: 110 }, { frequency: "biannual", min: 150, max: 215 }, { frequency: "yearly", min: 330, max: 400 }];
  const ranked = ranges.map((range) => ({ ...range, matches: intervals.filter((days) => days >= range.min && days <= range.max).length })).sort((a, b) => b.matches - a.matches);
  return ranked[0].matches > 0 ? { frequency: ranked[0].frequency, matches: ranked[0].matches, intervals } : null;
}

export function classifyBankTransactions(items: BankTransaction[]): StatementMerchantGroup[] {
  const unique = items.filter((item, index, all) => all.findIndex((other) => merchantKey(other.merchant) === merchantKey(item.merchant) && other.currency === item.currency && other.date === item.date && other.amount === item.amount) === index);
  const grouped = new Map<string, BankTransaction[]>(); unique.filter((item) => item.direction !== "credit").forEach((item) => { const key = `${merchantKey(item.merchant)}|${item.currency}`; grouped.set(key, [...(grouped.get(key) ?? []), item]); });
  return [...grouped.entries()].map(([compoundKey, transactions]) => {
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date)); const merchant = sorted[0].merchant; const knownRecurring = recurringPattern.test(merchant); const ordinary = ordinaryPattern.test(merchant); const cadence = cadenceFor(sorted); const cadenceRatio = cadence ? cadence.matches / cadence.intervals.length : 0;
    const amounts = sorted.map((item) => item.amount); const amountRatio = Math.max(...amounts) / Math.max(0.01, Math.min(...amounts)); const stableAmount = amountRatio <= 1.25;
    let classification: StatementClassification = "normal"; let confidence: ImportConfidence = "high"; let reason = "Appears to be an isolated or everyday purchase."; let billingFrequency: BillingFrequency = cadence?.frequency ?? "monthly";
    if (!ordinary && cadence && cadenceRatio >= (cadence.intervals.length >= 2 ? 0.67 : 1) && (stableAmount || knownRecurring)) {
      classification = "recurring"; confidence = cadence.intervals.length >= 2 && stableAmount ? "high" : "medium"; reason = `${sorted.length} charges follow a ${billingFrequency} pattern${stableAmount ? " with similar amounts" : ""}.`;
    } else if (!ordinary && knownRecurring) {
      classification = "recurring"; confidence = sorted.length > 1 ? "medium" : "low"; reason = sorted.length > 1 ? "Repeated charges from a commonly recurring provider." : "Known recurring provider, but only one charge was found.";
    } else if (sorted.length > 1 && !ordinary) {
      classification = "review"; confidence = "low"; reason = "This merchant repeats, but the dates or amounts do not form a reliable schedule.";
    }
    return { id: compoundKey, key: compoundKey.split("|")[0], merchant, currency: sorted[0].currency, classification, confidence, reason, billingFrequency, transactions: sorted };
  }).sort((a, b) => ({ recurring: 0, review: 1, normal: 2 }[a.classification] - { recurring: 0, review: 1, normal: 2 }[b.classification]) || a.merchant.localeCompare(b.merchant));
}

export function statementGroupToCandidate(group: StatementMerchantGroup): SmartImportCandidate {
  const payments: Payment[] = group.transactions.map((transaction) => ({ id: `statement-${transaction.id}`, paymentDate: transaction.date, amount: transaction.amount, status: "paid", note: `Imported from ${transaction.source}`, importSourceId: transaction.sourceId ?? transaction.id }));
  const latest = payments.at(-1)!; const promoted = group.classification !== "recurring";
  return { id: uid(), selected: true, name: group.merchant, price: latest.amount, currency: group.currency, billingFrequency: group.billingFrequency, nextPaymentDate: nextRenewalFromCharge(latest.paymentDate, group.billingFrequency), category: inferCategory(group.merchant), note: "Imported from bank statement analysis", confidence: promoted ? "low" : group.confidence, warnings: [promoted ? "You marked this bank-statement merchant as a subscription. Review its billing cycle." : group.reason], source: `${group.transactions.length} bank statement charge${group.transactions.length === 1 ? "" : "s"}`, sourceId: `statement-group:${group.id}`, paymentDate: latest.paymentDate, firstPaymentDate: payments[0].paymentDate, payments, chargeCount: payments.length };
}
