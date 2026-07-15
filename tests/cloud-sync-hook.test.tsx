/* @vitest-environment jsdom */

import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSubscription } from "@/hooks/use-subscriptions";
import { defaultSettings, type AppData } from "@/lib/types";

const cloudMock = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  inserted: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/supabase", () => {
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1", email: "test@example.com" } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: cloudMock.row, error: null }) }) }),
      insert: (payload: Record<string, unknown>) => {
        cloudMock.inserted.push(payload);
        cloudMock.row = { ...payload, version: 1, updated_at: "2026-07-15T12:00:00.000Z" };
        return { select: () => ({ single: async () => ({ data: cloudMock.row, error: null }) }) };
      },
      update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: cloudMock.row, error: null }) }) }) }) }),
    }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: async () => undefined,
  };
  return { getSupabase: () => client, supabaseConfigured: true };
});

import { useCloudAccount } from "@/hooks/use-cloud-account";

afterEach(() => {
  cleanup();
  localStorage.clear();
  cloudMock.row = null;
  cloudMock.inserted.length = 0;
});

describe("first-device cloud sync", () => {
  it("automatically uploads local subscriptions when the account cloud is empty", async () => {
    const local: AppData = {
      subscriptions: [createSubscription({ id: "phone-plan", name: "Phone plan", price: 12, billingFrequency: "monthly", nextPaymentDate: "2026-08-01" })],
      settings: defaultSettings,
      tombstones: {},
      deletedSubscriptions: [],
    };
    const onApply = vi.fn();
    const { result } = renderHook(() => useCloudAccount({ data: local, enabled: true, onApply, onNotify: vi.fn() }));

    await waitFor(() => expect(result.current.status).toBe("synced"));

    expect(result.current.migration).toBeNull();
    expect(cloudMock.inserted).toHaveLength(1);
    expect((cloudMock.inserted[0].payload as AppData).subscriptions[0].id).toBe("phone-plan");
  });

  it("automatically downloads cloud subscriptions onto an empty device", async () => {
    const cloud: AppData = {
      subscriptions: [createSubscription({ id: "cloud-plan", name: "Cloud plan", price: 19, billingFrequency: "monthly", nextPaymentDate: "2026-08-02" })],
      settings: defaultSettings,
      tombstones: {},
      deletedSubscriptions: [],
    };
    cloudMock.row = { user_id: "user-1", payload: cloud, version: 3, updated_at: "2026-07-15T12:00:00.000Z" };
    const empty: AppData = { subscriptions: [], settings: defaultSettings, tombstones: {}, deletedSubscriptions: [] };
    const onApply = vi.fn();
    const { result } = renderHook(() => useCloudAccount({ data: empty, enabled: true, onApply, onNotify: vi.fn() }));

    await waitFor(() => expect(result.current.status).toBe("synced"));

    expect(cloudMock.inserted).toHaveLength(0);
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ subscriptions: [expect.objectContaining({ id: "cloud-plan" })] }));
  });
});
