/**
 * Chạy mỗi 15 phút (pg_cron của Supabase – xem supabase/migrations/0006_medication_cron.sql)
 * – nhắc giờ uống thuốc và giờ đo huyết áp. Bảo vệ bằng CRON_SECRET.
 *
 * Mỗi lần nhắc là 1 dòng trong reminder_events (migration 0008):
 *   pending --(gửi, 15 phút sau gửi lại, tối đa 3 lần nhắc lại)--> missed (báo người nhà)
 *   pending --(bấm "Đã uống" / "Đã đo", hoặc vừa nhập huyết áp)--> done
 * Cũng giữ Supabase hoạt động (không bị tạm dừng) vì có truy vấn DB thường xuyên.
 */
import { NextResponse } from "next/server";
import { adminClient, DEFAULT_SETTINGS, familyUserIds, sendToUser } from "@/lib/server/push";
import { signKey } from "@/lib/server/sign";
import { addDays, hhmmToMinutes, vnNow } from "@/lib/date";
import type { Medication } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Bắt lịch nếu giờ hẹn nằm trong 30 phút vừa qua (bù trễ của cron) */
const WINDOW_MIN = 30;
/** Lần gửi đầu + 3 lần nhắc lại */
const MAX_SENDS = 4;
const REPEAT_MIN = 15;

interface EventRow {
  id: string;
  key: string;
  family_id: string;
  member_id: string;
  kind: "med" | "bp";
  ref_id: string | null;
  day: string;
  time: string;
  status: string;
  sent_count: number;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sb = adminClient();
  const now = vnNow();
  const nowIso = new Date().toISOString();
  const inWindow = (t: string) => {
    const diff = now.minutes - hhmmToMinutes(t);
    return diff >= 0 && diff < WINDOW_MIN;
  };

  // ---- 1) Tạo các lần nhắc mới đến giờ
  const { data: meds } = await sb
    .from("medications")
    .select("*")
    .eq("remind", true)
    .lte("start_on", now.date)
    .or(`end_on.is.null,end_on.gte.${now.date}`);
  const medById = new Map(((meds ?? []) as Medication[]).map((m) => [m.id, m]));
  const fresh: Omit<EventRow, "id" | "status" | "sent_count">[] = [];
  for (const med of medById.values()) {
    for (const time of med.times ?? []) {
      if (inWindow(time))
        fresh.push({ key: `med:${med.id}:${now.date}:${time}`, family_id: med.family_id, member_id: med.member_id, kind: "med", ref_id: med.id, day: now.date, time });
    }
  }
  const { data: bpMembers } = await sb.from("members").select("id, family_id, bp_times");
  for (const m of bpMembers ?? []) {
    for (const time of ((m.bp_times as string[] | null) ?? []).filter(inWindow)) {
      fresh.push({ key: `bp:${m.id}:${now.date}:${time}`, family_id: m.family_id as string, member_id: m.id as string, kind: "bp", ref_id: null, day: now.date, time });
    }
  }
  if (fresh.length) {
    const ins = await sb.from("reminder_events").upsert(fresh, { onConflict: "key", ignoreDuplicates: true });
    if (ins.error) return NextResponse.json({ ok: false, error: `reminder_events: ${ins.error.message} – hãy chạy 0008_reminder_events.sql` });
  }

  // ---- 2) Các lần nhắc cần xử lý bây giờ
  const { data: evs, error } = await sb
    .from("reminder_events")
    .select("id, key, family_id, member_id, kind, ref_id, day, time, status, sent_count")
    .eq("status", "pending")
    .lte("next_at", nowIso)
    .gte("day", addDays(now.date, -1));
  if (error) return NextResponse.json({ ok: false, error: error.message });
  let events = (evs ?? []) as EventRow[];
  if (!events.length) return NextResponse.json({ ok: true, events: 0 });

  // Huyết áp: đã đo từ 60 phút trước giờ hẹn -> coi như xong
  const bpEvents = events.filter((e) => e.kind === "bp");
  if (bpEvents.length) {
    const earliest = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: vit } = await sb
      .from("vitals")
      .select("member_id, measured_at")
      .in("member_id", [...new Set(bpEvents.map((e) => e.member_id))])
      .not("systolic", "is", null)
      .gte("measured_at", earliest);
    const doneIds: string[] = [];
    for (const e of bpEvents) {
      const due = new Date(`${e.day}T${e.time}:00+07:00`).getTime() - 60 * 60_000;
      if ((vit ?? []).some((v) => v.member_id === e.member_id && new Date(v.measured_at as string).getTime() >= due)) doneIds.push(e.id);
    }
    if (doneIds.length) {
      await sb.from("reminder_events").update({ status: "done", done_at: nowIso }).in("id", doneIds);
      events = events.filter((e) => !doneIds.includes(e.id));
    }
  }
  // Thuốc đã xóa / tắt nhắc -> bỏ
  const stale = events.filter((e) => e.kind === "med" && !medById.has(e.ref_id ?? ""));
  if (stale.length) {
    await sb.from("reminder_events").delete().in("id", stale.map((e) => e.id));
    events = events.filter((e) => !stale.includes(e));
  }

  const [{ data: members }, usersByFamily] = await Promise.all([
    sb.from("members").select("id, full_name").in("id", [...new Set(events.map((e) => e.member_id))]),
    familyUserIds(sb, [...new Set(events.map((e) => e.family_id))]),
  ]);
  const nameOf = new Map((members ?? []).map((m) => [m.id as string, m.full_name as string]));
  const allUsers = [...new Set([...usersByFamily.values()].flat())];
  const { data: settings } = await sb.from("notification_settings").select("user_id, notify_medication").in("user_id", allUsers);
  const wants = (u: string) => (settings ?? []).find((r) => r.user_id === u)?.notify_medication ?? DEFAULT_SETTINGS.notify_medication;

  const what = (e: EventRow) => {
    if (e.kind === "bp") return "đo huyết áp";
    const m = medById.get(e.ref_id ?? "");
    return `uống ${m?.name ?? "thuốc"}${m?.dosage ? ` – ${m.dosage}` : ""}`;
  };

  let sent = 0;
  let missed = 0;
  for (const e of events) {
    const users = (usersByFamily.get(e.family_id) ?? []).filter(wants);
    const name = nameOf.get(e.member_id) ?? "";
    try {
      if (e.sent_count < MAX_SENDS) {
        const repeat = e.sent_count > 0;
        for (const u of users) {
          await sendToUser(sb, u, {
            title: `${e.kind === "bp" ? "🩺 Đến giờ đo huyết áp" : "💊 Đến giờ uống thuốc"}${repeat ? ` (nhắc lần ${e.sent_count + 1})` : ""}`,
            body: `${name}: ${what(e)} – ${e.time}`,
            url: `/members/${e.member_id}?tab=${e.kind === "bp" ? "checkups" : "illness"}`,
            tag: e.key,
            urgent: true,
            key: e.key,
            sig: signKey(e.key),
            actions: [
              { action: "done", title: e.kind === "bp" ? "✅ Đã đo" : "✅ Đã uống" },
              { action: "snooze", title: "⏰ 10 phút nữa" },
            ],
          });
        }
        await sb
          .from("reminder_events")
          .update({ sent_count: e.sent_count + 1, next_at: new Date(Date.now() + REPEAT_MIN * 60_000).toISOString() })
          .eq("id", e.id);
        sent++;
      } else {
        // Hết số lần nhắc mà chưa xác nhận -> báo cả nhà
        await sb.from("reminder_events").update({ status: "missed" }).eq("id", e.id);
        for (const u of users) {
          await sendToUser(sb, u, {
            title: `⚠️ ${name} chưa ${e.kind === "bp" ? "đo huyết áp" : "uống thuốc"}`,
            body: `${what(e)} lúc ${e.time} – đã nhắc ${MAX_SENDS} lần nhưng chưa thấy xác nhận. Hãy gọi hỏi thăm.`,
            url: `/members/${e.member_id}?tab=${e.kind === "bp" ? "checkups" : "illness"}`,
            tag: `missed-${e.key}`,
          });
        }
        missed++;
      }
    } catch (err) {
      console.error("reminder failed", e.key, (err as Error).message);
    }
  }
  return NextResponse.json({ ok: true, created: fresh.length, sent, missed });
}
