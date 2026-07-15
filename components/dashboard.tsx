"use client";

import { Bell, CalendarClock, ChevronDown, CircleDollarSign, Filter, MoreHorizontal, Plus, ScanLine, Search, Settings as SettingsIcon, SlidersHorizontal, Sparkles, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { useSubscriptions } from "@/hooks/use-subscriptions";
import { useCloudAccount } from "@/hooks/use-cloud-account";
import type { Subscription } from "@/lib/types";
import { daysUntil, formatDate, formatMoney, frequencyLabel, monthlyEquivalent, renewalPrice, yearlyEquivalent } from "@/lib/calculations";
import { EmptyIcon, LogoMark, Modal, Toast } from "./ui";
import { SubscriptionForm } from "./subscription-form";
import { SubscriptionDetails } from "./subscription-details";
import { SettingsPanel } from "./settings-panel";
import { SmartImport } from "./smart-import";
import { PriceChangeForm } from "./price-change-form";
import { PaymentForm } from "./payment-form";

type ModalState = "add" | "add-import" | "edit" | "details" | "payment-edit" | "price-change" | "settings" | "smart-import" | null;

function urgencyLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `In ${days} days`;
}

function Header({ reminders, onAdd, onImport, onSettings }: { reminders: number; onAdd: () => void; onImport: () => void; onSettings: () => void }) {
  return <header className="app-header"><a href="#main" className="brand"><LogoMark /><span>SubTrack</span></a><div className="header-actions">
    <button className="icon-button notification-button" aria-label={`${reminders} reminders`}><Bell size={19} />{reminders > 0 && <span>{reminders}</span>}</button>
    <button className="icon-button" aria-label="Settings" onClick={onSettings}><SettingsIcon size={20} /></button>
    <button className="button secondary import-desktop" onClick={onImport}><ScanLine size={17} /> Smart import</button>
    <button className="icon-button import-mobile" aria-label="Smart import" onClick={onImport}><ScanLine size={20} /></button>
    <button className="button primary add-desktop" onClick={onAdd}><Plus size={18} /> Add subscription</button>
  </div></header>;
}

export function Dashboard() {
  const store = useSubscriptions();
  const [modal, setModal] = useState<ModalState>(null); const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [query, setQuery] = useState(""); const [status, setStatus] = useState("all"); const [frequency, setFrequency] = useState("all"); const [sort, setSort] = useState("next");
  const [filtersOpen, setFiltersOpen] = useState(false); const [toast, setToast] = useState<string | null>(null);
  const account = useCloudAccount({ data: { subscriptions: store.subscriptions, settings: store.settings, tombstones: store.tombstones, deletedSubscriptions: store.deletedSubscriptions }, enabled: store.ready, onApply: store.replaceAllData, onNotify: setToast });
  const selected = store.subscriptions.find((item) => item.id === selectedId);
  const selectedPayment = selected?.payments.find((payment) => payment.id === selectedPaymentId);
  const active = store.subscriptions.filter((item) => item.status === "active" && !item.isFreeTrial);
  const monthly = active.reduce((sum, item) => sum + monthlyEquivalent(item), 0); const yearly = active.reduce((sum, item) => sum + yearlyEquivalent(item), 0);
  const upcoming = [...store.subscriptions].filter((item) => item.status === "active").sort((a, b) => daysUntil(a.nextPaymentDate) - daysUntil(b.nextPaymentDate)).slice(0, 4);
  const reminderCount = store.subscriptions.filter((item) => item.status === "active" && item.reminderDaysBefore !== null && daysUntil(item.nextPaymentDate) <= item.reminderDaysBefore!).length;
  const filtered = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    const items = store.subscriptions.filter((item) => (!normalized || `${item.name} ${item.category} ${item.note}`.toLowerCase().includes(normalized)) && (status === "all" || item.status === status) && (frequency === "all" || item.billingFrequency === frequency));
    return items.sort((a, b) => sort === "highest" ? monthlyEquivalent(b) - monthlyEquivalent(a) : sort === "lowest" ? monthlyEquivalent(a) - monthlyEquivalent(b) : sort === "recent" ? b.createdAt.localeCompare(a.createdAt) : sort === "alpha" ? a.name.localeCompare(b.name) : a.nextPaymentDate.localeCompare(b.nextPaymentDate));
  }, [store.subscriptions, query, status, frequency, sort]);
  const openDetails = (id: string) => { setSelectedId(id); setModal("details"); };
  const paid = () => { if (!selected) return; const next = store.markPaid(selected.id); setToast(`${selected.name} marked as paid.${selected.billingFrequency !== "one-time" ? ` Next payment: ${formatDate(next, store.settings.dateFormat)}.` : ""}`); };
  if (!store.ready) return <main className="shell loading-shell"><div className="skeleton header-skeleton" /><div className="skeleton summary-skeleton" /><div className="skeleton list-skeleton" /></main>;
  return <>
    <div className="shell"><Header reminders={reminderCount} onAdd={() => setModal("add")} onImport={() => setModal("smart-import")} onSettings={() => setModal("settings")} />
      <main id="main">
        {store.subscriptions.length === 0 ? <section className="empty-state"><EmptyIcon /><p className="eyebrow">Everything in one calm place</p><h1>Your subscriptions will appear here.</h1><p>Add your first subscription or scan existing files to see upcoming payments and monthly spending.</p><div><button className="button primary" onClick={() => setModal("add")}><Plus size={18} /> Add subscription</button><button className="button secondary" onClick={() => setModal("smart-import")}><ScanLine size={17} /> Smart import</button><button className="button quiet" onClick={() => { store.loadDemo(); setToast("Demo data loaded."); }}><Sparkles size={17} /> Load demo data</button></div></section> : <>
          <section className="welcome-row"><div><p className="eyebrow">Your overview</p><h1>Keep every renewal in sight.</h1></div><p>{active.length} active subscription{active.length === 1 ? "" : "s"}</p></section>
          <section className="summary-card" aria-label="Spending summary">
            <div className="summary-primary"><span className="metric-icon"><WalletCards size={19} /></span><div><p>Monthly</p><strong>{formatMoney(monthly, store.settings.currency)}</strong><small>Estimated recurring spend</small></div></div>
            <div className="summary-metric"><p>Yearly estimate</p><strong>{formatMoney(yearly, store.settings.currency)}</strong><small>Based on current plans</small></div>
            <div className="summary-metric"><p>Active plans</p><strong>{active.length}</strong><small>{store.subscriptions.filter((item) => item.status === "paused").length} paused</small></div>
            <div className="summary-metric next-metric"><p>Next payment</p>{upcoming[0] ? <><strong>{upcoming[0].name}</strong><small>{formatMoney(renewalPrice(upcoming[0]), upcoming[0].currency)} · {formatDate(upcoming[0].nextPaymentDate, store.settings.dateFormat, true)}</small></> : <><strong>Nothing due</strong><small>You’re all clear</small></>}</div>
          </section>
          {upcoming.length > 0 && <section className="dashboard-section"><div className="section-heading"><div><h2>Coming up</h2><p>Payments that need your attention.</p></div><CalendarClock size={20} /></div><div className="upcoming-grid">{upcoming.map((item) => {
            const days = daysUntil(item.nextPaymentDate); return <button className={`upcoming-card ${days < 0 ? "overdue" : days <= 7 ? "soon" : ""}`} key={item.id} onClick={() => openDetails(item.id)}><div className="card-top"><div className="service-avatar">{item.name.charAt(0).toUpperCase()}</div><span className="amount">{formatMoney(renewalPrice(item), item.currency)}</span></div><strong>{item.name}</strong><p>{formatDate(item.nextPaymentDate, store.settings.dateFormat, true)} · {frequencyLabel(item.billingFrequency)}</p><span className="urgency"><i />{urgencyLabel(days)}</span>{item.isFreeTrial && <em className="trial-pill">Free trial</em>}</button>;
          })}</div></section>}
          <section className="dashboard-section subscriptions-section"><div className="section-heading"><div><h2>All subscriptions</h2><p>{filtered.length} of {store.subscriptions.length} shown</p></div></div>
            <div className="toolbar"><label className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search subscriptions" aria-label="Search subscriptions" /></label><div className="toolbar-actions">
              <button className={`control-button ${filtersOpen ? "active" : ""}`} onClick={() => setFiltersOpen((value) => !value)}><Filter size={16} /> Filter{(status !== "all" || frequency !== "all") && <span className="filter-count">!</span>}</button>
              <label className="select-control"><SlidersHorizontal size={16} /><select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort subscriptions"><option value="next">Next payment</option><option value="highest">Highest cost</option><option value="lowest">Lowest cost</option><option value="recent">Recently added</option><option value="alpha">Alphabetical</option></select><ChevronDown size={14} /></label>
            </div></div>
            {filtersOpen && <div className="filters-row"><label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="paused">Paused</option><option value="cancelled">Cancelled</option></select></label><label>Billing cycle<select value={frequency} onChange={(e) => setFrequency(e.target.value)}><option value="all">All billing cycles</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="weekly">Weekly</option><option value="quarterly">Quarterly</option></select></label><button onClick={() => { setStatus("all"); setFrequency("all"); }}>Clear filters</button></div>}
            <div className="subscription-list">{filtered.map((item) => { const days = daysUntil(item.nextPaymentDate); return <article className="subscription-row" key={item.id} onClick={() => openDetails(item.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") openDetails(item.id); }}>
              <div className="service-avatar">{item.name.charAt(0).toUpperCase()}</div><div className="subscription-name"><strong>{item.name}</strong><span>{item.category}{item.note ? ` · ${item.note}` : ""}</span></div><div className="row-cell"><span>Cost</span><strong>{formatMoney(renewalPrice(item), item.currency)} <small>/ {frequencyLabel(item.billingFrequency).toLowerCase()}</small></strong></div><div className="row-cell"><span>Next payment</span><strong>{formatDate(item.nextPaymentDate, store.settings.dateFormat, true)} <small className={days < 0 ? "overdue-text" : ""}>· {urgencyLabel(days)}</small></strong></div><span className={`status-pill ${item.status}`}>{item.status}</span><button className="icon-button more-button" aria-label={`Options for ${item.name}`} onClick={(e) => { e.stopPropagation(); openDetails(item.id); }}><MoreHorizontal size={19} /></button>
            </article>; })}{filtered.length === 0 && <div className="no-results">No subscriptions match these filters.</div>}</div>
          </section>
          <section className="insight-strip"><CircleDollarSign size={20} /><div><strong>A quick spending note</strong><p>{active.length ? `${active.sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a))[0]?.name} is your highest monthly cost. ` : ""}{store.subscriptions.filter((item) => item.status === "paused").length ? `Paused plans could save about ${formatMoney(store.subscriptions.filter((item) => item.status === "paused").reduce((sum, item) => sum + monthlyEquivalent(item), 0), store.settings.currency)} a month.` : "Pause a plan any time without losing its details."}</p></div></section>
        </>}
      </main>
    </div>
    <button className="fab" onClick={() => setModal("add")} aria-label="Add subscription"><Plus size={22} /></button>
    <Modal open={modal === "add"} onClose={() => setModal(null)} title="Add subscription" eyebrow="Enter details or import a file"><SubscriptionForm currency={store.settings.currency} defaultReminder={store.settings.defaultReminderDays} onCancel={() => setModal(null)} onImport={() => setModal("add-import")} onSave={(value) => { store.addSubscription(value); setModal(null); setToast("Subscription added."); }} /></Modal>
    <Modal open={modal === "add-import"} onClose={() => setModal("add")} title="Add subscription" eyebrow="Read PDF, Excel, CSV or images" wide><SmartImport currency={store.settings.currency} existingSubscriptions={store.subscriptions} onClose={() => setModal("add")} onImport={(items) => { store.importSubscriptions(items); setModal(null); setToast(`${items.length} subscription record${items.length === 1 ? "" : "s"} imported or updated.`); }} /></Modal>
    <Modal open={modal === "edit" && Boolean(selected)} onClose={() => setModal("details")} title={`Edit ${selected?.name ?? "subscription"}`} eyebrow="Subscription details">{selected && <SubscriptionForm initial={selected} currency={store.settings.currency} defaultReminder={store.settings.defaultReminderDays} onCancel={() => setModal("details")} onSave={(value) => { store.updateSubscription(selected.id, value); setModal("details"); setToast("Subscription updated."); }} />}</Modal>
    <Modal open={modal === "details" && Boolean(selected)} onClose={() => setModal(null)} title={selected?.name ?? "Subscription"} eyebrow="Subscription details">{selected && <SubscriptionDetails subscription={selected} settings={store.settings} onEdit={() => setModal("edit")} onEditPayment={(paymentId) => { setSelectedPaymentId(paymentId); setModal("payment-edit"); }} onPriceChange={() => setModal("price-change")} onUpdate={(patch) => { store.updateSubscription(selected.id, patch); setToast("Subscription updated."); }} onPaid={paid} onDelete={() => { store.deleteSubscription(selected.id); setModal(null); setToast("Subscription deleted."); }} />}</Modal>
    <Modal open={modal === "payment-edit" && Boolean(selected && selectedPayment)} onClose={() => setModal("details")} title="Edit past payment" eyebrow={selected?.name}>{selected && selectedPayment && <PaymentForm payment={selectedPayment} subscription={selected} onCancel={() => setModal("details")} onSave={(value) => { store.updatePayment(selected.id, selectedPayment.id, value); setModal("details"); setToast("Payment updated and totals recalculated."); }} />}</Modal>
    <Modal open={modal === "price-change" && Boolean(selected)} onClose={() => setModal("details")} title="Record a price change" eyebrow={selected?.name}>{selected && <PriceChangeForm subscription={selected} onCancel={() => setModal("details")} onSave={(change) => { store.addPriceChange(selected.id, change); setModal("details"); setToast("Price change added and history updated."); }} />}</Modal>
    <Modal open={modal === "settings"} onClose={() => setModal(null)} title="Settings" eyebrow="Make SubTrack yours" wide><SettingsPanel settings={store.settings} subscriptions={store.subscriptions} deletedSubscriptions={store.deletedSubscriptions} account={account} onUpdate={store.updateSettings} onImport={store.replaceSubscriptions} onRestore={store.restoreDeletedSubscription} onNotify={setToast} /></Modal>
    <Modal open={modal === "smart-import"} onClose={() => setModal(null)} title="Smart import" eyebrow="Add subscriptions from your files" wide><SmartImport currency={store.settings.currency} existingSubscriptions={store.subscriptions} onClose={() => setModal(null)} onImport={(items) => { store.importSubscriptions(items); setModal(null); setToast(`${items.length} subscription record${items.length === 1 ? "" : "s"} imported or updated.`); }} /></Modal>
    {toast && <Toast message={toast} action={store.lastDeleted ? "Undo" : undefined} onAction={() => { store.undoDelete(); setToast("Subscription restored."); }} onDone={() => { setToast(null); }} />}
  </>;
}
