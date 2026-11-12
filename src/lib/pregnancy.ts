/**
 * Theo dõi thai kỳ – lịch khám thai tham khảo (Bộ Y tế: tối thiểu 4 lần; thực hành phổ biến tại VN),
 * tiêm uốn ván (TCMR) và tăng cân thai kỳ theo BMI trước mang thai (IOM 2009).
 * Chỉ mang tính tham khảo – theo chỉ định của bác sĩ sản khoa.
 */
import { addDays, daysBetween, today } from "./date";
import type { Checkup, Pregnancy, Vaccination } from "./types";
import { SOON_DAYS } from "./vaccines";

export const PREGNANCY_DAYS = 280;

export interface PrenatalVisit {
  code: string;
  from: number; // tuần
  to: number;
  title: string;
  detail: string;
}

export const PRENATAL_VISITS: PrenatalVisit[] = [
  { code: "first", from: 6, to: 10, title: "Khám thai lần đầu", detail: "Siêu âm xác định thai trong tử cung, tim thai, tính ngày dự sinh; xét nghiệm máu, nước tiểu cơ bản." },
  { code: "nt", from: 11, to: 14, title: "Đo độ mờ da gáy + sàng lọc", detail: "Sàng lọc dị tật, hội chứng Down (Double test / NIPT). Thời điểm 11 tuần – 13 tuần 6 ngày." },
  { code: "w16", from: 16, to: 18, title: "Khám định kỳ tuần 16–18", detail: "Triple test nếu chưa sàng lọc quý 1. Bổ sung sắt, canxi theo chỉ định." },
  { code: "morph", from: 20, to: 24, title: "Siêu âm hình thái thai nhi", detail: "Siêu âm kiểm tra hình thái, phát hiện dị tật." },
  { code: "gdm", from: 24, to: 28, title: "Nghiệm pháp đường huyết", detail: "Tầm soát tiểu đường thai kỳ (nghiệm pháp dung nạp glucose 75g)." },
  { code: "w30", from: 28, to: 32, title: "Khám định kỳ tuần 28–32", detail: "Siêu âm đánh giá tăng trưởng thai, ngôi thai, nước ối." },
  { code: "w34", from: 32, to: 36, title: "Khám định kỳ tuần 32–36", detail: "Siêu âm Doppler, theo dõi huyết áp, phù, protein niệu." },
  { code: "w37", from: 36, to: 40, title: "Khám hằng tuần đến khi sinh", detail: "Theo dõi tim thai (monitor), cơn gò; chuẩn bị đồ đi sinh." },
];

export const lmpFromDue = (due: string) => addDays(due, -PREGNANCY_DAYS);
export const dueFromLmp = (lmp: string) => addDays(lmp, PREGNANCY_DAYS);

export function gestationalAge(lmp: string, at: string = today()): { weeks: number; days: number; total: number } {
  const total = daysBetween(lmp, at);
  return { weeks: Math.floor(total / 7), days: total % 7, total };
}

/** Thai kỳ đang theo dõi: chưa kết thúc và chưa quá ngày dự sinh 3 tuần */
export function activePregnancy(list: Pregnancy[]): Pregnancy | undefined {
  const now = today();
  return list.find((p) => !p.ended_on && daysBetween(p.due_date, now) <= 21 && daysBetween(p.lmp, now) >= 0);
}

export type VisitStatus = "done" | "upcoming" | "current" | "missed";

export interface ScheduledVisit {
  visit: PrenatalVisit;
  start: string;
  end: string;
  status: VisitStatus;
  record?: Checkup;
  soon: boolean;
}

export function visitSchedule(p: Pregnancy, checkups: Checkup[]): ScheduledVisit[] {
  const now = today();
  return PRENATAL_VISITS.map((v) => {
    const start = addDays(p.lmp, v.from * 7);
    const end = addDays(p.lmp, v.to * 7 - 1);
    const record = checkups.find((c) => c.kind === "prenatal" && c.pregnancy_id === p.id && c.visit_code === v.code);
    const status: VisitStatus = record ? "done" : now < start ? "upcoming" : now <= end ? "current" : "missed";
    return { visit: v, start, end, status, record, soon: status === "upcoming" && daysBetween(now, start) <= SOON_DAYS };
  });
}

export const VISIT_META: Record<VisitStatus, { label: string; cls: string }> = {
  done: { label: "Đã khám", cls: "badge-good" },
  current: { label: "Đến lịch", cls: "badge-warning" },
  upcoming: { label: "Sắp tới", cls: "badge-muted" },
  missed: { label: "Đã qua", cls: "badge-muted" },
};

/** Tăng cân khuyến nghị cả thai kỳ (đơn thai) theo BMI trước mang thai – IOM 2009 */
export function weightGainTarget(preBmi: number): { total: [number, number]; weekly: [number, number]; group: string } {
  if (preBmi < 18.5) return { total: [12.5, 18], weekly: [0.44, 0.58], group: "Thiếu cân" };
  if (preBmi < 25) return { total: [11.5, 16], weekly: [0.35, 0.5], group: "Bình thường" };
  if (preBmi < 30) return { total: [7, 11.5], weekly: [0.23, 0.33], group: "Thừa cân" };
  return { total: [5, 9], weekly: [0.17, 0.27], group: "Béo phì" };
}

/** Khoảng tăng cân hợp lý tại tuần thai `week` (quý 1 tăng 0,5–2 kg) */
export function expectedGainAt(week: number, preBmi: number): [number, number] {
  const { weekly } = weightGainTarget(preBmi);
  if (week <= 13) return [0, Math.round((2 * week) / 13 * 10) / 10];
  return [Math.round((0.5 + (week - 13) * weekly[0]) * 10) / 10, Math.round((2 + (week - 13) * weekly[1]) * 10) / 10];
}

export const TETANUS_CODE = "vat";
export const isTetanus = (v: Pick<Vaccination, "vaccine_code" | "vaccine_name">) =>
  v.vaccine_code === TETANUS_CODE || /uốn ván|\bvat\b|tetanus|\btd\b/i.test(v.vaccine_name);

/** Mũi uốn ván trong thai kỳ này (từ ngày đầu kỳ kinh cuối) */
export function tetanusInPregnancy(p: Pregnancy, vaccinations: Vaccination[]): Vaccination[] {
  return vaccinations.filter((v) => isTetanus(v) && v.administered_on >= p.lmp).sort((a, b) => a.administered_on.localeCompare(b.administered_on));
}

export const TETANUS_ADVICE =
  "Lần mang thai đầu (hoặc chưa rõ tiền sử): tiêm 2 mũi uốn ván – mũi 2 cách mũi 1 ít nhất 1 tháng và trước ngày sinh ít nhất 1 tháng. Các lần mang thai sau: 1 mũi nhắc (đủ 5 mũi thì không cần tiêm thêm).";
