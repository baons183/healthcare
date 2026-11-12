/**
 * Phân loại huyết áp, đường huyết, mỡ máu ở người lớn (đơn vị mmol/L).
 * - Huyết áp: Hội Tim mạch Việt Nam 2022 / ESC-ESH
 * - Đường huyết: ADA / Bộ Y tế (đái tháo đường type 2, 2020)
 * - Mỡ máu: NCEP ATP III
 * Tham khảo – không thay thế chẩn đoán của bác sĩ (cần đo nhiều lần).
 */
import type { Level } from "./growth";
import type { Gender, GlucoseContext, Vital } from "./types";

export interface Grade {
  level: Level;
  label: string;
}

export function gradeBP(sys: number, dia: number): Grade {
  if (sys >= 180 || dia >= 110) return { level: "danger", label: "Tăng huyết áp độ 3" };
  if (sys >= 160 || dia >= 100) return { level: "danger", label: "Tăng huyết áp độ 2" };
  if (sys >= 140 || dia >= 90) return { level: "warning", label: "Tăng huyết áp độ 1" };
  if (sys >= 130 || dia >= 85) return { level: "info", label: "Bình thường cao" };
  if (sys < 90 || dia < 60) return { level: "warning", label: "Huyết áp thấp" };
  if (sys >= 120 || dia >= 80) return { level: "good", label: "Bình thường" };
  return { level: "good", label: "Tối ưu" };
}

export const GLUCOSE_CONTEXT: Record<GlucoseContext, string> = {
  fasting: "Lúc đói",
  after_meal: "2 giờ sau ăn",
  random: "Bất kỳ",
};

export function gradeGlucose(v: number, ctx: GlucoseContext | null): Grade {
  if (v < 3.9) return { level: "warning", label: "Hạ đường huyết" };
  if (ctx === "fasting") {
    if (v >= 7) return { level: "danger", label: "Cao – nghi đái tháo đường" };
    if (v >= 5.6) return { level: "warning", label: "Tiền đái tháo đường" };
    return { level: "good", label: "Bình thường" };
  }
  if (v >= 11.1) return { level: "danger", label: "Cao – nghi đái tháo đường" };
  if (ctx === "after_meal") {
    if (v >= 7.8) return { level: "warning", label: "Rối loạn dung nạp đường" };
    return { level: "good", label: "Bình thường" };
  }
  return { level: "info", label: "Nên đo lúc đói để đánh giá" };
}

export function gradeLipid(kind: "cholesterol" | "ldl" | "hdl" | "triglycerides", v: number, gender: Gender): Grade {
  switch (kind) {
    case "cholesterol":
      return v >= 6.2 ? { level: "danger", label: "Cao" } : v >= 5.2 ? { level: "warning", label: "Giới hạn cao" } : { level: "good", label: "Tốt" };
    case "ldl":
      return v >= 4.1 ? { level: "danger", label: "Cao" } : v >= 3.4 ? { level: "warning", label: "Giới hạn cao" } : { level: "good", label: "Tốt" };
    case "hdl":
      return v < (gender === "male" ? 1.0 : 1.3) ? { level: "warning", label: "Thấp" } : { level: "good", label: "Tốt" };
    case "triglycerides":
      return v >= 2.3 ? { level: "danger", label: "Cao" } : v >= 1.7 ? { level: "warning", label: "Giới hạn cao" } : { level: "good", label: "Tốt" };
  }
}

export const LIPID_META = {
  cholesterol: { label: "Cholesterol toàn phần", ref: "< 5,2" },
  ldl: { label: "LDL-c (mỡ xấu)", ref: "< 3,4" },
  hdl: { label: "HDL-c (mỡ tốt)", ref: "≥ 1,0 (nam) / 1,3 (nữ)" },
  triglycerides: { label: "Triglycerid", ref: "< 1,7" },
} as const;

export type LipidKey = keyof typeof LIPID_META;
export const LIPID_KEYS = Object.keys(LIPID_META) as LipidKey[];

/** Đánh giá các chỉ số mới nhất (mỗi loại lấy lần đo gần nhất có giá trị) */
export function latestVitalGrades(vitals: Vital[], gender: Gender): { key: string; title: string; value: string; grade: Grade; at: string }[] {
  const sorted = [...vitals].sort((a, b) => b.measured_at.localeCompare(a.measured_at));
  const out: { key: string; title: string; value: string; grade: Grade; at: string }[] = [];
  const bp = sorted.find((v) => v.systolic && v.diastolic);
  if (bp) out.push({ key: "bp", title: "Huyết áp", value: `${bp.systolic}/${bp.diastolic} mmHg`, grade: gradeBP(bp.systolic!, bp.diastolic!), at: bp.measured_at });
  const gl = sorted.find((v) => v.glucose != null);
  if (gl)
    out.push({
      key: "glucose",
      title: `Đường huyết (${GLUCOSE_CONTEXT[gl.glucose_context ?? "random"].toLowerCase()})`,
      value: `${gl.glucose} mmol/L`,
      grade: gradeGlucose(gl.glucose!, gl.glucose_context),
      at: gl.measured_at,
    });
  for (const k of LIPID_KEYS) {
    const r = sorted.find((v) => v[k] != null);
    if (r) out.push({ key: k, title: LIPID_META[k].label, value: `${r[k]} mmol/L`, grade: gradeLipid(k, r[k]!, gender), at: r.measured_at });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Huyết áp: trung bình, xu hướng, cảnh báo
// Ngưỡng tăng huyết áp khi ĐO TẠI NHÀ (trung bình nhiều lần): ≥ 135/85 (ESH 2023, Hội Tim mạch VN)
// ---------------------------------------------------------------------------
export const HOME_BP_LIMIT = { sys: 135, dia: 85 };
const DAY_MS = 86400_000;

export interface BpAvg {
  count: number;
  sys: number;
  dia: number;
  pulse: number | null;
}

/** Trung bình huyết áp các lần đo trong khoảng [now - toDays, now - fromDays) */
export function bpAverage(vitals: Vital[], fromDays: number, toDays: number, now = Date.now()): BpAvg | null {
  const rows = vitals.filter((v) => {
    if (!v.systolic || !v.diastolic) return false;
    const age = (now - new Date(v.measured_at).getTime()) / DAY_MS;
    return age >= fromDays && age < toDays;
  });
  if (!rows.length) return null;
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  const pulses = rows.map((r) => r.pulse).filter((p): p is number => !!p);
  return { count: rows.length, sys: avg(rows.map((r) => r.systolic!)), dia: avg(rows.map((r) => r.diastolic!)), pulse: pulses.length ? avg(pulses) : null };
}

/** Cơn tăng huyết áp: cần xử trí ngay */
export const isBpCrisis = (sys: number, dia: number) => sys >= 180 || dia >= 110;
/** Mức báo ngay cho cả nhà khi vừa nhập */
export const isBpAlarm = (sys: number, dia: number) => gradeBP(sys, dia).level === "danger";

export const BP_CRISIS_ADVICE =
  "Ngồi nghỉ 5 phút rồi đo lại. Nếu vẫn ≥ 180/110, hoặc kèm đau ngực, khó thở, đau đầu dữ dội, yếu/tê nửa người, nói khó, nhìn mờ → gọi 115 hoặc đến viện ngay.";

export interface BpAlert {
  level: Level;
  title: string;
  detail: string;
}

/** Cảnh báo dựa trên trung bình 7 ngày và xu hướng so với 30 ngày trước đó (cần ≥ 3 lần đo mỗi khoảng) */
export function bpAlerts(vitals: Vital[], now = Date.now()): BpAlert[] {
  const out: BpAlert[] = [];
  const recent = bpAverage(vitals, 0, 7, now);
  const before = bpAverage(vitals, 7, 37, now);
  if (recent && recent.count >= 3) {
    if (recent.sys >= HOME_BP_LIMIT.sys || recent.dia >= HOME_BP_LIMIT.dia) {
      out.push({
        level: recent.sys >= 160 || recent.dia >= 100 ? "danger" : "warning",
        title: `Huyết áp trung bình 7 ngày cao: ${recent.sys}/${recent.dia}`,
        detail: `${recent.count} lần đo. Đo tại nhà, trung bình từ ${HOME_BP_LIMIT.sys}/${HOME_BP_LIMIT.dia} trở lên là tăng huyết áp – nên đi khám tim mạch, giảm muối, tập thể dục.`,
      });
    } else if (recent.sys < 90 || recent.dia < 60) {
      out.push({ level: "warning", title: `Huyết áp trung bình 7 ngày thấp: ${recent.sys}/${recent.dia}`, detail: "Nếu hay chóng mặt, mệt, choáng khi đứng dậy hãy đi khám." });
    }
    if (before && before.count >= 3) {
      const dS = recent.sys - before.sys;
      const dD = recent.dia - before.dia;
      if (dS >= 10 || dD >= 5) {
        out.push({
          level: "warning",
          title: "Huyết áp có xu hướng tăng",
          detail: `Trung bình 7 ngày ${recent.sys}/${recent.dia}, tăng ${dS > 0 ? "+" + dS : dS}/${dD > 0 ? "+" + dD : dD} so với tháng trước (${before.sys}/${before.dia}). Kiểm tra lại thuốc, chế độ ăn mặn, giấc ngủ, căng thẳng.`,
        });
      }
    }
  }
  return out;
}

export const BP_TIME_PRESETS = ["06:30", "07:00", "12:00", "17:00", "21:00"];
