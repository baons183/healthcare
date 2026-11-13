/**
 * Nhắc lịch hằng ngày (cân đo, tiêm, xổ giun, khám, mũi quá hạn) cho 1 người dùng – push + email.
 * Được gọi từ /api/cron/frequent đúng giờ mỗi người chọn (mặc định 06:30), hoặc /api/cron/daily (chạy tay).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDigests, DEFAULT_SETTINGS, loadUserData, sendToUser, type Settings } from "./push";
import { mailConfigured, sendDigestEmail, userEmail } from "./mail";

export const DEFAULT_DAILY_TIME = "06:30";

export interface DailyReport {
  user: string;
  push: number;
  email: boolean;
  digests: string[];
}

export async function runDailyFor(sb: SupabaseClient, userId: string, baseUrl: string): Promise<DailyReport> {
  const [{ data: st }, { data: log }, { count: subs }, data] = await Promise.all([
    sb.from("notification_settings").select("*").eq("user_id", userId).maybeSingle(),
    sb.from("notification_log").select("key").eq("user_id", userId),
    sb.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", userId),
    loadUserData(sb, userId),
  ]);
  const settings: Settings = { ...DEFAULT_SETTINGS, ...(st ?? {}) };
  const sent = new Set((log ?? []).map((r) => r.key as string));
  const digests = buildDigests(data, settings, sent);
  const report: DailyReport = { user: userId.slice(0, 8), push: 0, email: false, digests: digests.map((d) => d.payload.title) };
  if (!digests.length) return report;

  const delivered = new Set<number>();
  if (subs) {
    for (const [i, d] of digests.entries()) {
      if ((await sendToUser(sb, userId, d.payload)) > 0) {
        report.push++;
        delivered.add(i);
      }
    }
  }
  if (settings.notify_email && mailConfigured()) {
    const to = await userEmail(sb, userId);
    if (to) {
      try {
        await sendDigestEmail(to, digests.map((d) => d.payload), baseUrl);
        report.email = true;
        digests.forEach((_, i) => delivered.add(i));
      } catch (e) {
        console.error("email failed", (e as Error).message);
      }
    }
  }
  const keys = [...delivered].flatMap((i) => digests[i].keys);
  if (keys.length) await sb.from("notification_log").upsert(keys.map((key) => ({ user_id: userId, key })));
  return report;
}

/** Người nhận nhắc hằng ngày: có thiết bị nhận thông báo hoặc bật email */
export async function dailyRecipients(sb: SupabaseClient): Promise<{ userId: string; time: string }[]> {
  const [{ data: subs }, { data: rows }] = await Promise.all([
    sb.from("push_subscriptions").select("user_id"),
    sb.from("notification_settings").select("*"),
  ]);
  const settingOf = new Map((rows ?? []).map((r) => [r.user_id as string, r as Record<string, unknown>]));
  const ids = new Set((subs ?? []).map((s) => s.user_id as string));
  if (mailConfigured()) for (const r of rows ?? []) if (r.notify_email) ids.add(r.user_id as string);
  return [...ids].map((userId) => {
    const t = settingOf.get(userId)?.daily_time;
    return { userId, time: typeof t === "string" && /^\d{2}:\d{2}$/.test(t) ? t : DEFAULT_DAILY_TIME };
  });
}
