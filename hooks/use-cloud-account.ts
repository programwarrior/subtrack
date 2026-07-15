"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { appUrl } from "@/lib/base-path";
import { accountDataSignature, mergeAccountData, normalizeAppData, type CloudAccountRow } from "@/lib/cloud-account";
import { wouldBlockMassDeletion } from "@/lib/sync-merge";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import type { AppData } from "@/lib/types";

export type CloudAccountStatus = "off" | "checking" | "choose" | "syncing" | "synced" | "error" | "setup-required";
export interface CloudMigrationChoice { cloud: AppData; cloudVersion: number; cloudExists: boolean; }

export function useCloudAccount({ data, enabled, onApply, onNotify }: { data: AppData; enabled: boolean; onApply: (data: AppData) => void; onNotify: (message: string) => void }) {
  const supabase = useMemo(() => getSupabase(), []);
  const [user, setUser] = useState<User | null>(null); const [status, setStatus] = useState<CloudAccountStatus>(supabaseConfigured ? "checking" : "off");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null); const [migration, setMigration] = useState<CloudMigrationChoice | null>(null);
  const [errorMessage, setErrorMessage] = useState(""); const [connected, setConnected] = useState(false);
  const dataRef = useRef(data); const versionRef = useRef(0); const syncInFlight = useRef(false); const syncQueued = useRef(false); const initializedUser = useRef<string | null>(null);
  useEffect(() => { dataRef.current = data; }, [data]);

  const deviceKey = useCallback((userId: string) => `subtrack:cloud-ready:${userId}`, []);
  const apply = useCallback((value: unknown) => {
    const normalized = normalizeAppData(value);
    if (accountDataSignature(normalized) === accountDataSignature(dataRef.current)) return;
    try { localStorage.setItem(`subtrack:pre-cloud-backup:${user?.id ?? "signed-out"}`, JSON.stringify({ savedAt: new Date().toISOString(), data: dataRef.current })); } catch { /* Cloud sync continues if browser backup storage is unavailable. */ }
    dataRef.current = normalized; onApply(normalized);
  }, [onApply, user?.id]);
  const fail = useCallback((message: string, setup = false) => { setErrorMessage(message); setStatus(setup ? "setup-required" : "error"); }, []);

  const fetchRow = useCallback(async (): Promise<CloudAccountRow | null> => {
    if (!supabase || !user) return null;
    const { data: row, error } = await supabase.from("account_state").select("user_id,payload,version,updated_at").eq("user_id", user.id).maybeSingle();
    if (error) { const setup = error.code === "42P01" || /account_state|schema cache/i.test(error.message); fail(setup ? "Run the SubTrack database schema in Supabase before signing in." : error.message, setup); throw error; }
    return row as CloudAccountRow | null;
  }, [fail, supabase, user]);

  const writeExact = useCallback(async (next: AppData, existing: CloudAccountRow | null): Promise<CloudAccountRow> => {
    if (!supabase || !user) throw new Error("Sign in first.");
    if (!existing) {
      const { data: created, error } = await supabase.from("account_state").insert({ user_id: user.id, payload: next, version: 1 }).select("user_id,payload,version,updated_at").single();
      if (error) throw new Error(error.code === "23505" ? "Cloud data changed while syncing. Please retry." : error.message); return created as CloudAccountRow;
    }
    const { data: updated, error } = await supabase.from("account_state").update({ payload: next, version: existing.version + 1, updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("version", existing.version).select("user_id,payload,version,updated_at").maybeSingle();
    if (error) throw new Error(error.message); if (!updated) throw new Error("Cloud data changed while syncing. Please retry."); return updated as CloudAccountRow;
  }, [supabase, user]);

  const finishConnection = useCallback((row: CloudAccountRow) => {
    if (!user) return; versionRef.current = row.version; localStorage.setItem(deviceKey(user.id), "1"); setMigration(null); setConnected(true); setStatus("synced"); setLastSyncedAt(row.updated_at); setErrorMessage("");
  }, [deviceKey, user]);

  const syncNow = useCallback(async () => {
    if (!supabase || !user || !connected) return;
    if (syncInFlight.current) { syncQueued.current = true; return; }
    syncInFlight.current = true; setStatus("syncing");
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const row = await fetchRow(); const local = dataRef.current;
        if (!row) {
          try { const created = await writeExact(local, null); finishConnection(created); return; }
          catch (error) { if (attempt === 1 || !(error instanceof Error && error.message.includes("changed while syncing"))) throw error; continue; }
        }
        const cloud = normalizeAppData(row.payload);
        if (wouldBlockMassDeletion(cloud, local)) {
          apply(cloud); versionRef.current = row.version; setLastSyncedAt(row.updated_at); fail("Cloud sync blocked a bulk deletion and restored the account copy."); return;
        }
        const merged = mergeAccountData(cloud, local);
        if (accountDataSignature(merged) === accountDataSignature(cloud)) { if (accountDataSignature(local) !== accountDataSignature(cloud)) apply(cloud); finishConnection(row); return; }
        try { const updated = await writeExact(merged, row); apply(merged); finishConnection(updated); return; }
        catch (error) { if (attempt === 1 || !(error instanceof Error && error.message.includes("changed while syncing"))) throw error; }
      }
    } catch (error) { fail(error instanceof Error ? error.message : "Cloud sync failed."); }
    finally {
      syncInFlight.current = false;
      if (syncQueued.current) {
        syncQueued.current = false;
        window.setTimeout(() => void syncNow(), 0);
      }
    }
  }, [apply, connected, fail, fetchRow, finishConnection, supabase, user, writeExact]);

  const inspectAccount = useCallback(async (nextUser: User) => {
    if (!supabase || !enabled) return; setStatus("checking"); setErrorMessage("");
    try {
      const { data: rowData, error } = await supabase.from("account_state").select("user_id,payload,version,updated_at").eq("user_id", nextUser.id).maybeSingle();
      if (error) { const setup = error.code === "42P01" || /account_state|schema cache/i.test(error.message); fail(setup ? "Database setup is required before account sync can start." : error.message, setup); return; }
      const row = rowData as CloudAccountRow | null; versionRef.current = row?.version ?? 0;
      setMigration(null); setConnected(true); setStatus("syncing"); if (row) setLastSyncedAt(row.updated_at);
    } catch (error) { fail(error instanceof Error ? error.message : "Could not inspect cloud data."); }
  }, [enabled, fail, supabase]);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data: auth, error }) => { if (error) { setStatus("off"); return; } setUser(auth.user); if (!auth.user) setStatus("off"); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { setUser(session?.user ?? null); if (!session?.user) { setConnected(false); setMigration(null); setStatus("off"); initializedUser.current = null; } });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!user || !enabled || initializedUser.current === user.id) return; initializedUser.current = user.id; void inspectAccount(user);
  }, [enabled, inspectAccount, user]);

  useEffect(() => { if (connected) void syncNow(); }, [connected, syncNow]);
  useEffect(() => { if (!connected) return; const timer = window.setTimeout(() => void syncNow(), 1400); return () => window.clearTimeout(timer); }, [accountDataSignature(data), connected, syncNow]);
  useEffect(() => {
    if (!connected) return; const sync = () => void syncNow(); const interval = window.setInterval(sync, 15_000);
    window.addEventListener("online", sync); window.addEventListener("focus", sync);
    return () => { window.clearInterval(interval); window.removeEventListener("online", sync); window.removeEventListener("focus", sync); };
  }, [connected, syncNow]);
  useEffect(() => {
    if (!connected || !supabase || !user) return;
    const channel = supabase.channel(`account-state-${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "account_state", filter: `user_id=eq.${user.id}` }, (payload) => {
      const nextVersion = Number((payload.new as { version?: number }).version ?? 0);
      if (!nextVersion || nextVersion > versionRef.current) void syncNow();
    }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [connected, supabase, syncNow, user]);

  const chooseCloud = useCallback(async () => {
    if (!migration || !user) return; setStatus("syncing");
    try {
      let row = await fetchRow(); if (!row) row = await writeExact(migration.cloud, null); apply(row.payload); finishConnection(row);
    } catch (error) { fail(error instanceof Error ? error.message : "Could not download cloud data."); }
  }, [apply, fail, fetchRow, finishConnection, migration, user, writeExact]);
  const chooseLocal = useCallback(async () => {
    if (!user) return; setStatus("syncing");
    try { const row = await writeExact(dataRef.current, await fetchRow()); finishConnection(row); }
    catch (error) { fail(error instanceof Error ? error.message : "Could not upload this device."); }
  }, [fail, fetchRow, finishConnection, user, writeExact]);
  const chooseMerge = useCallback(async () => {
    if (!user) return; setStatus("syncing");
    try { const row = await fetchRow(); const merged = mergeAccountData(row?.payload, dataRef.current); const updated = await writeExact(merged, row); apply(merged); finishConnection(updated); }
    catch (error) { fail(error instanceof Error ? error.message : "Could not merge device and cloud data."); }
  }, [apply, fail, fetchRow, finishConnection, user, writeExact]);

  const signIn = useCallback(async (email: string, password: string) => { if (!supabase) return "Supabase is not configured."; setStatus("checking"); const { error } = await supabase.auth.signInWithPassword({ email, password }); return error?.message ?? null; }, [supabase]);
  const signUp = useCallback(async (email: string, password: string) => { if (!supabase) return "Supabase is not configured."; setStatus("checking"); const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: appUrl() } }); return error?.message ?? null; }, [supabase]);
  const sendMagicLink = useCallback(async (email: string) => { if (!supabase) return "Supabase is not configured."; const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: appUrl() } }); return error?.message ?? null; }, [supabase]);
  const signOut = useCallback(async () => { if (!supabase) return; await supabase.auth.signOut(); setConnected(false); setStatus("off"); onNotify("Signed out. Local offline data remains on this device."); }, [onNotify, supabase]);

  return { configured: supabaseConfigured, user, status, errorMessage, lastSyncedAt, migration, signIn, signUp, sendMagicLink, signOut, chooseCloud, chooseLocal, chooseMerge, syncNow };
}
