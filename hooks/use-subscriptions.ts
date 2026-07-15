"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { basePath } from "@/lib/base-path";
import { calculateNextPaymentDate, todayDateOnly } from "@/lib/calculations";
import { buildEstimatedPaymentHistory, normalizePriceHistory } from "@/lib/payment-history";
import { defaultSettings, type AppData, type Settings, type Subscription } from "@/lib/types";

const STORAGE_KEY = "subtrack:data:v1";

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function createSubscription(input: Partial<Subscription> & Pick<Subscription, "name" | "price" | "billingFrequency" | "nextPaymentDate">, currency = "EUR"): Subscription {
  const now = new Date().toISOString();
  return {
    id: input.id ?? uid(), name: input.name.trim(), price: Number(input.price), currency: input.currency ?? currency,
    billingFrequency: input.billingFrequency, customIntervalNumber: input.customIntervalNumber, customIntervalUnit: input.customIntervalUnit,
    nextPaymentDate: input.nextPaymentDate, firstPaymentDate: input.firstPaymentDate, category: input.category ?? "Other", note: input.note ?? "",
    reminderDaysBefore: input.reminderDaysBefore ?? null, paymentMethodLabel: input.paymentMethodLabel ?? "", websiteUrl: input.websiteUrl ?? "",
    status: input.status ?? "active", autoRenewalStatus: input.autoRenewalStatus ?? "auto", isFreeTrial: input.isFreeTrial ?? false,
    trialEndDate: input.trialEndDate, trialFirstPaymentAmount: input.trialFirstPaymentAmount,
    createdAt: input.createdAt ?? now, updatedAt: now, payments: input.payments ?? [], priceHistory: input.priceHistory ?? [],
  };
}

export function useSubscriptions() {
  const [data, setData] = useState<AppData>({ subscriptions: [], settings: defaultSettings, tombstones: {}, deletedSubscriptions: [] });
  const [ready, setReady] = useState(false);
  const [lastDeleted, setLastDeleted] = useState<Subscription | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppData>;
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        setData({ subscriptions: parsed.subscriptions ?? [], settings: { ...defaultSettings, ...parsed.settings }, tombstones: parsed.tombstones ?? {}, deletedSubscriptions: (parsed.deletedSubscriptions ?? []).filter((item) => Date.parse(item.deletedAt) >= cutoff) });
      }
    } catch { /* Invalid local data falls back to a clean store. */ }
    // Pairing through the Mac has been retired in favor of account sync.
    localStorage.removeItem("subtrack:device-sync-code");
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, ready]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = data.settings.theme;
    if (data.settings.theme === "dark" || (data.settings.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)) root.classList.add("dark");
    else root.classList.remove("dark");
  }, [data.settings.theme]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const hadController = Boolean(navigator.serviceWorker.controller); let reloading = false;
    const activateUpdate = () => { if (hadController && !reloading) { reloading = true; window.location.reload(); } };
    navigator.serviceWorker.addEventListener("controllerchange", activateUpdate);
    navigator.serviceWorker.register(`${basePath}/sw.js?v=4`, { scope: `${basePath}/`, updateViaCache: "none" }).then((registration) => registration.update()).catch(() => undefined);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", activateUpdate);
  }, []);

  const addSubscription = useCallback((input: Parameters<typeof createSubscription>[0]) => {
    const created = createSubscription(input, data.settings.currency); const item = { ...created, payments: buildEstimatedPaymentHistory(created) };
    setData((current) => { const tombstones = { ...current.tombstones }; delete tombstones[item.id]; return { ...current, tombstones, subscriptions: [item, ...current.subscriptions] }; });
    return item;
  }, [data.settings.currency]);

  const updateSubscription = useCallback((id: string, patch: Partial<Subscription>) => {
    setData((current) => { const tombstones = { ...current.tombstones }; delete tombstones[id]; return ({ ...current, tombstones, subscriptions: current.subscriptions.map((item) => {
      if (item.id !== id) return item;
      const priceChanged = patch.price !== undefined && patch.price !== item.price;
      const updated = {
        ...item, ...patch, updatedAt: new Date().toISOString(),
        priceHistory: priceChanged ? normalizePriceHistory([...item.priceHistory, { id: uid(), previousPrice: item.price, newPrice: patch.price!, effectiveDate: todayDateOnly(), note: "Price updated while editing the subscription" }]) : item.priceHistory,
      };
      return { ...updated, payments: buildEstimatedPaymentHistory(updated) };
    }) }); });
  }, []);

  const deleteSubscription = useCallback((id: string) => {
    setData((current) => {
      const item = current.subscriptions.find((sub) => sub.id === id) ?? null; const deletedAt = new Date().toISOString();
      setLastDeleted(item);
      return { ...current, tombstones: { ...current.tombstones, [id]: deletedAt }, deletedSubscriptions: item ? [{ subscription: item, deletedAt }, ...current.deletedSubscriptions.filter((entry) => entry.subscription.id !== id)] : current.deletedSubscriptions, subscriptions: current.subscriptions.filter((sub) => sub.id !== id) };
    });
  }, []);

  const undoDelete = useCallback(() => {
    if (!lastDeleted) return;
    setData((current) => { const tombstones = { ...current.tombstones }; delete tombstones[lastDeleted.id]; return { ...current, tombstones, deletedSubscriptions: current.deletedSubscriptions.filter((entry) => entry.subscription.id !== lastDeleted.id), subscriptions: [{ ...lastDeleted, updatedAt: new Date().toISOString() }, ...current.subscriptions] }; });
    setLastDeleted(null);
  }, [lastDeleted]);

  const restoreDeletedSubscription = useCallback((id: string) => {
    setData((current) => {
      const entry = current.deletedSubscriptions.find((item) => item.subscription.id === id); if (!entry) return current;
      const tombstones = { ...current.tombstones }; delete tombstones[id];
      return { ...current, tombstones, deletedSubscriptions: current.deletedSubscriptions.filter((item) => item.subscription.id !== id), subscriptions: [{ ...entry.subscription, updatedAt: new Date().toISOString() }, ...current.subscriptions.filter((item) => item.id !== id)] };
    });
  }, []);

  const markPaid = useCallback((id: string) => {
    let nextDate = "";
    setData((current) => { const tombstones = { ...current.tombstones }; delete tombstones[id]; return ({ ...current, tombstones, subscriptions: current.subscriptions.map((item) => {
      if (item.id !== id) return item;
      nextDate = calculateNextPaymentDate(item.nextPaymentDate, item.billingFrequency, item.customIntervalNumber, item.customIntervalUnit);
      const updated = { ...item, nextPaymentDate: nextDate, updatedAt: new Date().toISOString(), payments: [{ id: uid(), paymentDate: todayDateOnly(), scheduledDate: item.nextPaymentDate, amount: item.price, status: "paid" as const }, ...item.payments] };
      return { ...updated, payments: buildEstimatedPaymentHistory(updated) };
    }) }); });
    return nextDate;
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => setData((current) => ({ ...current, settings: { ...current.settings, ...patch } })), []);

  const addPriceChange = useCallback((id: string, change: { previousPrice: number; newPrice: number; effectiveDate: string; note: string }) => {
    setData((current) => ({ ...current, subscriptions: current.subscriptions.map((item) => {
      if (item.id !== id) return item;
      const priceHistory = normalizePriceHistory([...item.priceHistory, { id: uid(), ...change }]);
      const updated = { ...item, price: priceHistory.at(-1)?.newPrice ?? change.newPrice, priceHistory, updatedAt: new Date().toISOString() };
      return { ...updated, payments: buildEstimatedPaymentHistory(updated) };
    }) }));
  }, []);

  const replaceSubscriptions = useCallback((subscriptions: Subscription[]) => setData((current) => {
    const incomingIds = new Set(subscriptions.map((item) => item.id)); const tombstones = { ...current.tombstones }; const now = new Date().toISOString();
    current.subscriptions.forEach((item) => { if (!incomingIds.has(item.id)) tombstones[item.id] = now; });
    subscriptions.forEach((item) => delete tombstones[item.id]); return { ...current, tombstones, subscriptions };
  }), []);

  const loadDemo = useCallback(() => {
    const today = new Date();
    const dateFromNow = (days: number) => { const date = new Date(today); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };
    const samples = [
      ["Netflix", 19.99, "monthly", 3, "Entertainment"], ["Spotify", 11.99, "monthly", 9, "Entertainment"],
      ["Adobe Creative Cloud", 59.99, "monthly", 14, "Software"], ["Hosting", 120, "yearly", 25, "Website and hosting"],
      ["Gym", 39.99, "monthly", -2, "Fitness"], ["AI writing tool", 20, "monthly", 6, "AI tools"],
    ] as const;
    setData((current) => {
      const existing = new Set(current.subscriptions.map((item) => item.name.toLowerCase()));
      const additions = samples.filter(([name]) => !existing.has(name.toLowerCase())).map(([name, price, billingFrequency, days, category]) => createSubscription({ name, price, billingFrequency, nextPaymentDate: dateFromNow(days), category, reminderDaysBefore: 3 }, current.settings.currency));
      return { ...current, subscriptions: [...additions, ...current.subscriptions] };
    });
  }, []);

  const replaceAllData = useCallback((next: AppData) => setData({ ...next, settings: { ...defaultSettings, ...next.settings }, deletedSubscriptions: next.deletedSubscriptions ?? [] }), []);

  return useMemo(() => ({ ...data, ready, lastDeleted, addSubscription, updateSubscription, addPriceChange, deleteSubscription, undoDelete, restoreDeletedSubscription, markPaid, updateSettings, replaceSubscriptions, replaceAllData, loadDemo }), [data, ready, lastDeleted, addSubscription, updateSubscription, addPriceChange, deleteSubscription, undoDelete, restoreDeletedSubscription, markPaid, updateSettings, replaceSubscriptions, replaceAllData, loadDemo]);
}
