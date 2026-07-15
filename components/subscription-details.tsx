"use client";

import { Bell, CalendarDays, Check, CreditCard, ExternalLink, FileText, Pencil, Pause, Play, RotateCcw, TrendingUp, Trash2 } from "lucide-react";
import type { Settings, Subscription } from "@/lib/types";
import { daysUntil, formatDate, formatMoney, frequencyLabel, monthlyEquivalent, renewalPrice, yearlyEquivalent } from "@/lib/calculations";
import { recordedSpend } from "@/lib/payment-history";

export function SubscriptionDetails({ subscription, settings, onEdit, onEditPayment, onPriceChange, onUpdate, onPaid, onDelete }: { subscription: Subscription; settings: Settings; onEdit: () => void; onEditPayment: (paymentId: string) => void; onPriceChange: () => void; onUpdate: (patch: Partial<Subscription>) => void; onPaid: () => void; onDelete: () => void }) {
  const days = daysUntil(subscription.nextPaymentDate);
  const currentPrice = renewalPrice(subscription);
  const reminder = subscription.reminderDaysBefore === null ? "No reminder" : subscription.reminderDaysBefore === 0 ? "On payment day" : `${subscription.reminderDaysBefore} days before`;
  return <div className="detail-body">
    <div className="detail-hero">
      <div className="service-avatar large">{subscription.name.charAt(0).toUpperCase()}</div>
      <div><span className={`status-pill ${subscription.status}`}>{subscription.status}</span><p className="detail-price">{formatMoney(currentPrice, subscription.currency)} <span>/ {frequencyLabel(subscription.billingFrequency).toLowerCase()}</span></p></div>
    </div>
    <div className="detail-actions">
      <button className="button primary compact" onClick={onPaid} disabled={subscription.billingFrequency === "one-time" && subscription.payments.length > 0}><Check size={16} /> Mark as paid</button>
      <button className="button secondary compact" onClick={onEdit}><Pencil size={16} /> Edit</button>
      <button className="button secondary compact" onClick={onPriceChange}><TrendingUp size={16} /> Price change</button>
      <button className="button secondary compact" onClick={() => onUpdate({ status: subscription.status === "paused" ? "active" : "paused" })}>{subscription.status === "paused" ? <Play size={16} /> : <Pause size={16} />}{subscription.status === "paused" ? "Resume" : "Pause"}</button>
    </div>
    {days < 0 && <div className="due-banner"><strong>Payment due</strong><span>{Math.abs(days)} {Math.abs(days) === 1 ? "day" : "days"} overdue</span><button onClick={onPaid}>Mark paid</button></div>}
    <div className="detail-stats"><div><span>Monthly equivalent</span><strong>{formatMoney(monthlyEquivalent(subscription), settings.currency)}</strong></div><div><span>Yearly estimate</span><strong>{formatMoney(yearlyEquivalent(subscription), settings.currency)}</strong></div><div><span>Recorded spend</span><strong>{formatMoney(recordedSpend(subscription.payments), subscription.currency)}</strong></div></div>
    <section className="detail-section"><h3>Details</h3><div className="detail-list">
      <div><CalendarDays size={17} /><span>Next payment</span><strong>{formatDate(subscription.nextPaymentDate, settings.dateFormat)}</strong></div>
      <div><CalendarDays size={17} /><span>First payment</span><strong>{subscription.firstPaymentDate ? formatDate(subscription.firstPaymentDate, settings.dateFormat) : "Not added"}</strong></div>
      <div><FileText size={17} /><span>Category</span><strong>{subscription.category}</strong></div>
      <div><Bell size={17} /><span>Reminder</span><strong>{reminder}</strong></div>
      <div><CreditCard size={17} /><span>Payment method</span><strong>{subscription.paymentMethodLabel || "Not added"}</strong></div>
      <div><RotateCcw size={17} /><span>Renewal</span><strong>{subscription.autoRenewalStatus === "auto" ? "Auto-renews" : subscription.autoRenewalStatus === "manual" ? "Manual" : "Unknown"}</strong></div>
    </div></section>
    {subscription.note && <section className="detail-section"><h3>Note</h3><p className="note-box">{subscription.note}</p></section>}
    {subscription.websiteUrl && <a className="manage-link" href={subscription.websiteUrl} target="_blank" rel="noreferrer">Manage subscription <ExternalLink size={15} /></a>}
    <section className="detail-section"><h3>Payment history</h3>{subscription.payments.length ? <div className="history-list">{subscription.payments.map((payment) => <div key={payment.id}><span>{formatDate(payment.paymentDate, settings.dateFormat)}</span><strong>{formatMoney(payment.amount, subscription.currency)}</strong><em className={payment.status}>{payment.status}</em><button className="history-edit" aria-label={`Edit payment from ${payment.paymentDate}`} onClick={() => onEditPayment(payment.id)}><Pencil size={13} /></button></div>)}</div> : <p className="muted">No payments recorded yet. Add a first payment date to estimate past renewals.</p>}</section>
    {subscription.priceHistory.length > 0 && <section className="detail-section"><h3>Price changes</h3><div className="price-history-list">{[...subscription.priceHistory].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)).map((change) => <div key={change.id}><p>Changed from {formatMoney(change.previousPrice, subscription.currency)} to {formatMoney(change.newPrice, subscription.currency)}</p><span>{formatDate(change.effectiveDate, settings.dateFormat)}</span>{change.note && <small>{change.note}</small>}</div>)}</div></section>}
    <p className="date-added">Added {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(subscription.createdAt))}</p>
    <button className="danger-link" onClick={() => { if (confirm(`Delete ${subscription.name}? This cannot be undone after the undo period.`)) onDelete(); }}><Trash2 size={16} /> Delete subscription</button>
  </div>;
}
