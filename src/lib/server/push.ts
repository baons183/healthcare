/**
 * Gửi thông báo đẩy (Web Push) & tính nội dung nhắc lịch – chỉ chạy trên server.
 */
import * as webpush from "web-push";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { buildSchedule, isSoon } from "../vaccines";
import { dewormStatus } from "../deworming";
import { addMonths, daysBetween, formatDate, today } from "../date";
import { normalizeMeasurement, type Deworming, type Measurement, type Member, type Vaccination } from "../types";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return;
  const clean = (v?: string) => (v ?? "").trim().replace(/^["']+|["']+$/g, "");
  const pub = clean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const priv = clean(process.env.VAPID_PRIVATE_KEY);
  if (!pub || !priv) throw new Error("Chưa cấu hình VAPID keys (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY).");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
  vapidReady = true;
}

/** Client quyền admin (service role) – CHỈ dùng trong cron/server */
export function adminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Chưa cấu hình SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Gửi tới mọi thiết bị của người dùng; xóa thiết bị đã hủy đăng ký. Trả về số thiết bị nhận thành công. */
export async function sendToUser(sb: SupabaseClient, userId: string, payload: PushPayload): Promise<number> {
  ensureVapid();
  const { data: subs } = await sb.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  let ok = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 24 },
      );
      ok++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await sb.from("push_subscriptions").delete().eq("id", s.id);
      else console.error("push failed", status, (e as Error).message);
    }
  }
  return ok;
}

export interface Settings {
  notify_measure: boolean;
  notify_vaccine: boolean;
  notify_overdue: boolean;
}
export const DEFAULT_SETTINGS: Settings = { notify_measure: true, notify_vaccine: true, notify_overdue: true };

interface UserData {
  members: Member[];
  measurements: Measurement[];
  vaccinations: Vaccination[];
  dewormings: Deworming[];
}

/** Dữ liệu mọi gia đình mà người dùng tham gia */
export async function loadUserData(sb: SupabaseClient, userId: string): Promise<UserData> {
  const { data: fu } = await sb.from("family_users").select("family_id").eq("user_id", userId);
  const fids = (fu ?? []).map((r) => r.family_id as string);
  if (!fids.length) return { members: [], measurements: [], vaccinations: [], dewormings: [] };
  const [m, ms, vs, dw] = await Promise.all([
    sb.from("members").select("*").in("family_id", fids),
    sb.from("measurements").select("*").in("family_id", fids),
    sb.from("vaccinations").select("*").in("family_id", fids),
    sb.from("dewormings").select("*").in("family_id", fids),
  ]);
  return {
    members: (m.data ?? []) as Member[],
    measurements: ((ms.data ?? []) as Record<string, unknown>[]).map(normalizeMeasurement),
    vaccinations: (vs.data ?? []) as Vaccination[],
    dewormings: dw.error ? [] : ((dw.data ?? []) as Deworming[]),
  };
}

export interface Digest {
  key: string; // khóa chống gửi trùng (mỗi thông báo có thể gồm nhiều khóa)
  keys: string[];
  payload: PushPayload;
}

function shortList(items: string[], max = 4) {
  return items.length <= max ? items.join("\n") : items.slice(0, max).join("\n") + `\n… và ${items.length - max} mục khác`;
}

/**
 * Tính các thông báo cần gửi hôm nay cho 1 người dùng.
 * `sent`: các khóa đã gửi trước đó (bỏ qua để không gửi lặp).
 */
export function buildDigests(data: UserData, settings: Settings, sent: Set<string>): Digest[] {
  const now = today();
  const month = now.slice(0, 7);
  const out: Digest[] = [];
  const by = <T extends { member_id: string }>(rows: T[], id: string) => rows.filter((r) => r.member_id === id);

  // 1) Nhắc cân đo hàng tháng
  if (settings.notify_measure) {
    const keys: string[] = [];
    const names: string[] = [];
    for (const m of data.members) {
      const ms = by(data.measurements, m.id).sort((a, b) => b.measured_on.localeCompare(a.measured_on));
      const last = ms[0];
      const due = !last || addMonths(last.measured_on, 1) <= now;
      const key = `measure:${m.id}:${month}`;
      if (due && !sent.has(key)) {
        keys.push(key);
        names.push(last ? `${m.full_name} (lần cuối ${formatDate(last.measured_on)})` : `${m.full_name} (chưa có số đo)`);
      }
    }
    if (keys.length) {
      out.push({
        key: keys[0],
        keys,
        payload: {
          title: "📏 Đến lịch cân đo",
          body: `Đo chiều cao, cân nặng tháng này cho:\n${shortList(names)}`,
          url: data.members.length === 1 ? `/members/${data.members[0].id}?tab=growth` : "/",
          tag: `measure-${month}`,
        },
      });
    }
  }

  // 2) Mũi tiêm & xổ giun sắp tới trong 15 ngày (gửi 1 lần khi vào khoảng 15 ngày + nhắc lại 1 ngày trước)
  if (settings.notify_vaccine) {
    const keys: string[] = [];
    const lines: string[] = [];
    for (const m of data.members) {
      for (const d of buildSchedule(m.birth_date, by(data.vaccinations, m.id))) {
        if (!isSoon(d)) continue;
        const left = daysBetween(now, d.dueDate);
        const base = `vax:${m.id}:${d.vaccine.code}:${d.doseIndex}:${d.dueDate}`;
        const key = left <= 1 ? `${base}:tomorrow` : `${base}:soon`;
        if (sent.has(key)) continue;
        keys.push(key);
        lines.push(`${m.full_name}: ${d.vaccine.name} (${d.label}) – ${left <= 1 ? "NGÀY MAI" : formatDate(d.dueDate)}`);
      }
      const dw = dewormStatus(m.birth_date, by(data.dewormings, m.id));
      if (dw.soon) {
        const left = daysBetween(now, dw.nextDate);
        const key = `deworm:${m.id}:${dw.nextDate}:${left <= 1 ? "tomorrow" : "soon"}`;
        if (!sent.has(key)) {
          keys.push(key);
          lines.push(`${m.full_name}: Xổ giun – ${left <= 1 ? "NGÀY MAI" : formatDate(dw.nextDate)}`);
        }
      }
    }
    if (keys.length) {
      out.push({
        key: keys[0],
        keys,
        payload: { title: "💉 Lịch tiêm sắp tới", body: shortList(lines), url: "/vaccines", tag: `vax-${now}` },
      });
    }
  }

  // 3) Ngày 1 hàng tháng: tổng hợp mũi quá hạn (cho phép bù đến ngày 3 nếu lỡ lịch chạy)
  if (settings.notify_overdue && Number(now.slice(8, 10)) <= 3) {
    const key = `overdue:${month}`;
    if (!sent.has(key)) {
      const lines: string[] = [];
      let total = 0;
      for (const m of data.members) {
        const n = buildSchedule(m.birth_date, by(data.vaccinations, m.id)).filter((d) => d.status === "overdue").length;
        if (n) {
          total += n;
          lines.push(`${m.full_name}: ${n} mũi`);
        }
      }
      if (total) {
        out.push({
          key,
          keys: [key],
          payload: {
            title: `⚠️ ${total} mũi tiêm quá hạn`,
            body: `Tổng hợp tháng ${Number(month.slice(5))}/${month.slice(0, 4)}:\n${shortList(lines)}\nNếu đã tiêm, hãy ghi lại để cập nhật.`,
            url: "/vaccines",
            tag: `overdue-${month}`,
          },
        });
      }
    }
  }

  return out;
}
