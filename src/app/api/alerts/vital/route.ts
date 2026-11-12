/**
 * POST /api/alerts/vital { vital_id } – gọi ngay sau khi nhập huyết áp.
 * Nếu ở mức nguy hiểm (≥ 160/100) thì báo cho các thành viên khác trong gia đình.
 * Quyền đọc bản ghi được kiểm tra bằng RLS (client của người dùng đang đăng nhập).
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { adminClient, familyUserIds, sendToUser } from "@/lib/server/push";
import { BP_CRISIS_ADVICE, gradeBP, isBpAlarm, isBpCrisis } from "@/lib/vitals";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const { vital_id } = (await req.json().catch(() => ({}))) as { vital_id?: string };
  if (!vital_id) return NextResponse.json({ error: "Thiếu vital_id" }, { status: 400 });

  const { data: v } = await sb.from("vitals").select("id, family_id, member_id, measured_at, systolic, diastolic, pulse").eq("id", vital_id).maybeSingle();
  if (!v) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  // Chỉ báo cho lần đo mới (trong 6 giờ) – tránh báo khi nhập lại số liệu cũ
  const fresh = Date.now() - new Date(v.measured_at).getTime() < 6 * 3600_000;
  if (!v.systolic || !v.diastolic || !isBpAlarm(v.systolic, v.diastolic) || !fresh) return NextResponse.json({ ok: true, sent: 0 });

  try {
    const admin = adminClient();
    const { data: m } = await admin.from("members").select("full_name").eq("id", v.member_id).single();
    const users = ((await familyUserIds(admin, [v.family_id])).get(v.family_id) ?? []).filter((u) => u !== user.id);
    const key = `vital:${v.id}`;
    const { data: logs } = await admin.from("notification_log").select("user_id").eq("key", key);
    const done = new Set((logs ?? []).map((l) => l.user_id as string));
    const crisis = isBpCrisis(v.systolic, v.diastolic);
    const time = new Date(new Date(v.measured_at).getTime() + 7 * 3600_000).toISOString().slice(11, 16);
    let sent = 0;
    for (const u of users) {
      if (done.has(u)) continue;
      const n = await sendToUser(admin, u, {
        title: `${crisis ? "🚨" : "⚠️"} ${m?.full_name ?? ""}: huyết áp ${v.systolic}/${v.diastolic}`,
        body: `${gradeBP(v.systolic, v.diastolic).label} (đo lúc ${time}${v.pulse ? `, mạch ${v.pulse}` : ""}). ${crisis ? BP_CRISIS_ADVICE : "Hãy gọi hỏi thăm và nhắc đo lại sau 5 phút nghỉ."}`,
        url: `/members/${v.member_id}?tab=checkups`,
        tag: key,
      });
      if (n > 0) {
        sent++;
        await admin.from("notification_log").upsert({ user_id: u, key });
      }
    }
    return NextResponse.json({ ok: true, sent, family: users.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
