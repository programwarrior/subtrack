"use client";

import { Download, FileDown, FileUp, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import type { useCloudAccount } from "@/hooks/use-cloud-account";
import type { DeletedSubscription, Settings, Subscription } from "@/lib/types";
import { downloadText, importSubscriptionsCsv, subscriptionsToCsv } from "@/lib/import-export";
import { CloudSync } from "./cloud-sync";

export function SettingsPanel({ settings, subscriptions, deletedSubscriptions, account, onUpdate, onImport, onRestore, onNotify }: { settings: Settings; subscriptions: Subscription[]; deletedSubscriptions: DeletedSubscription[]; account: ReturnType<typeof useCloudAccount>; onUpdate: (patch: Partial<Settings>) => void; onImport: (items: Subscription[]) => void; onRestore: (id: string) => void; onNotify: (message: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null); const [importError, setImportError] = useState("");
  const enableNotifications = async (checked: boolean) => {
    if (!checked) { onUpdate({ notifications: false }); return; }
    if (!("Notification" in window)) { onNotify("Browser notifications are not supported here. In-app reminders remain active."); return; }
    const permission = await Notification.requestPermission(); onUpdate({ notifications: permission === "granted" });
    onNotify(permission === "granted" ? "Browser notifications enabled." : "Notification permission was not granted.");
  };
  const importFile = async (file?: File) => {
    if (!file) return; const result = importSubscriptionsCsv(await file.text(), settings.currency);
    if (result.errors.length) setImportError(result.errors.slice(0, 3).join(" ")); else setImportError("");
    if (result.items.length) { onImport([...result.items, ...subscriptions]); onNotify(`${result.items.length} subscription${result.items.length === 1 ? "" : "s"} imported.`); }
  };
  return <div className="settings-body">
    <section className="settings-section"><h3>Account &amp; cloud sync</h3><CloudSync account={account} localCount={subscriptions.length} onNotify={onNotify} /></section>
    <section className="settings-section"><h3>Preferences</h3><div className="settings-grid">
      <label className="field"><span>Preferred currency</span><select value={settings.currency} onChange={(e) => onUpdate({ currency: e.target.value })}>{["EUR", "USD", "GBP", "INR", "CAD", "AUD", "JPY"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="field"><span>Date format</span><select value={settings.dateFormat} onChange={(e) => onUpdate({ dateFormat: e.target.value as Settings["dateFormat"] })}><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option></select></label>
      <label className="field"><span>First day of week</span><select value={settings.firstDayOfWeek} onChange={(e) => onUpdate({ firstDayOfWeek: e.target.value as Settings["firstDayOfWeek"] })}><option value="monday">Monday</option><option value="sunday">Sunday</option></select></label>
      <label className="field"><span>Theme</span><select value={settings.theme} onChange={(e) => onUpdate({ theme: e.target.value as Settings["theme"] })}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <label className="field"><span>Default reminder</span><select value={settings.defaultReminderDays ?? "none"} onChange={(e) => onUpdate({ defaultReminderDays: e.target.value === "none" ? null : Number(e.target.value) })}><option value="none">No reminder</option><option value="0">On payment day</option><option value="1">1 day before</option><option value="3">3 days before</option><option value="7">7 days before</option></select></label>
      <label className="toggle-row"><span><strong>Browser notifications</strong><small>We only ask permission when you turn this on.</small></span><input type="checkbox" checked={settings.notifications} onChange={(e) => enableNotifications(e.target.checked)} /></label>
    </div></section>
    {deletedSubscriptions.length > 0 && <section className="settings-section"><h3>Recently deleted</h3><p className="section-copy">Deleted subscriptions remain recoverable for 30 days and sync to your account trash.</p><div className="trash-list">{deletedSubscriptions.map((entry) => <div key={entry.subscription.id}><span><strong>{entry.subscription.name}</strong><small>Deleted {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(entry.deletedAt))}</small></span><button className="button quiet compact" onClick={() => { onRestore(entry.subscription.id); onNotify(`${entry.subscription.name} restored.`); }}><RotateCcw size={14} /> Restore</button></div>)}</div></section>}
    <section className="settings-section"><h3>Your data</h3><p className="section-copy">Your signed-in account is the primary copy; this device keeps an offline cache. Export a separate backup any time.</p><div className="data-actions">
      <button className="button secondary" onClick={() => downloadText("subtrack-subscriptions.csv", subscriptionsToCsv(subscriptions), "text/csv")}><FileDown size={17} /> Export CSV</button>
      <button className="button secondary" onClick={() => downloadText("subtrack-backup.json", JSON.stringify(subscriptions, null, 2), "application/json")}><Download size={17} /> Export JSON</button>
      <button className="button secondary" onClick={() => fileRef.current?.click()}><FileUp size={17} /> Import CSV</button><input className="sr-only" ref={fileRef} type="file" accept=".csv,text/csv" onChange={(e) => importFile(e.target.files?.[0])} />
    </div>{importError && <p className="error import-error">{importError}</p>}<button className="template-link" onClick={() => downloadText("subtrack-template.csv", "Name,Price,Currency,Billing frequency,Next payment date,First payment date,Category,Reminder days,Note,Status,Website URL\n", "text/csv")}>Download CSV template</button></section>
  </div>;
}
