/**
 * Khám định kỳ: răng, mắt, tổng quát (tham khảo khuyến cáo AAP/AAPD, AAO, Bộ Y tế).
 * - Răng: từ 12 tháng (khi mọc răng đầu), 6 tháng/lần
 * - Mắt: sàng lọc thị lực từ 3 tuổi, hằng năm đến 18 tuổi; người lớn 2 năm/lần, từ 40 tuổi hằng năm
 * - Tổng quát: người lớn (≥ 18 tuổi) 1 năm/lần
 */
import { addMonths, ageInMonths, daysBetween, today } from "./date";
import type { Checkup, CheckupKind } from "./types";
import { SOON_DAYS } from "./vaccines";

export const CHECKUP_META: Record<CheckupKind, { label: string; icon: string; hint: string }> = {
  dental: { label: "Khám răng", icon: "🦷", hint: "Lấy cao răng, kiểm tra sâu răng, bôi fluor (trẻ em)" },
  eye: { label: "Khám mắt", icon: "👁️", hint: "Đo thị lực, phát hiện cận/viễn/loạn thị; từ 40 tuổi đo nhãn áp" },
  general: { label: "Khám tổng quát", icon: "🩺", hint: "Xét nghiệm máu, nước tiểu, huyết áp, đường huyết, mỡ máu…" },
  prenatal: { label: "Khám thai", icon: "🤰", hint: "" },
};

export const PERIODIC_KINDS: Exclude<CheckupKind, "prenatal">[] = ["dental", "eye", "general"];

const GRACE_DAYS = 30;

export function checkupRule(kind: CheckupKind, ageMonths: number): { start: number; interval: number } | null {
  if (kind === "dental") return { start: 12, interval: 6 };
  if (kind === "eye") return { start: 36, interval: ageMonths < 216 || ageMonths >= 480 ? 12 : 24 };
  if (kind === "general") return { start: 216, interval: 12 };
  return null;
}

export type PeriodicState = "notyet" | "nodata" | "upcoming" | "due" | "overdue";

export interface PeriodicStatus {
  kind: CheckupKind;
  state: PeriodicState;
  nextDate: string;
  intervalMonths: number;
  last?: Checkup;
  soon: boolean;
}

export const PERIODIC_META: Record<PeriodicState, { label: string; cls: string }> = {
  notyet: { label: "Chưa đến tuổi", cls: "badge-muted" },
  nodata: { label: "Chưa có dữ liệu", cls: "badge-muted" },
  upcoming: { label: "Đúng lịch", cls: "badge-good" },
  due: { label: "Đến hạn", cls: "badge-warning" },
  overdue: { label: "Quá hạn", cls: "badge-danger" },
};

export function intervalLabel(months: number): string {
  return months >= 12 ? `${months / 12} năm/lần` : `${months} tháng/lần`;
}

export function checkupStatus(kind: CheckupKind, birthDate: string, records: Checkup[]): PeriodicStatus | null {
  const age = ageInMonths(birthDate);
  const rule = checkupRule(kind, age);
  if (!rule) return null;
  const now = today();
  const last = records.filter((r) => r.kind === kind).sort((a, b) => b.done_on.localeCompare(a.done_on))[0];
  if (age < rule.start) {
    const next = addMonths(birthDate, rule.start);
    return { kind, state: "notyet", nextDate: next, intervalMonths: rule.interval, soon: daysBetween(now, next) <= SOON_DAYS, last };
  }
  if (!last) return { kind, state: "nodata", nextDate: now, intervalMonths: rule.interval, soon: false };
  const next = addMonths(last.done_on, rule.interval);
  const diff = daysBetween(now, next);
  const state: PeriodicState = diff > 0 ? "upcoming" : diff >= -GRACE_DAYS ? "due" : "overdue";
  return { kind, state, nextDate: next, intervalMonths: rule.interval, last, soon: state === "upcoming" && diff <= SOON_DAYS };
}

/** Các loại khám áp dụng cho độ tuổi hiện tại (đã đến tuổi hoặc sắp đến trong 15 ngày) */
export function applicableKinds(birthDate: string): Exclude<CheckupKind, "prenatal">[] {
  const age = ageInMonths(birthDate);
  return PERIODIC_KINDS.filter((k) => {
    const r = checkupRule(k, age);
    return r && age >= r.start - 0.5;
  });
}
