/**
 * Chạy mỗi ngày bởi Vercel Cron (xem vercel.json) – gửi thông báo nhắc lịch.
 * Bảo vệ bằng CRON_SECRET (Vercel tự gửi header Authorization: Bearer <CRON_SECRET>).
 */
import { NextResponse } from "next/server";
import { adminClient, buildDigests, DEFAULT_SETTINGS, loadUserData, sendToUser, type Settings } from "@/lib/server/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sb = adminClient();
  const { data: subs, error } = await sb.from("push_subscriptions").select("user_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const userIds = [...new Set((subs ?? []).map((s) => s.user_id as string))];

  const report: { user: string; sent: number; digests: string[] }[] = [];
  for (const userId of userIds) {
    try {
      const [{ data: st }, { data: log }, data] = await Promise.all([
        sb.from("notification_settings").select("*").eq("user_id", userId).maybeSingle(),
        sb.from("notification_log").select("key").eq("user_id", userId),
        loadUserData(sb, userId),
      ]);
      const settings: Settings = { ...DEFAULT_SETTINGS, ...(st ?? {}) };
      const sent = new Set((log ?? []).map((r) => r.key as string));
      const digests = buildDigests(data, settings, sent);
      let delivered = 0;
      for (const d of digests) {
        const n = await sendToUser(sb, userId, d.payload);
        if (n > 0) {
          delivered++;
          await sb.from("notification_log").upsert(d.keys.map((key) => ({ user_id: userId, key })));
        }
      }
      report.push({ user: userId.slice(0, 8), sent: delivered, digests: digests.map((d) => d.payload.title) });
    } catch (e) {
      report.push({ user: userId.slice(0, 8), sent: 0, digests: [`error: ${(e as Error).message}`] });
    }
  }
  return NextResponse.json({ ok: true, users: userIds.length, report });
}
