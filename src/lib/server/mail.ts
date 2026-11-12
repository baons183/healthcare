/**
 * Gửi email nhắc lịch qua SMTP (VD: Gmail + "Mật khẩu ứng dụng" – miễn phí ~500 thư/ngày).
 * Biến môi trường: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM (tùy chọn), APP_URL (tùy chọn)
 */
import nodemailer, { type Transporter } from "nodemailer";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PushPayload } from "./push";

let transporter: Transporter | null = null;

export function mailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransport(): Transporter {
  if (!mailConfigured()) throw new Error("Chưa cấu hình gửi email (SMTP_HOST, SMTP_USER, SMTP_PASS).");
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Email đăng nhập của người dùng (bỏ qua tài khoản chỉ có số điện thoại) */
export async function userEmail(sb: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await sb.auth.admin.getUserById(userId);
  return data.user?.email || null;
}

/** Gộp các thông báo trong ngày thành 1 email */
export async function sendDigestEmail(to: string, items: PushPayload[], baseUrl: string): Promise<void> {
  if (!items.length) return;
  const subject = items.length === 1 ? items[0].title : `${items[0].title} (+${items.length - 1} nhắc lịch khác)`;
  const blocks = items
    .map(
      (p) => `<div style="margin:0 0 16px;padding:14px 16px;border:1px solid #e3e2dd;border-radius:12px">
  <div style="font-weight:700;font-size:16px;margin-bottom:6px">${esc(p.title)}</div>
  <div style="white-space:pre-line;color:#333;line-height:1.5">${esc(p.body)}</div>
  ${p.url ? `<a href="${baseUrl}${p.url}" style="display:inline-block;margin-top:10px;color:#2a78d6;font-weight:600">Mở ứng dụng →</a>` : ""}
</div>`,
    )
    .join("");
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:auto;color:#17171a">
  <p style="font-size:13px;color:#8a8990">Sổ Sức Khỏe Gia Đình</p>${blocks}
  <p style="font-size:12px;color:#8a8990">Tắt email nhắc lịch trong Cài đặt → Thông báo.</p></div>`;
  const text = items.map((p) => `${p.title}\n${p.body}`).join("\n\n");
  await getTransport().sendMail({
    from: process.env.MAIL_FROM || `Sổ Sức Khỏe <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html,
  });
}

export function appUrl(req?: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (req) return new URL(req.url).origin;
  return process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "";
}
