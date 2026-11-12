/**
 * Lịch xổ giun (tẩy giun) định kỳ – tham khảo khuyến cáo WHO & Bộ Y tế:
 * - Bắt đầu từ 12 tháng tuổi
 * - Trẻ em (< 16 tuổi): 6 tháng/lần; người lớn: 1 năm/lần
 * - Phụ nữ mang thai: không dùng trong 3 tháng đầu, hỏi ý kiến bác sĩ
 */
import { addMonths, ageInMonths, daysBetween, today } from "./date";
import type { Deworming } from "./types";
import { SOON_DAYS } from "./vaccines";

export const DEWORM_START_MONTHS = 12;
const GRACE_DAYS = 30;

export const DEWORM_MEDICINES = [
  "Albendazole 400mg (Zentel)",
  "Albendazole 200mg",
  "Mebendazole 500mg (Fugacar)",
  "Mebendazole 100mg",
  "Pyrantel pamoate",
];

export function dewormIntervalMonths(ageMonths: number): number {
  return ageMonths < 192 ? 6 : 12;
}

export function suggestedDose(ageMonths: number): string {
  if (ageMonths < DEWORM_START_MONTHS) return "Chưa xổ giun định kỳ cho trẻ dưới 12 tháng.";
  if (ageMonths < 24) return "12–23 tháng: Albendazole 200mg (½ viên 400mg) hoặc Mebendazole 500mg, liều duy nhất.";
  return "Từ 2 tuổi: Albendazole 400mg hoặc Mebendazole 500mg, 1 liều duy nhất. Phụ nữ có thai 3 tháng đầu không dùng.";
}

export type DewormState = "notyet" | "upcoming" | "due" | "overdue" | "nodata";

export interface DewormStatus {
  state: DewormState;
  nextDate: string;
  intervalMonths: number;
  last?: Deworming;
  soon: boolean;
}

export function dewormStatus(birthDate: string, records: Deworming[]): DewormStatus {
  const age = ageInMonths(birthDate);
  const intervalMonths = dewormIntervalMonths(age);
  const last = [...records].sort((a, b) => b.given_on.localeCompare(a.given_on))[0];
  const now = today();

  if (age < DEWORM_START_MONTHS) {
    const next = addMonths(birthDate, DEWORM_START_MONTHS);
    return { state: "notyet", nextDate: next, intervalMonths, soon: daysBetween(now, next) <= SOON_DAYS };
  }
  if (!last) return { state: "nodata", nextDate: now, intervalMonths, soon: false };

  const next = addMonths(last.given_on, intervalMonths);
  const diff = daysBetween(now, next);
  const state: DewormState = diff > 0 ? "upcoming" : diff >= -GRACE_DAYS ? "due" : "overdue";
  return { state, nextDate: next, intervalMonths, last, soon: state === "upcoming" && diff <= SOON_DAYS };
}

export const DEWORM_META: Record<DewormState, { label: string; cls: string }> = {
  notyet: { label: "Chưa đến tuổi", cls: "badge-muted" },
  upcoming: { label: "Chưa tới", cls: "badge-info" },
  due: { label: "Đến hạn", cls: "badge-warning" },
  overdue: { label: "Quá hạn", cls: "badge-danger" },
  nodata: { label: "Chưa có dữ liệu", cls: "badge-warning" },
};
