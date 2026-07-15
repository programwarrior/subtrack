import { describe, expect, it } from "vitest";
import { createSubscription } from "@/hooks/use-subscriptions";
import { hasAccountData, mergeAccountData, normalizeAppData } from "@/lib/cloud-account";
import { defaultSettings, type AppData } from "@/lib/types";

const empty = (): AppData => ({ subscriptions: [], settings: defaultSettings, tombstones: {}, deletedSubscriptions: [] });

describe("cloud account data", () => {
  it("normalizes an older local payload", () => {
    expect(normalizeAppData({ subscriptions: [] }).deletedSubscriptions).toEqual([]);
  });
  it("merges independent subscriptions without replacing either device", () => {
    const cloud = empty(); const local = empty();
    cloud.subscriptions = [createSubscription({ id: "cloud", name: "Cloud", price: 5, billingFrequency: "monthly", nextPaymentDate: "2026-08-01" })];
    local.subscriptions = [createSubscription({ id: "local", name: "Local", price: 6, billingFrequency: "monthly", nextPaymentDate: "2026-08-02" })];
    expect(mergeAccountData(cloud, local).subscriptions.map((item) => item.id).sort()).toEqual(["cloud", "local"]);
  });
  it("preserves a recoverable deleted record", () => {
    const cloud = empty(); const item = createSubscription({ id: "deleted", name: "Deleted", price: 5, billingFrequency: "monthly", nextPaymentDate: "2026-08-01" });
    cloud.tombstones.deleted = "2026-07-15T10:00:00.000Z"; cloud.deletedSubscriptions = [{ subscription: item, deletedAt: cloud.tombstones.deleted }];
    const merged = mergeAccountData(cloud, empty());
    expect(merged.subscriptions).toEqual([]); expect(merged.deletedSubscriptions[0].subscription.name).toBe("Deleted");
  });
  it("recognizes meaningful account data", () => {
    const data = empty(); expect(hasAccountData(data)).toBe(false); data.tombstones.old = new Date().toISOString(); expect(hasAccountData(data)).toBe(true);
  });
});
