/**
 * Gửi ngay nhắc lịch hằng ngày cho mọi người (chạy tay khi cần, VD kiểm tra).
 * Lịch tự động: /api/cron/frequent gọi runDailyFor đúng giờ mỗi người chọn trong Cài đặt.
 * Bảo vệ bằng CRON_SECRET (header Authorization: Bearer <CRON_SECRET>).
 */
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/server/push";
import { appUrl } from "@/lib/server/mail";
import { dailyRecipients, runDailyFor, type DailyReport } from "@/lib/server/daily";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sb = adminClient();
  const report: DailyReport[] = [];
  for (const { userId } of await dailyRecipients(sb)) {
    try {
      report.push(await runDailyFor(sb, userId, appUrl(req)));
    } catch (e) {
      report.push({ user: userId.slice(0, 8), push: 0, email: false, digests: [`error: ${(e as Error).message}`] });
    }
  }
  return NextResponse.json({ ok: true, users: report.length, report });
}
