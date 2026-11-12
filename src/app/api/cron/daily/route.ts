/**
 * Chạy mỗi ngày bởi Vercel Cron (xem vercel.json) – gửi thông báo nhắc lịch (push + email).
 * Bảo vệ bằng CRON_SECRET (Vercel tự gửi header Authorization: Bearer <CRON_SECRET>).
 */
import { NextResponse } from "next/server";
import { adminClient, buildDigests, DEFAULT_SETTINGS, loadUserData, sendToUser, type Settings } from "@/lib/server/push";
import { appUrl, mailConfigured, sendDigestEmail, userEmail } from "@/lib/server/mail";

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
  const pushUsers = new Set((subs ?? []).map((s) => s.user_id as string));
  // Người bật email (cột có từ migration 0005 – lỗi thì bỏ qua)
  const { data: emailRows } = await sb.from("notification_settings").select("user_id").eq("notify_email", true);
  const emailUsers = new Set(mailConfigured() ? (emailRows ?? []).map((r) => r.user_id as string) : []);
  const userIds = [...new Set([...pushUsers, ...emailUsers])];
  const base = appUrl(req);

  const report: { user: string; push: number; email: boolean; digests: string[] }[] = [];
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
      if (!digests.length) {
        report.push({ user: userId.slice(0, 8), push: 0, email: false, digests: [] });
        continue;
      }

      let pushed = 0;
      const delivered = new Set<number>();
      if (pushUsers.has(userId)) {
        for (const [i, d] of digests.entries()) {
          if ((await sendToUser(sb, userId, d.payload)) > 0) {
            pushed++;
            delivered.add(i);
          }
        }
      }
      let emailed = false;
      if (emailUsers.has(userId) && settings.notify_email) {
        const to = await userEmail(sb, userId);
        if (to) {
          try {
            await sendDigestEmail(to, digests.map((d) => d.payload), base);
            emailed = true;
            digests.forEach((_, i) => delivered.add(i));
          } catch (e) {
            console.error("email failed", (e as Error).message);
          }
        }
      }
      const keys = [...delivered].flatMap((i) => digests[i].keys);
      if (keys.length) await sb.from("notification_log").upsert(keys.map((key) => ({ user_id: userId, key })));
      report.push({ user: userId.slice(0, 8), push: pushed, email: emailed, digests: digests.map((d) => d.payload.title) });
    } catch (e) {
      report.push({ user: userId.slice(0, 8), push: 0, email: false, digests: [`error: ${(e as Error).message}`] });
    }
  }
  return NextResponse.json({ ok: true, users: userIds.length, report });
}
