"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useFamily } from "@/components/FamilyProvider";
import { ErrorText, Field } from "@/components/ui";
import { cancelInvite, exportFamily, familyUsers, inviteUser, listInvites, removeFamilyUser, renameFamily } from "@/lib/data";
import { supabase } from "@/lib/supabase/client";

const ROLE: Record<string, string> = { owner: "Chủ sở hữu", editor: "Được sửa", viewer: "Chỉ xem" };

export default function SettingsPage() {
  return (
    <AppShell>
      <Settings />
    </AppShell>
  );
}

function Settings() {
  const { family, user, reload } = useFamily();
  const router = useRouter();
  const isOwner = family?.role === "owner";
  const [name, setName] = useState(family?.name ?? "");
  const [users, setUsers] = useState<{ user_id: string; email: string; role: string }[]>([]);
  const [invites, setInvites] = useState<{ id: string; email: string | null; phone: string | null; role: string }[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!family) return;
    setUsers(await familyUsers(family.id));
    if (isOwner) setInvites(await listInvites(family.id));
  }, [family, isOwner]);

  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setError(null);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg(ok);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  async function download() {
    if (!family) return;
    const data = await exportFamily(family.id);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `so-suc-khoe-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function signOut() {
    await supabase().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (!family) return null;

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">Cài đặt</h1>
      <ErrorText error={error} />
      {msg && <p className="rounded-lg bg-[var(--good-soft)] px-3 py-2 text-sm text-good">{msg}</p>}

      <section className="card space-y-3 p-4">
        <h2 className="font-bold">Gia đình</h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await renameFamily(family.id, name.trim());
              await reload();
            }, "Đã đổi tên.");
          }}
        >
          <input className="input" value={name} disabled={!isOwner} onChange={(e) => setName(e.target.value)} aria-label="Tên gia đình" />
          {isOwner && <button className="btn">Lưu</button>}
        </form>
        <p className="text-xs text-muted">Gói: {family.plan === "free" ? "Miễn phí" : family.plan}</p>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-bold">Người cùng quản lý</h2>
        <ul className="divide-y divide-border text-sm">
          {users.map((u) => (
            <li key={u.user_id} className="flex items-center gap-2 py-2">
              <span className="flex-1 truncate">
                {u.email} {u.user_id === user?.id && <span className="text-muted">(bạn)</span>}
              </span>
              <span className="badge badge-muted">{ROLE[u.role]}</span>
              {isOwner && u.role !== "owner" && (
                <button className="btn btn-sm btn-danger" onClick={() => run(async () => { await removeFamilyUser(family.id, u.user_id); await load(); })}>
                  Gỡ
                </button>
              )}
            </li>
          ))}
          {invites.map((i) => (
            <li key={i.id} className="flex items-center gap-2 py-2">
              <span className="flex-1 truncate text-text-2">{i.email ?? (i.phone ? `+${i.phone}` : "")}</span>
              <span className="badge badge-warning">Đang mời · {ROLE[i.role]}</span>
              <button className="btn btn-sm" onClick={() => run(async () => { await cancelInvite(i.id); await load(); })}>
                Hủy
              </button>
            </li>
          ))}
        </ul>
        {isOwner && (
          <form
            className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await inviteUser(family.id, email, role);
                setEmail("");
                await load();
              }, "Đã tạo lời mời. Người được mời chỉ cần đăng ký/đăng nhập bằng email hoặc số điện thoại này.");
            }}
          >
            <Field label="Mời bằng email hoặc số điện thoại">
              <input className="input" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vo.chong@gmail.com hoặc 0912345678" />
            </Field>
            <Field label="Quyền">
              <select className="input" value={role} onChange={(e) => setRole(e.target.value as "editor" | "viewer")}>
                <option value="editor">Được sửa</option>
                <option value="viewer">Chỉ xem</option>
              </select>
            </Field>
            <button className="btn btn-primary self-end">Mời</button>
          </form>
        )}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-bold">Dữ liệu</h2>
        <p className="text-sm text-text-2">Tải về toàn bộ dữ liệu (JSON) để sao lưu. Ảnh giấy tờ vẫn nằm trên cloud.</p>
        <button className="btn" onClick={() => run(download)}>
          ⬇ Xuất dữ liệu
        </button>
      </section>

      <section className="card flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs text-muted">Đang đăng nhập</p>
          <p className="truncate font-semibold">{user?.email || (user?.phone ? `+${user.phone}` : "")}</p>
        </div>
        <button className="btn btn-danger" onClick={signOut}>
          Đăng xuất
        </button>
      </section>
    </div>
  );
}
