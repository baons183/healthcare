/** Chữ ký ngắn cho nút trên thông báo (Đã uống / Nhắc lại) – bấm được cả khi phiên đăng nhập đã hết hạn */
import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const s = process.env.CRON_SECRET;
  if (!s) throw new Error("Chưa cấu hình CRON_SECRET.");
  return s;
}

export function signKey(key: string): string {
  return createHmac("sha256", secret()).update(`reminder:${key}`).digest("base64url").slice(0, 32);
}

export function verifyKey(key: string, sig: string): boolean {
  const a = Buffer.from(signKey(key));
  const b = Buffer.from(sig || "");
  return a.length === b.length && timingSafeEqual(a, b);
}
