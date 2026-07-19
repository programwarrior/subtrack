"use client";

import { useState } from "react";
import { todayDateOnly } from "@/lib/calculations";
import type { Payment, Subscription } from "@/lib/types";

export type PaymentEditInput = Pick<Payment, "paymentDate" | "amount" | "status"> & { note?: string };

export function PaymentForm({ payment, subscription, onCancel, onSave }: { payment?: Payment; subscription: Subscription; onCancel: () => void; onSave: (value: PaymentEditInput) => void }) {
  const adding = !payment;
  const [value, setValue] = useState<PaymentEditInput>({ paymentDate: payment?.paymentDate ?? todayDateOnly(), amount: payment?.amount ?? subscription.price, status: payment?.status === "missed" ? "missed" : "paid", note: payment?.note ?? "" });
  const valid = Boolean(value.paymentDate) && value.paymentDate <= todayDateOnly() && value.amount >= 0;
  return <form className="price-change-form" onSubmit={(event) => { event.preventDefault(); if (valid) onSave(value); }}>
    <div className="price-change-note"><strong>{adding ? "Add a missing charge" : "Correct this past charge"}</strong><p>Enter the real payment details. If this is the newest paid charge, its amount becomes the renewal cost; older charges update history without moving the current schedule.</p></div>
    <div className="form-grid">
      <label className="field"><span>Payment date</span><input type="date" max={todayDateOnly()} value={value.paymentDate} onChange={(event) => setValue((current) => ({ ...current, paymentDate: event.target.value }))} /></label>
      <label className="field"><span>Amount charged</span><div className="input-prefix"><span>{subscription.currency}</span><input type="number" min="0" step="0.01" value={value.amount} onChange={(event) => setValue((current) => ({ ...current, amount: Number(event.target.value) }))} /></div></label>
      <label className="field span-2"><span>Payment status</span><select value={value.status} onChange={(event) => setValue((current) => ({ ...current, status: event.target.value as "paid" | "missed" }))}><option value="paid">Paid</option><option value="missed">Missed</option></select></label>
      <label className="field span-2"><span>Note</span><textarea rows={3} value={value.note} onChange={(event) => setValue((current) => ({ ...current, note: event.target.value }))} placeholder="Optional note about this charge" /></label>
    </div>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancel</button><button className="button primary" disabled={!valid}>{adding ? "Add charge" : "Save payment"}</button></div>
  </form>;
}
