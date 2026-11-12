/**
 * POST /api/push/test – gửi thử thông báo tới thiết bị (và email nếu bật) của người dùng đang đăng nhập,
 * kèm bản xem trước các nhắc lịch hôm nay (không ghi nhật ký, không ảnh hưởng lịch gửi thật).
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { buildDigests, DEFAULT_SETTINGS, loadUserData, sendToUser, type Settings } from "@/lib/server/push";
import { appUrl, mailConfigured, sendDigestEmail } from "@/lib/server/mail";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  try {
    const { data: st } = await sb.from("notification_settings").select("*").eq("user_id", user.id).maybeSingle();
    const settings: Settings = { ...DEFAULT_SETTINGS, ...(st ?? {}) };
    const digests = buildDigests(await loadUserData(sb, user.id), settings, new Set());

    const { count } = await sb.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    let devices = 0;
    if (count) {
      devices = await sendToUser(sb, user.id, {
        title: "🔔 Thông báo đã hoạt động",
        body: "Bạn sẽ nhận nhắc lịch cân đo, tiêm chủng, khám định kỳ và giờ uống thuốc trên thiết bị này.",
        url: "/settings",
        tag: "test",
      });
      if (devices) for (const d of digests) await sendToUser(sb, user.id, { ...d.payload, title: `[Xem trước] ${d.payload.title}` });
    }

    let email: string | null = null;
    if (settings.notify_email) {
      if (!mailConfigured()) return NextResponse.json({ error: "Chưa cấu hình gửi email trên server (SMTP_HOST, SMTP_USER, SMTP_PASS)." }, { status: 400 });
      if (!user.email) return NextResponse.json({ error: "Tài khoản chưa có email (đăng nhập bằng số điện thoại)." }, { status: 400 });
      const items = digests.length
        ? digests.map((d) => ({ ...d.payload, title: `[Xem trước] ${d.payload.title}` }))
        : [{ title: "🔔 Email nhắc lịch đã hoạt động", body: "Hôm nay chưa có lịch nào cần nhắc.", url: "/settings" }];
      await sendDigestEmail(user.email, items, appUrl(req));
      email = user.email;
    }

    if (!devices && !email) return NextResponse.json({ error: "Không có thiết bị nào nhận được. Hãy bật thông báo lại." }, { status: 400 });
    return NextResponse.json({ ok: true, devices, email, previews: digests.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
