"use client";

import { useMemo, useState } from "react";
import { ChevronDown, FileSpreadsheet, FileText, Image as ImageIcon, ScanLine } from "lucide-react";
import { categories, frequencies, type Subscription } from "@/lib/types";
import { subscriptionSchema } from "@/lib/validation";
import { frequencyLabel, todayDateOnly } from "@/lib/calculations";

type FormValue = Partial<Subscription> & Pick<Subscription, "name" | "price" | "billingFrequency" | "nextPaymentDate">;

export function SubscriptionForm({ initial, currency, defaultReminder, onCancel, onSave, onImport }: { initial?: Subscription; currency: string; defaultReminder: number | null; onCancel: () => void; onSave: (value: FormValue) => void; onImport?: () => void }) {
  const [advanced, setAdvanced] = useState(Boolean(initial && (initial.note || initial.paymentMethodLabel || initial.websiteUrl || initial.isFreeTrial)));
  const [customCategory, setCustomCategory] = useState(initial?.category && !categories.includes(initial.category) ? initial.category : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [value, setValue] = useState<FormValue>(() => initial ? { ...initial } : {
    name: "", price: 0, currency, billingFrequency: "monthly", nextPaymentDate: todayDateOnly(), category: "Entertainment",
    note: "", reminderDaysBefore: defaultReminder, paymentMethodLabel: "", websiteUrl: "", status: "active", autoRenewalStatus: "auto", isFreeTrial: false,
  });
  const dirty = useMemo(() => Boolean(value.name || value.price || advanced), [value, advanced]);
  const update = <K extends keyof FormValue>(key: K, next: FormValue[K]) => setValue((current) => ({ ...current, [key]: next }));
  const cancel = () => { if (!dirty || confirm("Discard your unsaved changes?")) onCancel(); };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = subscriptionSchema.safeParse(value);
    if (!result.success) { setErrors(Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), issue.message]))); return; }
    if (value.firstPaymentDate && value.firstPaymentDate > value.nextPaymentDate) { setErrors({ firstPaymentDate: "The first payment must be on or before the next payment." }); return; }
    onSave({ ...value, category: value.category === "Custom" ? customCategory.trim() || "Other" : value.category });
  };
  return (
    <form onSubmit={submit} className="subscription-form">
      {!initial && onImport && <><section className="add-import-option"><span className="import-icon compact"><ScanLine size={20} /></span><div><strong>Read subscription details from a file</strong><p>Extract providers, prices, dates, and past payments for review.</p><span><i><FileText size={13} /> PDF</i><i><FileSpreadsheet size={13} /> Excel / CSV</i><i><ImageIcon size={13} /> Images</i></span></div><button type="button" className="button secondary" onClick={() => { if (!dirty || confirm("Discard your manual entry and import from a file instead?")) onImport(); }}>Choose files</button></section><div className="form-divider"><span>or enter manually</span></div></>}
      <div className="form-grid">
        <label className="field span-2"><span>Name <b>*</b></span><input value={value.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Spotify" aria-invalid={Boolean(errors.name)} />{errors.name && <small className="error">{errors.name}</small>}</label>
        <label className="field"><span>Price <b>*</b></span><div className="input-prefix"><span>{currency}</span><input type="number" min="0" step="0.01" value={value.price || ""} onChange={(e) => update("price", Number(e.target.value))} placeholder="0.00" /></div>{errors.price && <small className="error">{errors.price}</small>}</label>
        <label className="field"><span>Billing frequency <b>*</b></span><select value={value.billingFrequency} onChange={(e) => update("billingFrequency", e.target.value as Subscription["billingFrequency"])}>{frequencies.map((item) => <option key={item} value={item}>{frequencyLabel(item)}</option>)}</select></label>
        {value.billingFrequency === "custom" && <><label className="field"><span>Repeat every</span><input type="number" min="1" value={value.customIntervalNumber ?? 1} onChange={(e) => update("customIntervalNumber", Number(e.target.value))} /></label><label className="field"><span>Interval</span><select value={value.customIntervalUnit ?? "months"} onChange={(e) => update("customIntervalUnit", e.target.value as Subscription["customIntervalUnit"])}><option>days</option><option>weeks</option><option>months</option><option>years</option></select></label></>}
        <label className="field"><span>Next payment <b>*</b></span><input type="date" value={value.nextPaymentDate} onChange={(e) => update("nextPaymentDate", e.target.value)} />{errors.nextPaymentDate && <small className="error">{errors.nextPaymentDate}</small>}</label>
        <label className="field"><span>First payment date <em>Optional</em></span><input type="date" max={value.nextPaymentDate} value={value.firstPaymentDate ?? ""} onChange={(e) => update("firstPaymentDate", e.target.value || undefined)} />{errors.firstPaymentDate ? <small className="error">{errors.firstPaymentDate}</small> : <small className="field-hint">Creates estimated past renewals.</small>}</label>
        <label className="field"><span>Category</span><select value={categories.includes(value.category ?? "") ? value.category : "Custom"} onChange={(e) => update("category", e.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}<option>Custom</option></select></label>
        {value.category === "Custom" && <label className="field span-2"><span>Custom category</span><input value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} placeholder="e.g. Family" /></label>}
        <label className="field"><span>Reminder</span><select value={value.reminderDaysBefore ?? "none"} onChange={(e) => update("reminderDaysBefore", e.target.value === "none" ? null : Number(e.target.value))}><option value="none">No reminder</option><option value="0">On payment day</option><option value="1">1 day before</option><option value="3">3 days before</option><option value="7">7 days before</option><option value="14">14 days before</option></select></label>
        <label className="field"><span>Status</span><select value={value.status} onChange={(e) => update("status", e.target.value as Subscription["status"])}><option value="active">Active</option><option value="paused">Paused</option><option value="cancelled">Cancelled</option></select></label>
      </div>
      <button type="button" className="advanced-toggle" onClick={() => setAdvanced((current) => !current)}><span>More options</span><ChevronDown size={16} className={advanced ? "rotate" : ""} /></button>
      {advanced && <div className="form-grid advanced-fields">
        <label className="field span-2"><span>Note</span><textarea rows={3} value={value.note} onChange={(e) => update("note", e.target.value)} placeholder="e.g. Cancel before the free trial ends" /></label>
        <label className="field"><span>Payment method label</span><input value={value.paymentMethodLabel} onChange={(e) => update("paymentMethodLabel", e.target.value)} placeholder="Business card ending 4821" /></label>
        <label className="field"><span>Auto-renewal</span><select value={value.autoRenewalStatus} onChange={(e) => update("autoRenewalStatus", e.target.value as Subscription["autoRenewalStatus"])}><option value="auto">Auto-renews</option><option value="manual">Manual renewal</option><option value="unknown">Unknown</option></select></label>
        <label className="field span-2"><span>Management link</span><input type="url" value={value.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} placeholder="https://example.com/account" />{errors.websiteUrl && <small className="error">{errors.websiteUrl}</small>}</label>
        <label className="toggle-row span-2"><span><strong>This is a free trial</strong><small>Keep its cost out of recurring totals until the trial ends.</small></span><input type="checkbox" checked={value.isFreeTrial} onChange={(e) => update("isFreeTrial", e.target.checked)} /></label>
        {value.isFreeTrial && <><label className="field"><span>Trial end date</span><input type="date" value={value.trialEndDate ?? ""} onChange={(e) => update("trialEndDate", e.target.value)} /></label><label className="field"><span>First payment</span><input type="number" min="0" step="0.01" value={value.trialFirstPaymentAmount ?? ""} onChange={(e) => update("trialFirstPaymentAmount", Number(e.target.value))} /></label></>}
      </div>}
      <div className="modal-actions"><button type="button" className="button secondary" onClick={cancel}>Cancel</button><button className="button primary" disabled={!value.name.trim() || value.price < 0 || !value.nextPaymentDate}>{initial ? "Save changes" : "Save subscription"}</button></div>
    </form>
  );
}
