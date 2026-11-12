/**
 * Nhật ký sốt – phân loại nhiệt độ và dấu hiệu cần đi khám
 * (tham khảo WHO IMCI, NICE NG143 "Fever in under 5s", Bộ Y tế).
 */
import type { Level } from "./growth";
import type { Temperature } from "./types";

export const TEMP_SITES = ["Nách", "Tai", "Trán", "Miệng", "Hậu môn"];

export function gradeTemp(t: number): { level: Level; label: string } {
  if (t >= 40) return { level: "danger", label: "Sốt rất cao" };
  if (t >= 39) return { level: "danger", label: "Sốt cao" };
  if (t >= 38) return { level: "warning", label: "Sốt" };
  if (t >= 37.5) return { level: "info", label: "Sốt nhẹ" };
  if (t < 35.5) return { level: "warning", label: "Thân nhiệt thấp" };
  return { level: "good", label: "Bình thường" };
}

const HOUR = 3600_000;

/** Đợt sốt gần nhất: các lần đo liên tiếp cách nhau < 48 giờ, tính từ lần đầu ≥ 38°C */
export function currentEpisode(temps: Temperature[]): { readings: Temperature[]; feverHours: number; max: number; recent: boolean } | null {
  const sorted = [...temps].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  if (!sorted.length) return null;
  let i = sorted.length - 1;
  while (i > 0 && new Date(sorted[i].measured_at).getTime() - new Date(sorted[i - 1].measured_at).getTime() < 48 * HOUR) i--;
  const readings = sorted.slice(i);
  const fevers = readings.filter((r) => r.temp_c >= 38);
  const last = readings[readings.length - 1];
  const recent = Date.now() - new Date(last.measured_at).getTime() < 48 * HOUR;
  const feverHours = fevers.length
    ? (new Date(fevers[fevers.length - 1].measured_at).getTime() - new Date(fevers[0].measured_at).getTime()) / HOUR
    : 0;
  return { readings, feverHours, max: Math.max(...readings.map((r) => r.temp_c)), recent };
}

export interface FeverAlert {
  level: Level;
  title: string;
  detail: string;
}

/** Cảnh báo dựa trên đợt sốt gần nhất (chỉ khi lần đo cuối trong 48 giờ) */
export function feverAlerts(temps: Temperature[], ageMonths: number): FeverAlert[] {
  const ep = currentEpisode(temps);
  if (!ep || !ep.recent) return [];
  const out: FeverAlert[] = [];
  const last = ep.readings[ep.readings.length - 1];
  if (ageMonths < 3 && ep.max >= 38) {
    out.push({ level: "danger", title: "Trẻ dưới 3 tháng bị sốt", detail: `Nhiệt độ cao nhất ${ep.max}°C. Trẻ dưới 3 tháng sốt ≥ 38°C cần được đưa đi khám ngay.` });
  } else if (ep.max >= 40) {
    out.push({ level: "danger", title: `Sốt rất cao ${ep.max}°C`, detail: "Hạ sốt, chườm ấm và đưa đi khám sớm, nhất là khi kèm li bì, co giật, khó thở, nôn nhiều." });
  } else if (last.temp_c >= 39) {
    out.push({ level: "warning", title: `Đang sốt cao ${last.temp_c}°C`, detail: "Dùng thuốc hạ sốt theo cân nặng, uống nhiều nước, theo dõi 4–6 giờ/lần." });
  }
  if (ep.feverHours >= 72) {
    out.push({ level: "warning", title: `Sốt kéo dài ${Math.floor(ep.feverHours / 24)} ngày`, detail: "Sốt quá 3 ngày nên đi khám để tìm nguyên nhân (VD: sốt xuất huyết, nhiễm khuẩn)." });
  } else if (ageMonths < 24 && ep.feverHours >= 48) {
    out.push({ level: "warning", title: "Trẻ nhỏ sốt quá 2 ngày", detail: "Trẻ dưới 2 tuổi sốt kéo dài nên được bác sĩ thăm khám." });
  }
  return out;
}

/** Gợi ý liều thuốc hạ sốt theo cân nặng (tham khảo, theo chỉ định bác sĩ/dược sĩ) */
export function antipyreticHint(weightKg: number | null, ageMonths: number): string {
  const para = weightKg ? ` ≈ ${Math.round(weightKg * 10)}–${Math.round(weightKg * 15)} mg/lần` : "";
  let s = `Paracetamol 10–15 mg/kg/lần${para}, cách nhau 4–6 giờ, tối đa 4 lần/ngày. Dùng khi sốt ≥ 38,5°C.`;
  if (ageMonths >= 6) {
    const ibu = weightKg ? ` ≈ ${Math.round(weightKg * 5)}–${Math.round(weightKg * 10)} mg/lần` : "";
    s += ` Ibuprofen (trẻ ≥ 6 tháng) 5–10 mg/kg/lần${ibu}, cách 6–8 giờ – không dùng khi nghi sốt xuất huyết.`;
  }
  return s;
}
