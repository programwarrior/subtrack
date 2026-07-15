import type { Subscription } from "./types";

export interface SyncPayload {
  subscriptions: Subscription[];
  tombstones: Record<string, string>;
}

export function destructiveDeletionCount(server: SyncPayload, incoming: SyncPayload): number {
  const incomingById = new Map(incoming.subscriptions.map((item) => [item.id, item]));
  return server.subscriptions.filter((item) => {
    const deletedAt = incoming.tombstones[item.id];
    if (!deletedAt || item.updatedAt > deletedAt) return false;
    const incomingItem = incomingById.get(item.id);
    return !incomingItem || incomingItem.updatedAt <= deletedAt;
  }).length;
}

export function wouldBlockMassDeletion(server: SyncPayload, incoming: SyncPayload): boolean {
  const deleted = destructiveDeletionCount(server, incoming);
  return server.subscriptions.length >= 3 && deleted >= 3 && deleted / server.subscriptions.length >= 0.5;
}

export function mergeSyncPayload(server: SyncPayload, incoming: SyncPayload): SyncPayload {
  const byId = new Map<string, Subscription>(server.subscriptions.map((item) => [item.id, item]));
  incoming.subscriptions.forEach((item) => { const current = byId.get(item.id); if (!current || item.updatedAt >= current.updatedAt) byId.set(item.id, item); });
  const tombstones = { ...server.tombstones };
  Object.entries(incoming.tombstones).forEach(([id, deletedAt]) => { if (!tombstones[id] || deletedAt > tombstones[id]) tombstones[id] = deletedAt; });
  Object.entries(tombstones).forEach(([id, deletedAt]) => {
    const item = byId.get(id); if (!item || item.updatedAt <= deletedAt) byId.delete(id); else delete tombstones[id];
  });
  return { subscriptions: [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), tombstones };
}
