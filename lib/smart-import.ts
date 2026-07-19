import { calculateNextPaymentDate, todayDateOnly, toDateOnly } from "./calculations";
import { reconcilePaymentPriceHistory, samePaymentRecord } from "./payment-history";
import { categories, frequencies, type BillingFrequency, type Payment, type PriceChange, type Subscription } from "./types";

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
  sourceId?: string;
  paymentDate?: string;
  firstPaymentDate?: string;
  payments?: Payment[];
  priceHistory?: PriceChange[];
  chargeCount?: number;
}

const headerAliases = {
  name: ["name", "subscription", "merchant", "vendor", "service", "description", "payee"],
  price: ["price", "amount", "cost", "charge", "payment"],
  currency: ["currency", "currency code", "ccy"],
  frequency: ["billing frequency", "frequency", "billing cycle", "cycle", "renewal"],
  nextDate: ["next payment date", "next payment", "renewal date", "due date"],
  paymentDate: ["payment date", "transaction date", "charged date", "charge date", "date"],
  category: ["category", "type"],
  note: ["note", "notes", "memo", "description"],
} as const;

const recurringVendors = ["netflix", "spotify", "adobe", "amazon prime", "youtube", "icloud", "google one", "dropbox", "notion", "canva", "microsoft", "office 365", "github", "chatgpt", "openai", "gym", "hosting", "insurance", "membership"];

function uid(): string { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function normalize(value: unknown): string { return String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " "); }
function findColumn(headers: string[], aliases: readonly string[]): number { return headers.findIndex((header) => aliases.some((alias) => header === alias || header.includes(alias))); }

export function subscriptionMatchKey(name: string): string {
  const text = normalize(name).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const known = recurringVendors.find((vendor) => text.includes(vendor));
  return known ?? text.replace(/\b(?:com|ltd|limited|inc|invoice|receipt|payment|subscription|renewal)\b/g, " ").replace(/\s+/g, " ").trim();
}

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

export function parseDateValue(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return toDateOnly(value);
  const text = String(value ?? "").trim().replace(/(\d)(?:st|nd|rd|th)\b/gi, "$1");
  let date: Date | null = null;
  const iso = text.match(/\b(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})\b/);
  if (iso) date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
  else {
    const numeric = text.match(/\b(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{2,4})\b/);
    if (numeric) { const year = Number(numeric[3]) < 100 ? 2000 + Number(numeric[3]) : Number(numeric[3]); date = new Date(year, Number(numeric[2]) - 1, Number(numeric[1]), 12); }
    else { const parsed = Date.parse(text); if (!Number.isNaN(parsed)) date = new Date(parsed); }
  }
  return date && !Number.isNaN(date.getTime()) ? toDateOnly(date) : null;
}

const receiptDatePattern = /\b\d{4}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{1,2}\b|\b\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4}\b|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*,?\s*\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?\s*,?\s*\d{2,4}\b/gi;

function dateTokens(text: string): string[] {
  return [...text.matchAll(receiptDatePattern)].map((match) => match[0]);
}

export function nextRenewalFromCharge(date: string, frequency: BillingFrequency): string {
  if (frequency === "one-time") return date;
  let next = calculateNextPaymentDate(date, frequency); let guard = 0;
  while (next <= todayDateOnly() && guard++ < 240) next = calculateNextPaymentDate(next, frequency);
  return next;
}

export function normalizeDate(value: unknown, frequency: BillingFrequency): { date: string; inferred: boolean } {
  const parsed = parseDateValue(value);
  if (!parsed) return { date: nextDefault(frequency), inferred: true };
  let normalized = parsed; let guard = 0;
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
  if (columns.paymentDate === columns.nextDate && columns.paymentDate >= 0 && normalizedHeaders[columns.paymentDate] !== "date") columns.paymentDate = -1;
  const hasHeaders = columns.name >= 0 && columns.price >= 0;
  const dataRows = hasHeaders ? meaningful.slice(1) : meaningful;
  return dataRows.flatMap((row, index) => {
    const nameValue = hasHeaders ? row[columns.name] : row[0]; const priceValue = hasHeaders ? row[columns.price] : row[1];
    const name = String(nameValue ?? "").trim(); const money = parseMoney(priceValue, hasHeaders && columns.currency >= 0 ? String(row[columns.currency] || fallbackCurrency) : fallbackCurrency);
    if (!name || !money || money.amount <= 0) return [];
    const frequency = inferFrequency(hasHeaders && columns.frequency >= 0 ? row[columns.frequency] : "monthly");
    const paymentDate = hasHeaders && columns.paymentDate >= 0 ? parseDateValue(row[columns.paymentDate]) ?? undefined : undefined;
    const normalizedDate = hasHeaders && columns.nextDate >= 0 ? normalizeDate(row[columns.nextDate], frequency) : paymentDate ? { date: nextRenewalFromCharge(paymentDate, frequency), inferred: false } : normalizeDate("", frequency);
    const warnings = [...(!hasHeaders ? ["Column names were not found; the first two columns were treated as name and price."] : []), ...(normalizedDate.inferred ? ["Next payment date was estimated."] : [])];
    return [candidate({ name, price: money.amount, currency: money.currency, billingFrequency: frequency, nextPaymentDate: normalizedDate.date, paymentDate, category: hasHeaders && columns.category >= 0 ? String(row[columns.category] || "") : inferCategory(name), note: hasHeaders && columns.note >= 0 ? String(row[columns.note] || "Imported from spreadsheet") : `Imported from ${source}, row ${index + (hasHeaders ? 2 : 1)}`, warnings, confidence: !hasHeaders || normalizedDate.inferred ? "medium" : "high", source })];
  });
}

function cleanMerchant(raw: string): string {
  const cleaned = raw.replace(/\b(?:monthly|weekly|yearly|annual(?:ly)?|quarterly|subscription|renewal|recurring|payment|paid|due|debit|credit|transaction|merchant|details?|successful(?:ly)?)\b/gi, " ").replace(/\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b/g, " ").replace(/[|•*#:_-]+/g, " ").replace(/\s+/g, " ").trim();
  const withoutLogoMarker = cleaned.replace(/^\d{1,2}\s+(?=[a-z])/i, "");
  return recurringVendors.some((vendor) => normalize(withoutLogoMarker).includes(vendor)) ? withoutLogoMarker : cleaned;
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
    const frequency = inferFrequency(line); const parsedDate = parseDateValue(dateTokens(line)[0] ?? ""); const explicitCharge = /\b(?:paid|charged|charge|debit|transaction|card)\b/i.test(line); const imageReceipt = /\.(?:png|jpe?g|webp)$/i.test(source);
    const paymentDate = parsedDate && (parsedDate <= todayDateOnly() || explicitCharge) ? parsedDate : imageReceipt && !parsedDate ? "" : undefined;
    const normalizedDate = paymentDate ? { date: nextRenewalFromCharge(paymentDate, frequency), inferred: !parsedDate } : normalizeDate(parsedDate ?? "", frequency);
    const hasRecurringWord = /week|month|quarter|annual|year|subscription|renewal|recurring/i.test(line); const knownVendor = recurringVendors.some((vendor) => normalize(name).includes(vendor));
    if (!hasRecurringWord && !knownVendor) continue;
    const warnings = [...(!hasRecurringWord ? ["Billing frequency was estimated as monthly."] : []), ...(normalizedDate.inferred ? ["Next payment date was estimated."] : []), ...(imageReceipt && !parsedDate ? ["Payment date could not be read. Choose it below before importing."] : [])];
    results.push(candidate({ name, price: parsed.amount, currency: parsed.currency, billingFrequency: frequency, nextPaymentDate: normalizedDate.date, paymentDate, source, warnings, confidence: hasRecurringWord && !normalizedDate.inferred ? "high" : knownVendor ? "medium" : "low" }));
  }
  return results.slice(0, 100);
}

function receiptDate(lines: string[]): string | null {
  const found: Array<{ date: string; score: number; index: number }> = [];
  lines.forEach((line, index) => {
    const context = `${lines[index - 1] ?? ""} ${line}`; const combined = `${line} ${lines[index + 1] ?? ""}`;
    dateTokens(combined).forEach((token) => {
      const date = parseDateValue(token); if (!date) return;
      let score = date <= todayDateOnly() ? 20 : 0;
      if (/\b(?:charged|charge date|transaction|purchase|paid|payment date|billing date|order date)\b/i.test(context)) score += 120;
      else if (/\bdate\b/i.test(context)) score += 35;
      if (/\b(?:next|renewal|renews|due|expires)\b/i.test(context)) score -= 120;
      found.push({ date, score, index });
    });
  });
  return found.sort((a, b) => b.score - a.score || a.index - b.index)[0]?.date ?? null;
}

function receiptMerchant(lines: string[]): string {
  const known = lines.find((line) => recurringVendors.some((vendor) => normalize(line).includes(vendor)));
  if (known) return cleanMerchant(known).slice(0, 80);
  const labelledIndex = lines.findIndex((line) => /\b(?:merchant|payee|provider|seller|billed by|charged by|paid to)\b/i.test(line));
  if (labelledIndex >= 0) {
    const labelled = cleanMerchant(lines[labelledIndex]).slice(0, 80);
    if (labelled.length >= 2) return labelled;
    const following = cleanMerchant(lines[labelledIndex + 1] ?? "").slice(0, 80);
    if (following.length >= 2 && /[a-z]{2}/i.test(following)) return following;
  }
  const plausible = lines.find((line) => {
    const cleaned = cleanMerchant(line);
    return cleaned.length >= 2 && cleaned.length <= 80 && /[a-z]{2}/i.test(cleaned) && !/^(?:amount|total|subtotal|tax|vat|date|time|status|receipt|invoice|order|card|bank|thank you)$/i.test(cleaned) && !/(?:https?:\/\/|www\.|@)/i.test(cleaned) && !parseMoney(cleaned);
  });
  return cleanMerchant(plausible ?? "").slice(0, 80);
}

function receiptMoney(lines: string[], fallbackCurrency: string): { amount: number; currency: string } | null {
  const labelledIndexes = lines.map((line, index) => ({ index, score: /\bamount\b/i.test(line) ? 100 : /\btotal\b/i.test(line) ? 90 : /\b(?:paid|charged|charge)\b/i.test(line) ? 50 : 0 })).filter((item) => item.score).sort((a, b) => b.score - a.score || b.index - a.index);
  for (const { index } of labelledIndexes) {
    const parsed = parseMoney(`${lines[index]} ${lines[index + 1] ?? ""}`, fallbackCurrency);
    if (parsed?.amount) return parsed;
  }
  for (const line of lines) {
    if (/\b(?:date|time|invoice|order|reference)\b/i.test(line) || dateTokens(line).length) continue;
    const parsed = parseMoney(line, fallbackCurrency);
    if (parsed?.amount) return parsed;
  }
  return null;
}

function parseImageTransactionRows(lines: string[], fallbackCurrency: string, source: string): SmartImportCandidate[] {
  const rows: SmartImportCandidate[] = []; let activeDate: string | null = null;
  lines.forEach((line) => {
    const lineDate = parseDateValue(dateTokens(line)[0] ?? "");
    if (lineDate && lineDate <= todayDateOnly()) activeDate = lineDate;
    parseDocumentText(line, fallbackCurrency, source).forEach((item) => {
      const paymentDate = item.paymentDate || activeDate;
      if (!paymentDate || paymentDate > todayDateOnly()) return;
      rows.push({ ...item, paymentDate, firstPaymentDate: paymentDate, nextPaymentDate: nextRenewalFromCharge(paymentDate, item.billingFrequency), note: `Imported payment from ${source}`, warnings: item.warnings.filter((warning) => warning !== "Next payment date was estimated." && !warning.startsWith("Payment date could not be read.")), confidence: "high" });
    });
  });
  return rows;
}

export function parseImageReceiptText(text: string, fallbackCurrency = "EUR", source = "Receipt image"): SmartImportCandidate[] {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter((line) => line.length > 1);
  if (!lines.length) return [];
  const transactionRows = parseImageTransactionRows(lines, fallbackCurrency, source);
  if (transactionRows.length) return transactionRows;
  const direct = parseDocumentText(text, fallbackCurrency, source);
  const contextualDate = receiptDate(lines);
  if (direct.length) {
    if (direct.length !== 1 || !contextualDate) return direct;
    const item = direct[0]; const paymentDate = contextualDate <= todayDateOnly() ? contextualDate : item.paymentDate;
    return [{ ...item, paymentDate, firstPaymentDate: paymentDate, nextPaymentDate: paymentDate ? nextRenewalFromCharge(paymentDate, item.billingFrequency) : contextualDate, warnings: item.warnings.filter((warning) => warning !== "Next payment date was estimated.") }];
  }
  const name = receiptMerchant(lines); const money = receiptMoney(lines, fallbackCurrency);
  if (!name || !money || money.amount <= 0) return [];
  const frequency = inferFrequency(text); const paymentDate = contextualDate && contextualDate <= todayDateOnly() ? contextualDate : "";
  const nextPaymentDate = paymentDate ? nextRenewalFromCharge(paymentDate, frequency) : contextualDate ?? nextDefault(frequency);
  const recurringClue = /week|month|quarter|annual|year|subscription|renewal|recurring/i.test(text); const knownVendor = recurringVendors.some((vendor) => normalize(name).includes(vendor));
  const warnings = [...(!recurringClue ? ["Billing frequency was estimated as monthly."] : []), ...(!contextualDate ? ["Payment date could not be read. Choose it below before importing."] : []), ...(!knownVendor && !recurringClue ? ["Provider was inferred from the receipt; please review the name."] : [])];
  return [candidate({ name, price: money.amount, currency: money.currency, billingFrequency: frequency, nextPaymentDate, paymentDate, firstPaymentDate: paymentDate, source, note: `Imported payment from ${source}`, warnings, confidence: knownVendor || recurringClue ? "medium" : "low" })];
}

export function consolidateImportCandidates(items: SmartImportCandidate[]): SmartImportCandidate[] {
  const groups = new Map<string, SmartImportCandidate[]>();
  items.forEach((item) => { const key = `${subscriptionMatchKey(item.name)}|${item.currency}`; groups.set(key, [...(groups.get(key) ?? []), item]); });
  return [...groups.values()].map((group) => {
    const dated = group.flatMap((item) => item.payments?.length ? item.payments : item.paymentDate !== undefined ? [{ id: `import-payment-${item.id}`, paymentDate: item.paymentDate, amount: item.price, status: "paid" as const, note: `Imported from ${item.source}`, importSourceId: item.sourceId ?? `${item.source}:${item.id}` }] : []);
    const payments = dated.filter((payment, index, all) => all.findIndex((other) => samePaymentRecord(other, payment)) === index).sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.id.localeCompare(b.id));
    const validPayments = payments.filter((payment) => /^\d{4}-\d{2}-\d{2}$/.test(payment.paymentDate));
    const latest = validPayments.at(-1); const base = latest ? group.find((item) => item.paymentDate === latest.paymentDate && item.price === latest.amount) ?? group.at(-1)! : group.at(-1)!;
    const warnings = [...new Set(group.flatMap((item) => item.warnings))];
    if (group.length > 1) warnings.push(`${group.length} charges were grouped into one subscription.`);
    return { ...base, name: group[0].name, price: latest?.amount ?? base.price, nextPaymentDate: latest ? nextRenewalFromCharge(latest.paymentDate, base.billingFrequency) : base.nextPaymentDate, firstPaymentDate: validPayments.at(0)?.paymentDate, payments, priceHistory: reconcilePaymentPriceHistory([], validPayments), chargeCount: payments.length, warnings };
  });
}

export function candidateToSubscription(candidate: SmartImportCandidate): Partial<Subscription> & Pick<Subscription, "name" | "price" | "billingFrequency" | "nextPaymentDate"> {
  const payments = (candidate.payments ?? []).filter((payment) => /^\d{4}-\d{2}-\d{2}$/.test(payment.paymentDate)).map((payment) => ({ ...payment }));
  const latest = payments.length ? payments.reduce((current, payment) => payment.paymentDate >= current.paymentDate ? payment : current) : null;
  const firstPaymentDate = payments.length ? payments.reduce((first, payment) => payment.paymentDate < first ? payment.paymentDate : first, payments[0].paymentDate) : candidate.firstPaymentDate;
  return { name: candidate.name, price: latest?.amount ?? candidate.price, currency: candidate.currency, billingFrequency: candidate.billingFrequency, nextPaymentDate: candidate.nextPaymentDate, firstPaymentDate, payments, priceHistory: reconcilePaymentPriceHistory(candidate.priceHistory ?? [], payments), category: categories.includes(candidate.category) ? candidate.category : "Other", note: candidate.note, status: "active", autoRenewalStatus: "unknown", reminderDaysBefore: 3 };
}
