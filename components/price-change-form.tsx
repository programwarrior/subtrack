"use client";

import { useState } from "react";
import { todayDateOnly } from "@/lib/calculations";
import type { Subscription } from "@/lib/types";

export interface PriceChangeInput { previousPrice: number; newPrice: number; effectiveDate: string; note: string; }

export function PriceChangeForm({ subscription, onCancel, onSave }: { subscription: Subscription; onCancel: () => void; onSave: (change: PriceChangeInput) => void }) {
  const [value, setValue] = useState<PriceChangeInput>({ previousPrice: subscription.price, newPrice: subscription.price, effectiveDate: todayDateOnly(), note: "" });
  const valid = value.previousPrice >= 0 && value.newPrice >= 0 && value.previousPrice !== value.newPrice && Boolean(value.effectiveDate);
  return <form className="price-change-form" onSubmit={(event) => { event.preventDefault(); if (valid) onSave(value); }}>
    <div className="price-change-note"><strong>Preserve the full price history</strong><p>Choose when the cost changed. Estimated past payments on or after that date will use the new amount.</p></div>
    <div className="form-grid">
      <label className="field"><span>Previous price</span><div className="input-prefix"><span>{subscription.currency}</span><input type="number" min="0" step="0.01" value={value.previousPrice} onChange={(event) => setValue((current) => ({ ...current, previousPrice: Number(event.target.value) }))} /></div></label>
      <label className="field"><span>New price</span><div className="input-prefix"><span>{subscription.currency}</span><input type="number" min="0" step="0.01" value={value.newPrice} onChange={(event) => setValue((current) => ({ ...current, newPrice: Number(event.target.value) }))} /></div></label>
      <label className="field span-2"><span>Effective date</span><input type="date" max={todayDateOnly()} value={value.effectiveDate} onChange={(event) => setValue((current) => ({ ...current, effectiveDate: event.target.value }))} /></label>
      <label className="field span-2"><span>Note about this change</span><textarea rows={3} value={value.note} onChange={(event) => setValue((current) => ({ ...current, note: event.target.value }))} placeholder="e.g. Upgraded to the family plan" /></label>
    </div>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancel</button><button className="button primary" disabled={!valid}>Save price change</button></div>
  </form>;
}
