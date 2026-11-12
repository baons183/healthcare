/**
 * POST /api/reminders/act { key, sig, action: "done" | "snooze" }
 * Gọi từ nút trên thông báo (public/sw.js). Xác thực bằng chữ ký (không cần đăng nhập).
 */
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/server/push";
import { verifyKey } from "@/lib/server/sign";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { key, sig, action } = (await req.json().catch(() => ({}))) as { key?: string; sig?: string; action?: string };
  if (!key || !sig || (action !== "done" && action !== "snooze")) return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (!verifyKey(key, sig)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sb = adminClient();
  const { data: ev } = await sb.from("reminder_events").select("id, member_id, kind, time, status").eq("key", key).maybeSingle();
  if (!ev) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (action === "done") {
    await sb.from("reminder_events").update({ status: "done", done_at: new Date().toISOString() }).eq("id", ev.id);
  } else if (ev.status === "pending") {
    await sb.from("reminder_events").update({ next_at: new Date(Date.now() + 10 * 60_000).toISOString() }).eq("id", ev.id);
  }
  const { data: m } = await sb.from("members").select("full_name").eq("id", ev.member_id).maybeSingle();
  return NextResponse.json({ ok: true, label: `${m?.full_name ?? ""} – ${ev.kind === "bp" ? "đo huyết áp" : "uống thuốc"} ${ev.time}` });
}
