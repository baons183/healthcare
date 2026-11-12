/**
 * Tính toán tăng trưởng theo chuẩn WHO (phương pháp LMS).
 * - 0–60 tháng: WHO Child Growth Standards 2006
 * - 61–228 tháng: WHO Growth Reference 2007
 * Người lớn (>= 19 tuổi): BMI theo ngưỡng cho người châu Á (WHO WPRO 2000).
 */
import whoData from "./who-data.json";
import type { Gender, Measurement } from "../types";
import { ageInMonths } from "../date";

export type Indicator = "weight" | "height" | "bmi" | "head";
type LMS = [number, number, number];
type Table = Record<Indicator, LMS[]>;

const DATA = whoData as unknown as { male: Table; female: Table };

export const INDICATORS: Record<Indicator, { label: string; unit: string; short: string }> = {
  weight: { label: "Cân nặng theo tuổi", unit: "kg", short: "Cân nặng" },
  height: { label: "Chiều cao theo tuổi", unit: "cm", short: "Chiều cao" },
  bmi: { label: "BMI theo tuổi", unit: "kg/m²", short: "BMI" },
  head: { label: "Vòng đầu theo tuổi", unit: "cm", short: "Vòng đầu" },
};

export const ADULT_MONTHS = 228; // 19 tuổi

/** Tuổi tối đa (tháng) có dữ liệu chuẩn cho chỉ số */
export function maxMonths(ind: Indicator): number {
  return DATA.male[ind].length - 1;
}

export function lmsAt(gender: Gender, ind: Indicator, months: number): LMS | null {
  const t = DATA[gender][ind];
  if (months < 0 || months > t.length - 1) return null;
  const i = Math.floor(months);
  const f = months - i;
  if (f === 0 || i + 1 >= t.length) return t[i];
  const a = t[i];
  const b = t[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

function rawValue([L, M, S]: LMS, z: number): number {
  return L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L);
}

/** Giá trị tương ứng z-score tại tuổi (dùng để vẽ đường chuẩn) */
export function valueAtZ(gender: Gender, ind: Indicator, months: number, z: number): number | null {
  const lms = lmsAt(gender, ind, months);
  if (!lms) return null;
  // WHO: với cân nặng & BMI, ngoài ±3SD dùng khoảng cách tuyến tính
  if ((ind === "weight" || ind === "bmi") && Math.abs(z) > 3) {
    const s = Math.sign(z);
    const sd3 = rawValue(lms, 3 * s);
    const sd2 = rawValue(lms, 2 * s);
    return sd3 + (Math.abs(z) - 3) * (sd3 - sd2);
  }
  return rawValue(lms, z);
}

export function zScore(gender: Gender, ind: Indicator, months: number, x: number): number | null {
  const lms = lmsAt(gender, ind, months);
  if (!lms || !(x > 0)) return null;
  const [L, M, S] = lms;
  let z = L === 0 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S);
  if ((ind === "weight" || ind === "bmi") && Math.abs(z) > 3) {
    const s = Math.sign(z);
    const sd3 = rawValue(lms, 3 * s);
    const sd23 = Math.abs(sd3 - rawValue(lms, 2 * s));
    z = s * 3 + (x - sd3) / sd23;
  }
  return Math.round(z * 100) / 100;
}

/** Phân phối chuẩn tích lũy -> percentile */
export function percentile(z: number): number {
  // Abramowitz–Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(z / Math.SQRT2));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  const p = z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  return Math.round(p * 1000) / 10;
}

export function bmi(weightKg: number, heightCm: number): number {
  const h = heightCm / 100;
  return Math.round((weightKg / (h * h)) * 10) / 10;
}

export type Level = "good" | "info" | "warning" | "danger";

export interface Assessment {
  indicator: Indicator;
  value: number;
  z: number | null;
  pct: number | null;
  level: Level;
  label: string;
  advice?: string;
}

/** Phân loại theo WHO cho trẻ em */
export function classify(ind: Indicator, z: number, months: number): { level: Level; label: string; advice?: string } {
  if (ind === "height") {
    if (z < -3) return { level: "danger", label: "Thấp còi nặng", advice: "Nên đưa trẻ đi khám dinh dưỡng / nội tiết sớm." };
    if (z < -2) return { level: "warning", label: "Thấp còi", advice: "Tăng cường dinh dưỡng (đạm, canxi, vitamin D), ngủ đủ, vận động; theo dõi sát và tham khảo bác sĩ." };
    if (z > 3) return { level: "info", label: "Rất cao so với tuổi", advice: "Thường bình thường nếu bố mẹ cao; nếu tăng quá nhanh nên hỏi bác sĩ." };
    return { level: "good", label: "Bình thường" };
  }
  if (ind === "weight") {
    if (z < -3) return { level: "danger", label: "Nhẹ cân nặng", advice: "Nên đưa trẻ đi khám dinh dưỡng sớm." };
    if (z < -2) return { level: "warning", label: "Nhẹ cân", advice: "Bổ sung bữa phụ, tăng năng lượng khẩu phần, kiểm tra bệnh lý tiêu hóa nếu kéo dài." };
    if (z > 2) return { level: "info", label: "Cân nặng cao", advice: "Đánh giá thêm qua chỉ số BMI theo tuổi." };
    return { level: "good", label: "Bình thường" };
  }
  if (ind === "head") {
    if (z < -2) return { level: "warning", label: "Vòng đầu nhỏ", advice: "Nên trao đổi với bác sĩ nhi khoa ở lần khám tới." };
    if (z > 2) return { level: "warning", label: "Vòng đầu lớn", advice: "Nên trao đổi với bác sĩ nhi khoa ở lần khám tới." };
    return { level: "good", label: "Bình thường" };
  }
  // BMI
  const under5 = months < 60;
  if (z < -3) return { level: "danger", label: under5 ? "Gầy còm nặng" : "Gầy nặng", advice: "Nên đưa trẻ đi khám dinh dưỡng sớm." };
  if (z < -2) return { level: "warning", label: under5 ? "Gầy còm" : "Gầy", advice: "Tăng năng lượng & đạm trong khẩu phần, theo dõi cân nặng hằng tháng." };
  if (under5) {
    if (z > 3) return { level: "danger", label: "Béo phì", advice: "Hạn chế đồ ngọt, nước ngọt; tăng vận động; tham khảo bác sĩ dinh dưỡng." };
    if (z > 2) return { level: "warning", label: "Thừa cân", advice: "Điều chỉnh khẩu phần, hạn chế đồ ngọt, tăng vận động." };
    if (z > 1) return { level: "info", label: "Nguy cơ thừa cân", advice: "Theo dõi chế độ ăn và vận động." };
  } else {
    if (z > 2) return { level: "danger", label: "Béo phì", advice: "Hạn chế đồ ngọt, đồ chiên; ≥ 60 phút vận động mỗi ngày; tham khảo bác sĩ dinh dưỡng." };
    if (z > 1) return { level: "warning", label: "Thừa cân", advice: "Giảm đồ ngọt, tăng rau xanh, vận động ≥ 60 phút/ngày." };
  }
  return { level: "good", label: "Bình thường" };
}

/** BMI người lớn – ngưỡng cho người châu Á */
export function classifyAdultBmi(v: number): { level: Level; label: string; advice?: string } {
  if (v < 16) return { level: "danger", label: "Gầy độ II–III", advice: "Nên đi khám để tìm nguyên nhân." };
  if (v < 18.5) return { level: "warning", label: "Thiếu cân", advice: "Tăng khẩu phần năng lượng, đạm; kiểm tra sức khỏe nếu sút cân không rõ lý do." };
  if (v < 23) return { level: "good", label: "Bình thường" };
  if (v < 25) return { level: "warning", label: "Thừa cân", advice: "Giảm tinh bột tinh chế & đồ ngọt; vận động ≥ 150 phút/tuần." };
  if (v < 30) return { level: "danger", label: "Béo phì độ I", advice: "Nên kiểm tra đường huyết, mỡ máu, huyết áp; giảm 5–10% cân nặng." };
  return { level: "danger", label: "Béo phì độ II", advice: "Nên gặp bác sĩ để có kế hoạch giảm cân và tầm soát bệnh chuyển hóa." };
}

/** Đánh giá 1 lần đo cho 1 người */
export function assessMeasurement(gender: Gender, birthDate: string, m: Measurement): Assessment[] {
  const months = ageInMonths(birthDate, m.measured_on);
  const out: Assessment[] = [];
  const add = (ind: Indicator, value: number | null) => {
    if (value == null) return;
    if (months >= ADULT_MONTHS) {
      if (ind === "bmi") {
        out.push({ indicator: ind, value, z: null, pct: null, ...classifyAdultBmi(value) });
      }
      return;
    }
    const z = zScore(gender, ind, months, value);
    if (z == null) return;
    out.push({ indicator: ind, value, z, pct: percentile(z), ...classify(ind, z, months) });
  };
  add("weight", m.weight_kg);
  add("height", m.height_cm);
  if (m.weight_kg && m.height_cm) add("bmi", bmi(m.weight_kg, m.height_cm));
  add("head", m.head_cm);
  return out;
}

/** Khoảng cách khuyến nghị giữa 2 lần đo (tháng) theo tuổi */
export function measureIntervalMonths(months: number): number {
  if (months < 12) return 1;
  if (months < 24) return 3;
  if (months < 72) return 6;
  return 12;
}
