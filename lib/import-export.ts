import { createSubscription } from "@/hooks/use-subscriptions";
import type { Subscription } from "./types";
import { frequencies } from "./types";

const headers = ["Name", "Price", "Currency", "Billing frequency", "Next payment date", "First payment date", "Category", "Reminder days", "Note", "Status", "Website URL"];

function escapeCsv(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function subscriptionsToCsv(items: Subscription[]): string {
  const rows = items.map((item) => [item.name, item.price, item.currency, item.billingFrequency, item.nextPaymentDate, item.firstPaymentDate ?? "", item.category, item.reminderDaysBefore ?? "", item.note, item.status, item.websiteUrl]);
  return [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function parseCsvLine(line: string): string[] {
  const output: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') { value += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { output.push(value.trim()); value = ""; }
    else value += char;
  }
  output.push(value.trim()); return output;
}

export function importSubscriptionsCsv(csv: string, fallbackCurrency: string): { items: Subscription[]; errors: string[] } {
  const lines = csv.replace(/\r/g, "").split("\n").filter(Boolean);
  if (lines.length < 2) return { items: [], errors: ["The CSV does not contain any subscription rows."] };
  const fileHeaders = parseCsvLine(lines[0]).map((value) => value.toLowerCase());
  const index = (name: string) => fileHeaders.indexOf(name.toLowerCase());
  const items: Subscription[] = []; const errors: string[] = [];
  lines.slice(1).forEach((line, rowIndex) => {
    const row = parseCsvLine(line); const rowNumber = rowIndex + 2;
    const name = row[index("Name")]; const price = Number(row[index("Price")]); const frequency = row[index("Billing frequency")] as Subscription["billingFrequency"];
    const date = row[index("Next payment date")];
    if (!name || !Number.isFinite(price) || !frequencies.includes(frequency) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push(`Row ${rowNumber}: check the name, price, billing frequency, and date.`); return;
    }
    const firstPaymentDate = row[index("First payment date")];
    items.push(createSubscription({ name, price, billingFrequency: frequency, nextPaymentDate: date, firstPaymentDate: /^\d{4}-\d{2}-\d{2}$/.test(firstPaymentDate) ? firstPaymentDate : undefined, currency: row[index("Currency")] || fallbackCurrency, category: row[index("Category")] || "Other", reminderDaysBefore: row[index("Reminder days")] ? Number(row[index("Reminder days")]) : null, note: row[index("Note")] || "", status: (row[index("Status")] as Subscription["status"]) || "active", websiteUrl: row[index("Website URL")] || "" }, fallbackCurrency));
  });
  return { items, errors };
}

export function downloadText(filename: string, content: string, type: string): void {
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type })); link.download = filename; link.click(); URL.revokeObjectURL(link.href);
}
