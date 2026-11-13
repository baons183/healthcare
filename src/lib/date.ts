/** Tiện ích ngày tháng – mọi ngày lưu dạng "yyyy-mm-dd" (không múi giờ). */

export function parseDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Múi giờ của app – server (Vercel chạy UTC) và trình duyệt đều tính "hôm nay" theo giờ Việt Nam */
export const APP_TIMEZONE = "Asia/Ho_Chi_Minh";
const DAY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });

export function today(): string {
  return DAY_FMT.format(new Date()); // "yyyy-mm-dd"
}

const DAY = 86400000;
export const DAYS_PER_MONTH = 30.4375;

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY);
}

/** Tuổi tính theo tháng (số thực) tại ngày `at` */
export function ageInMonths(birth: string, at: string = today()): number {
  return daysBetween(birth, at) / DAYS_PER_MONTH;
}

export function addMonths(date: string, months: number): string {
  const d = parseDate(date);
  const whole = Math.floor(months);
  const res = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + whole, d.getUTCDate()));
  const extraDays = Math.round((months - whole) * DAYS_PER_MONTH);
  return toISODate(new Date(res.getTime() + extraDays * DAY));
}

export function formatDate(s: string | null | undefined): string {
  if (!s) return "";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** "2 tuổi 3 tháng", "5 tháng", "12 ngày" */
export function formatAge(birth: string, at: string = today()): string {
  const days = daysBetween(birth, at);
  if (days < 0) return "chưa sinh";
  if (days < 31) return `${days} ngày`;
  const b = parseDate(birth);
  const a = parseDate(at);
  let months = (a.getUTCFullYear() - b.getUTCFullYear()) * 12 + (a.getUTCMonth() - b.getUTCMonth());
  if (a.getUTCDate() < b.getUTCDate()) months -= 1;
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} tháng`;
  if (y >= 6 || m === 0) return `${y} tuổi`;
  return `${y} tuổi ${m} tháng`;
}

/** Nhãn tuổi cho mốc tiêm/khuyến cáo, VD 0 -> "Sơ sinh", 18 -> "18 tháng", 48 -> "4 tuổi" */
export function formatAgeMonths(months: number): string {
  if (months <= 0) return "Sơ sinh";
  if (months < 24 || months % 12 !== 0) {
    if (months < 1) return `${Math.round(months * DAYS_PER_MONTH)} ngày`;
    return `${Math.floor(months)} tháng`;
  }
  return `${months / 12} tuổi`;
}

export function addDays(date: string, days: number): string {
  return toISODate(new Date(parseDate(date).getTime() + days * DAY));
}

/** Ngày & phút hiện tại theo giờ Việt Nam (UTC+7) – dùng trên server (Vercel chạy UTC) */
export function vnNow(at: Date = new Date()): { date: string; minutes: number; month: string } {
  const d = new Date(at.getTime() + 7 * 3600_000);
  const date = d.toISOString().slice(0, 10);
  return { date, minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), month: date.slice(0, 7) };
}

/** "08:30" -> 510 */
export function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** ISO timestamp -> "dd/mm HH:MM" theo giờ máy */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Giá trị cho <input type="datetime-local"> từ ISO (giờ máy) */
export function toLocalInput(iso: string = new Date().toISOString()): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
