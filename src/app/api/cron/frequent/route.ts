/**
 * Chạy mỗi 15 phút (pg_cron của Supabase – xem supabase/migrations/0006_medication_cron.sql)
 * – nhắc giờ uống thuốc. Bảo vệ bằng CRON_SECRET.
 * Cũng giữ Supabase hoạt động (không bị tạm dừng) vì có truy vấn DB thường xuyên.
 */
import { NextResponse } from "next/server";
import { adminClient, DEFAULT_SETTINGS, familyUserIds, sendToUser } from "@/lib/server/push";
import { hhmmToMinutes, vnNow } from "@/lib/date";
import type { Medication } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Nhắc nếu giờ uống nằm trong 30 phút vừa qua (bù trễ của cron); khóa nhật ký chống gửi trùng */
const WINDOW_MIN = 30;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sb = adminClient();
  const now = vnNow();

  const { data: meds, error } = await sb
    .from("medications")
    .select("*")
    .eq("remind", true)
    .lte("start_on", now.date)
    .or(`end_on.is.null,end_on.gte.${now.date}`);
  if (error) return NextResponse.json({ ok: true, skipped: error.message });

  // Các lần uống đến giờ
  const due: { med: Medication; time: string; key: string }[] = [];
  for (const med of (meds ?? []) as Medication[]) {
    for (const time of med.times ?? []) {
      const diff = now.minutes - hhmmToMinutes(time);
      if (diff >= 0 && diff < WINDOW_MIN) due.push({ med, time, key: `med:${med.id}:${now.date}:${time}` });
    }
  }
  if (!due.length) return NextResponse.json({ ok: true, due: 0 });

  const memberIds = [...new Set(due.map((d) => d.med.member_id))];
  const familyIds = [...new Set(due.map((d) => d.med.family_id))];
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
  const wants = (u: string) => {
    const s = (settings ?? []).find((r) => r.user_id === u);
    return s?.notify_medication ?? DEFAULT_SETTINGS.notify_medication;
  };
  const sent = new Set((logs ?? []).map((l) => `${l.user_id}|${l.key}`));

  // Gộp theo người dùng
  const perUser = new Map<string, typeof due>();
  for (const d of due) {
    for (const u of usersByFamily.get(d.med.family_id) ?? []) {
      if (!wants(u) || sent.has(`${u}|${d.key}`)) continue;
      perUser.set(u, [...(perUser.get(u) ?? []), d]);
    }
  }

  let delivered = 0;
  for (const [userId, items] of perUser) {
    const lines = items.map((d) => `${nameOf.get(d.med.member_id) ?? ""}: ${d.med.name}${d.med.dosage ? ` – ${d.med.dosage}` : ""} (${d.time})`);
    const single = new Set(items.map((d) => d.med.member_id)).size === 1;
    try {
      const n = await sendToUser(sb, userId, {
        title: "💊 Đến giờ uống thuốc",
        body: lines.join("\n"),
        url: single ? `/members/${items[0].med.member_id}?tab=illness` : "/",
        tag: `med-${now.date}-${items[0].time}`,
      });
      if (n > 0) {
        delivered++;
        await sb.from("notification_log").upsert(items.map((d) => ({ user_id: userId, key: d.key })));
      }
    } catch (e) {
      console.error("med push failed", (e as Error).message);
    }
  }
  return NextResponse.json({ ok: true, due: due.length, users: perUser.size, delivered });
}
