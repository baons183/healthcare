/**
 * POST /api/push/test – gửi thử thông báo tới thiết bị của người dùng đang đăng nhập,
 * kèm bản xem trước các nhắc lịch hôm nay (không ghi nhật ký, không ảnh hưởng lịch gửi thật).
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { buildDigests, DEFAULT_SETTINGS, loadUserData, sendToUser, type Settings } from "@/lib/server/push";

export const runtime = "nodejs";

export async function POST() {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  try {
    const sent = await sendToUser(sb, user.id, {
      title: "🔔 Thông báo đã hoạt động",
      body: "Bạn sẽ nhận nhắc lịch cân đo, tiêm chủng và xổ giun trên thiết bị này.",
      url: "/settings",
      tag: "test",
    });
    if (!sent) return NextResponse.json({ error: "Không có thiết bị nào nhận được. Hãy bật thông báo lại." }, { status: 400 });

    const { data: st } = await sb.from("notification_settings").select("*").eq("user_id", user.id).maybeSingle();
    const settings: Settings = { ...DEFAULT_SETTINGS, ...(st ?? {}) };
    const digests = buildDigests(await loadUserData(sb, user.id), settings, new Set());
    for (const d of digests) await sendToUser(sb, user.id, { ...d.payload, title: `[Xem trước] ${d.payload.title}` });
    return NextResponse.json({ ok: true, devices: sent, previews: digests.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
