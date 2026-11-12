/**
 * Chạy mỗi 15 phút (pg_cron của Supabase – xem supabase/migrations/0006_medication_cron.sql)
 * – nhắc giờ uống thuốc và giờ đo huyết áp. Bảo vệ bằng CRON_SECRET.
 * Cũng giữ Supabase hoạt động (không bị tạm dừng) vì có truy vấn DB thường xuyên.
 */
import { NextResponse } from "next/server";
import { adminClient, DEFAULT_SETTINGS, familyUserIds, sendToUser } from "@/lib/server/push";
import { hhmmToMinutes, vnNow } from "@/lib/date";
import type { Medication } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Nhắc nếu giờ hẹn nằm trong 30 phút vừa qua (bù trễ của cron); khóa nhật ký chống gửi trùng */
const WINDOW_MIN = 30;

interface DueItem {
  kind: "med" | "bp";
  family_id: string;
  member_id: string;
  time: string;
  key: string;
  what: string;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sb = adminClient();
  const now = vnNow();
  const inWindow = (t: string) => {
    const diff = now.minutes - hhmmToMinutes(t);
    return diff >= 0 && diff < WINDOW_MIN;
  };
  const due: DueItem[] = [];

  // 1) Thuốc
  const { data: meds } = await sb
    .from("medications")
    .select("*")
    .eq("remind", true)
    .lte("start_on", now.date)
    .or(`end_on.is.null,end_on.gte.${now.date}`);
  for (const med of (meds ?? []) as Medication[]) {
    for (const time of med.times ?? []) {
      if (!inWindow(time)) continue;
      due.push({
        kind: "med",
        family_id: med.family_id,
        member_id: med.member_id,
        time,
        key: `med:${med.id}:${now.date}:${time}`,
        what: `${med.name}${med.dosage ? ` – ${med.dosage}` : ""}`,
      });
    }
  }

  // 2) Đo huyết áp (cột bp_times – migration 0007; lỗi thì bỏ qua)
  const { data: bpMembers } = await sb.from("members").select("id, family_id, bp_times");
  const bpDue = (bpMembers ?? []).flatMap((m) =>
    ((m.bp_times as string[] | null) ?? []).filter(inWindow).map((time) => ({ m, time })),
  );
  if (bpDue.length) {
    // Bỏ qua nếu đã đo trong 60 phút trước
    const since = new Date(Date.now() - 60 * 60_000).toISOString();
    const { data: recent } = await sb
      .from("vitals")
      .select("member_id")
      .in("member_id", bpDue.map((x) => x.m.id as string))
      .not("systolic", "is", null)
      .gte("measured_at", since);
    const measured = new Set((recent ?? []).map((r) => r.member_id as string));
    for (const { m, time } of bpDue) {
      if (measured.has(m.id as string)) continue;
      due.push({ kind: "bp", family_id: m.family_id as string, member_id: m.id as string, time, key: `bp:${m.id}:${now.date}:${time}`, what: "đo huyết áp" });
    }
  }
  if (!due.length) return NextResponse.json({ ok: true, due: 0 });

  const memberIds = [...new Set(due.map((d) => d.member_id))];
  const familyIds = [...new Set(due.map((d) => d.family_id))];
  const [{ data: members }, usersByFamily] = await Promise.all([
    sb.from("members").select("id, full_name").in("id", memberIds),
    familyUserIds(sb, familyIds),
  ]);
  const nameOf = new Map((members ?? []).map((m) => [m.id as string, m.full_name as string]));
  const allUsers = [...new Set([...usersByFamily.values()].flat())];
  const [{ data: settings }, { data: logs }] = await Promise.all([
    sb.from("notification_settings").select("user_id, notify_medication").in("user_id", allUsers),
    sb.from("notification_log").select("user_id, key").in("user_id", allUsers).in("key", due.map((d) => d.key)),
  ]);
  const wants = (u: string) => (settings ?? []).find((r) => r.user_id === u)?.notify_medication ?? DEFAULT_SETTINGS.notify_medication;
  const sent = new Set((logs ?? []).map((l) => `${l.user_id}|${l.key}`));

  // Gộp theo người dùng
  const perUser = new Map<string, DueItem[]>();
  for (const d of due) {
    for (const u of usersByFamily.get(d.family_id) ?? []) {
      if (!wants(u) || sent.has(`${u}|${d.key}`)) continue;
      perUser.set(u, [...(perUser.get(u) ?? []), d]);
    }
  }

  let delivered = 0;
  for (const [userId, items] of perUser) {
    const kinds = new Set(items.map((d) => d.kind));
    const title = kinds.size === 2 ? "💊🩺 Đến giờ uống thuốc & đo huyết áp" : kinds.has("bp") ? "🩺 Đến giờ đo huyết áp" : "💊 Đến giờ uống thuốc";
    const lines = items.map((d) => `${nameOf.get(d.member_id) ?? ""}: ${d.what} (${d.time})`);
    const single = new Set(items.map((d) => d.member_id)).size === 1;
    try {
      const n = await sendToUser(sb, userId, {
        title,
        body: lines.join("\n"),
        url: single ? `/members/${items[0].member_id}?tab=${kinds.has("med") ? "illness" : "checkups"}` : "/",
        tag: `remind-${now.date}-${items[0].time}`,
      });
      if (n > 0) {
        delivered++;
        await sb.from("notification_log").upsert(items.map((d) => ({ user_id: userId, key: d.key })));
      }
    } catch (e) {
      console.error("reminder push failed", (e as Error).message);
    }
  }
  return NextResponse.json({ ok: true, due: due.length, users: perUser.size, delivered });
}
