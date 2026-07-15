import { calculateNextPaymentDate, todayDateOnly, toDateOnly } from "./calculations";
import { categories, frequencies, type BillingFrequency, type Subscription } from "./types";

export type ImportConfidence = "high" | "medium" | "low";

export interface SmartImportCandidate {
  id: string;
  selected: boolean;
  name: string;
  price: number;
  currency: string;
  billingFrequency: BillingFrequency;
  nextPaymentDate: string;
  category: string;
  note: string;
  confidence: ImportConfidence;
  warnings: string[];
  source: string;
}

const headerAliases = {
  name: ["name", "subscription", "merchant", "vendor", "service", "description", "payee"],
  price: ["price", "amount", "cost", "charge", "payment"],
  currency: ["currency", "currency code", "ccy"],
  frequency: ["billing frequency", "frequency", "billing cycle", "cycle", "renewal"],
  date: ["next payment date", "next payment", "renewal date", "date", "due date"],
  category: ["category", "type"],
  note: ["note", "notes", "memo", "description"],
} as const;

const recurringVendors = ["netflix", "spotify", "adobe", "amazon prime", "youtube", "icloud", "google one", "dropbox", "notion", "canva", "microsoft", "office 365", "github", "chatgpt", "openai", "gym", "hosting", "insurance", "membership"];

function uid(): string { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function normalize(value: unknown): string { return String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " "); }
function findColumn(headers: string[], aliases: readonly string[]): number { return headers.findIndex((header) => aliases.some((alias) => header === alias || header.includes(alias))); }

export function inferFrequency(value: unknown): BillingFrequency {
  const text = normalize(value);
  if (frequencies.includes(text as BillingFrequency)) return text as BillingFrequency;
  if (/one[ -]?time|single/.test(text)) return "one-time";
  if (/week/.test(text)) return "weekly";
  if (/quarter|3 month/.test(text)) return "quarterly";
  if (/6 month|half[ -]?year|semiannual|biannual/.test(text)) return "biannual";
  if (/2 month|bi[ -]?month/.test(text)) return "bimonthly";
  if (/annual|year/.test(text)) return "yearly";
  return "monthly";
}

export function inferCategory(name: string): string {
  const text = normalize(name);
  if (/netflix|spotify|youtube|disney|hulu|prime video|cinema|music/.test(text)) return "Entertainment";
  if (/openai|chatgpt|claude|midjourney| ai |copilot/.test(` ${text} `)) return "AI tools";
  if (/adobe|microsoft|github|notion|canva|dropbox|software|app/.test(text)) return "Software";
  if (/host|domain|cloudflare|aws|digitalocean|server/.test(text)) return "Website and hosting";
  if (/gym|fitness|yoga|health/.test(text)) return "Fitness";
  if (/course|school|academy|learn|university/.test(text)) return "Education";
  if (/bank|insurance|finance|accounting/.test(text)) return "Finance";
  if (/electric|water|gas|phone|internet|utility/.test(text)) return "Utilities";
  return "Other";
}

export function parseMoney(value: unknown, currencyHint = "EUR"): { amount: number; currency: string } | null {
  if (typeof value === "number" && Number.isFinite(value)) return { amount: Math.abs(value), currency: currencyHint };
  const text = String(value ?? "").trim();
  const dollarHint = ["USD", "CAD", "AUD"].includes(currencyHint) ? currencyHint : "USD";
  const currency = text.includes("€") || /\bEUR\b/i.test(text) ? "EUR" : text.includes("£") || /\bGBP\b/i.test(text) ? "GBP" : text.includes("₹") || /\bINR\b/i.test(text) ? "INR" : /\bCAD\b/i.test(text) ? "CAD" : /\bAUD\b/i.test(text) ? "AUD" : text.includes("¥") || /\bJPY\b/i.test(text) ? "JPY" : text.includes("$") || /\bUSD\b/i.test(text) ? dollarHint : currencyHint;
  const match = text.replace(/\s/g, "").match(/-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})|-?\d+(?:[.,]\d{1,2})?/);
  if (!match) return null;
  let raw = match[0];
  const lastComma = raw.lastIndexOf(","); const lastDot = raw.lastIndexOf(".");
  if (lastComma > lastDot) raw = raw.replaceAll(".", "").replace(",", "."); else raw = raw.replaceAll(",", "");
  const amount = Math.abs(Number(raw)); return Number.isFinite(amount) ? { amount, currency } : null;
}

function nextDefault(frequency: BillingFrequency): string {
  const today = todayDateOnly(); return calculateNextPaymentDate(today, frequency);
}

export function normalizeDate(value: unknown, frequency: BillingFrequency): { date: string; inferred: boolean } {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { date: toDateOnly(value), inferred: false };
  const text = String(value ?? "").trim();
  let date: Date | null = null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) date = new Date(`${text.slice(0, 10)}T12:00:00`);
  else {
    const numeric = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/);
    if (numeric) { const year = Number(numeric[3]) < 100 ? 2000 + Number(numeric[3]) : Number(numeric[3]); date = new Date(year, Number(numeric[2]) - 1, Number(numeric[1]), 12); }
    else { const parsed = Date.parse(text); if (!Number.isNaN(parsed)) date = new Date(parsed); }
  }
  if (!date || Number.isNaN(date.getTime())) return { date: nextDefault(frequency), inferred: true };
  let normalized = toDateOnly(date); let guard = 0;
  while (normalized < todayDateOnly() && frequency !== "one-time" && guard++ < 120) normalized = calculateNextPaymentDate(normalized, frequency);
  return { date: normalized, inferred: false };
}

function candidate(input: Partial<SmartImportCandidate> & Pick<SmartImportCandidate, "name" | "price" | "currency" | "billingFrequency" | "nextPaymentDate" | "source">): SmartImportCandidate {
  const warnings = input.warnings ?? [];
  return { id: uid(), selected: input.selected ?? true, category: input.category || inferCategory(input.name), note: input.note ?? "Imported from a document", confidence: input.confidence ?? (warnings.length ? "medium" : "high"), warnings, ...input };
}

export function parseSpreadsheetRows(rows: unknown[][], fallbackCurrency = "EUR", source = "Spreadsheet"): SmartImportCandidate[] {
  const meaningful = rows.filter((row) => row.some((cell) => String(cell ?? "").trim()));
  if (!meaningful.length) return [];
  const normalizedHeaders = meaningful[0].map(normalize);
  const columns = Object.fromEntries(Object.entries(headerAliases).map(([key, aliases]) => [key, findColumn(normalizedHeaders, aliases)])) as Record<keyof typeof headerAliases, number>;
  const hasHeaders = columns.name >= 0 && columns.price >= 0;
  const dataRows = hasHeaders ? meaningful.slice(1) : meaningful;
  return dataRows.flatMap((row, index) => {
    const nameValue = hasHeaders ? row[columns.name] : row[0]; const priceValue = hasHeaders ? row[columns.price] : row[1];
    const name = String(nameValue ?? "").trim(); const money = parseMoney(priceValue, hasHeaders && columns.currency >= 0 ? String(row[columns.currency] || fallbackCurrency) : fallbackCurrency);
    if (!name || !money || money.amount <= 0) return [];
    const frequency = inferFrequency(hasHeaders && columns.frequency >= 0 ? row[columns.frequency] : "monthly");
    const normalizedDate = normalizeDate(hasHeaders && columns.date >= 0 ? row[columns.date] : "", frequency);
    const warnings = [...(!hasHeaders ? ["Column names were not found; the first two columns were treated as name and price."] : []), ...(normalizedDate.inferred ? ["Next payment date was estimated."] : [])];
    return [candidate({ name, price: money.amount, currency: money.currency, billingFrequency: frequency, nextPaymentDate: normalizedDate.date, category: hasHeaders && columns.category >= 0 ? String(row[columns.category] || "") : inferCategory(name), note: hasHeaders && columns.note >= 0 ? String(row[columns.note] || "Imported from spreadsheet") : `Imported from ${source}, row ${index + (hasHeaders ? 2 : 1)}`, warnings, confidence: !hasHeaders || normalizedDate.inferred ? "medium" : "high", source })];
  });
}

function cleanMerchant(raw: string): string {
  return raw.replace(/\b(?:monthly|weekly|yearly|annual(?:ly)?|quarterly|subscription|renewal|recurring|payment|paid|due|debit|credit)\b/gi, " ").replace(/\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b/g, " ").replace(/[|•*#:_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function parseDocumentText(text: string, fallbackCurrency = "EUR", source = "Document"): SmartImportCandidate[] {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter((line) => line.length > 2);
  const results: SmartImportCandidate[] = [];
  for (const line of lines) {
    if (/\b(total|subtotal|tax|vat|balance|invoice total|amount due)\b/i.test(line)) continue;
    const moneyMatches = [...line.matchAll(/(?:€|£|\$|₹|\b(?:EUR|USD|GBP|INR|CAD|AUD)\b)?\s*-?\d+(?:[.,]\d{1,2})/gi)];
    if (!moneyMatches.length) continue;
    const lastMoney = moneyMatches[moneyMatches.length - 1]; const parsed = parseMoney(lastMoney[0], fallbackCurrency); if (!parsed || parsed.amount <= 0) continue;
    const before = line.slice(0, lastMoney.index ?? 0); const after = line.slice((lastMoney.index ?? 0) + lastMoney[0].length);
    let name = cleanMerchant(before); if (name.length < 2) name = cleanMerchant(after);
    name = name.replace(/^\d{4,}\s+/, "").slice(0, 80).trim();
    if (name.length < 2 || /^\d+$/.test(name)) continue;
    const frequency = inferFrequency(line); const dateMatch = line.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4}\b/i);
    const normalizedDate = normalizeDate(dateMatch?.[0] ?? "", frequency);
    const hasRecurringWord = /week|month|quarter|annual|year|subscription|renewal|recurring/i.test(line); const knownVendor = recurringVendors.some((vendor) => normalize(name).includes(vendor));
    if (!hasRecurringWord && !knownVendor) continue;
    const warnings = [...(!hasRecurringWord ? ["Billing frequency was estimated as monthly."] : []), ...(normalizedDate.inferred ? ["Next payment date was estimated."] : [])];
    results.push(candidate({ name, price: parsed.amount, currency: parsed.currency, billingFrequency: frequency, nextPaymentDate: normalizedDate.date, source, warnings, confidence: hasRecurringWord && !normalizedDate.inferred ? "high" : knownVendor ? "medium" : "low" }));
  }
  return results.filter((item, index, all) => all.findIndex((other) => normalize(other.name) === normalize(item.name) && other.price === item.price) === index).slice(0, 100);
}

export function candidateToSubscription(candidate: SmartImportCandidate): Partial<Subscription> & Pick<Subscription, "name" | "price" | "billingFrequency" | "nextPaymentDate"> {
  return { name: candidate.name, price: candidate.price, currency: candidate.currency, billingFrequency: candidate.billingFrequency, nextPaymentDate: candidate.nextPaymentDate, category: categories.includes(candidate.category) ? candidate.category : "Other", note: candidate.note, status: "active", autoRenewalStatus: "unknown", reminderDaysBefore: 3 };
}
