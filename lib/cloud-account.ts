import { mergeSyncPayload } from "./sync-merge";
import { defaultSettings, type AppData, type DeletedSubscription } from "./types";

export interface CloudAccountRow {
  user_id: string;
  payload: unknown;
  version: number;
  updated_at: string;
}

export function normalizeAppData(value: unknown): AppData {
  const input = value && typeof value === "object" ? value as Partial<AppData> : {};
  return {
    subscriptions: Array.isArray(input.subscriptions) ? input.subscriptions.map((item) => ({ ...item, payments: Array.isArray(item.payments) ? item.payments : [], priceHistory: Array.isArray(item.priceHistory) ? item.priceHistory : [] })) : [],
    settings: { ...defaultSettings, ...(input.settings ?? {}) },
    tombstones: input.tombstones && typeof input.tombstones === "object" ? input.tombstones : {},
    deletedSubscriptions: Array.isArray(input.deletedSubscriptions) ? input.deletedSubscriptions : [],
  };
}

export function mergeAccountData(cloudValue: unknown, localValue: unknown): AppData {
  const cloud = normalizeAppData(cloudValue); const local = normalizeAppData(localValue);
  const merged = mergeSyncPayload(cloud, local);
  const activeIds = new Set(merged.subscriptions.map((item) => item.id));
  const deleted = new Map<string, DeletedSubscription>();
  [...cloud.deletedSubscriptions, ...local.deletedSubscriptions].forEach((entry) => {
    if (!entry?.subscription?.id || activeIds.has(entry.subscription.id) || !merged.tombstones[entry.subscription.id]) return;
    const current = deleted.get(entry.subscription.id);
    if (!current || entry.deletedAt > current.deletedAt) deleted.set(entry.subscription.id, entry);
  });
  return {
    subscriptions: merged.subscriptions,
    tombstones: merged.tombstones,
    deletedSubscriptions: [...deleted.values()].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)),
    settings: { ...cloud.settings, ...local.settings },
  };
}

export function accountDataSignature(value: unknown): string {
  const data = normalizeAppData(value);
  return JSON.stringify([data.subscriptions, data.tombstones, data.deletedSubscriptions, data.settings]);
}

export function hasAccountData(value: unknown): boolean {
  const data = normalizeAppData(value);
  return data.subscriptions.length > 0 || data.deletedSubscriptions.length > 0 || Object.keys(data.tombstones).length > 0;
}
