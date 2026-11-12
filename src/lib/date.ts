/** Tiện ích ngày tháng – mọi ngày lưu dạng "yyyy-mm-dd" (không múi giờ). */

export function parseDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function today(): string {
  const d = new Date();
  return toISODate(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
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
