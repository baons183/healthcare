"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type { Family } from "@/lib/types";

interface Ctx {
  user: User | null;
  families: Family[];
  family: Family | null;
  canEdit: boolean;
  loading: boolean;
  setFamilyId: (id: string) => void;
  reload: () => Promise<void>;
}

const FamilyCtx = createContext<Ctx | null>(null);
const KEY = "hc.familyId";

export function FamilyProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [families, setFamilies] = useState<Family[]>([]);
  const [familyId, setFamilyIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const sb = supabase();
    const { data } = await sb.auth.getUser();
    setUser(data.user);
    if (!data.user) {
      setFamilies([]);
      setLoading(false);
      return;
    }
    await sb.rpc("accept_pending_invites");
    let { data: rows } = await sb
      .from("family_users")
      .select("role, families(id, name, owner_id, plan)")
      .eq("user_id", data.user.id);
    if (!rows?.length) {
      await sb.rpc("create_family", { fname: "Gia đình của tôi" });
      ({ data: rows } = await sb
        .from("family_users")
        .select("role, families(id, name, owner_id, plan)")
        .eq("user_id", data.user.id));
    }
    const list: Family[] = (rows ?? [])
      .map((r) => {
        const f = (Array.isArray(r.families) ? r.families[0] : r.families) as Omit<Family, "role"> | null;
        return f ? { ...f, role: r.role as Family["role"] } : null;
      })
      .filter((f): f is Family => !!f);
    setFamilies(list);
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {}
    setFamilyIdState(list.find((f) => f.id === saved)?.id ?? list[0]?.id ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    const { data: sub } = supabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") reload();
    });
    return () => sub.subscription.unsubscribe();
  }, [reload]);

  const setFamilyId = (id: string) => {
    setFamilyIdState(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {}
  };

  const family = families.find((f) => f.id === familyId) ?? null;
  return (
    <FamilyCtx.Provider
      value={{ user, families, family, canEdit: family?.role !== "viewer", loading, setFamilyId, reload }}
    >
      {children}
    </FamilyCtx.Provider>
  );
}

export function useFamily(): Ctx {
  const c = useContext(FamilyCtx);
  if (!c) throw new Error("useFamily must be used inside FamilyProvider");
  return c;
}
