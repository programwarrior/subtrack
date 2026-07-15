import { describe, expect, it } from "vitest";
import { createSubscription } from "@/hooks/use-subscriptions";
import { mergeSyncPayload, wouldBlockMassDeletion } from "@/lib/sync-merge";

describe("cloud sync merge", () => {
  it("keeps the newest version of a subscription", () => {
    const older = createSubscription({ id: "shared", name: "Netflix", price: 10, billingFrequency: "monthly", nextPaymentDate: "2026-08-01" });
    older.updatedAt = "2026-07-15T08:00:00.000Z";
    const newer = { ...older, price: 12, updatedAt: "2026-07-15T09:00:00.000Z" };
    expect(mergeSyncPayload({ subscriptions: [older], tombstones: {} }, { subscriptions: [newer], tombstones: {} }).subscriptions[0].price).toBe(12);
  });
  it("propagates a deletion", () => {
    const item = createSubscription({ id: "deleted", name: "Old plan", price: 5, billingFrequency: "monthly", nextPaymentDate: "2026-08-01" }); item.updatedAt = "2026-07-15T08:00:00.000Z";
    const result = mergeSyncPayload({ subscriptions: [], tombstones: { deleted: "2026-07-15T09:00:00.000Z" } }, { subscriptions: [item], tombstones: {} });
    expect(result.subscriptions).toEqual([]); expect(result.tombstones.deleted).toBeTruthy();
  });
  it("allows an intentional restore to supersede a deletion", () => {
    const restored = createSubscription({ id: "restored", name: "Restored plan", price: 5, billingFrequency: "monthly", nextPaymentDate: "2026-08-01" }); restored.updatedAt = "2026-07-15T10:00:00.000Z";
    const result = mergeSyncPayload({ subscriptions: [], tombstones: { restored: "2026-07-15T09:00:00.000Z" } }, { subscriptions: [restored], tombstones: {} });
    expect(result.subscriptions).toHaveLength(1); expect(result.tombstones.restored).toBeUndefined();
  });
  it("blocks a device from deleting most of the protected collection at once", () => {
    const items = ["one", "two", "three", "four"].map((id) => { const item = createSubscription({ id, name: id, price: 5, billingFrequency: "monthly", nextPaymentDate: "2026-08-01" }); item.updatedAt = "2026-07-15T08:00:00.000Z"; return item; });
    const tombstones = Object.fromEntries(items.slice(0, 3).map((item) => [item.id, "2026-07-15T09:00:00.000Z"]));
    expect(wouldBlockMassDeletion({ subscriptions: items, tombstones: {} }, { subscriptions: [], tombstones })).toBe(true);
  });
  it("allows an ordinary single deletion to sync", () => {
    const items = ["one", "two", "three", "four"].map((id) => createSubscription({ id, name: id, price: 5, billingFrequency: "monthly", nextPaymentDate: "2026-08-01" }));
    expect(wouldBlockMassDeletion({ subscriptions: items, tombstones: {} }, { subscriptions: [], tombstones: { one: "2099-01-01T00:00:00.000Z" } })).toBe(false);
  });
});
