/** Tổng hợp khuyến cáo cho từng thành viên từ số đo, lịch tiêm, bệnh sử. */
import type { Illness, Measurement, Member, Vaccination } from "./types";
import { ADULT_MONTHS, assessMeasurement, INDICATORS, measureIntervalMonths, zScore, type Level } from "./growth";
import { buildSchedule } from "./vaccines";
import { addMonths, ageInMonths, daysBetween, formatDate, today } from "./date";

export interface Recommendation {
  level: Level;
  title: string;
  detail?: string;
  tab?: "growth" | "vaccines" | "illness" | "profile";
}

export function recommendationsFor(
  member: Member,
  measurements: Measurement[],
  vaccinations: Vaccination[],
  illnesses: Illness[],
): Recommendation[] {
  const recs: Recommendation[] = [];
  const age = ageInMonths(member.birth_date);
  const sorted = [...measurements].sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  const last = sorted[sorted.length - 1];

  // ---- Đo định kỳ
  const interval = measureIntervalMonths(age);
  if (!last) {
    recs.push({ level: "info", title: "Chưa có số đo nào", detail: "Thêm chiều cao, cân nặng để theo dõi tăng trưởng.", tab: "growth" });
  } else if (addMonths(last.measured_on, interval) < today()) {
    recs.push({
      level: "info",
      title: "Đến lúc cập nhật số đo",
      detail: `Lần đo gần nhất ${formatDate(last.measured_on)}. Ở độ tuổi này nên đo mỗi ${interval} tháng.`,
      tab: "growth",
    });
  }

  // ---- Đánh giá lần đo gần nhất
  if (last) {
    for (const a of assessMeasurement(member.gender, member.birth_date, last)) {
      if (a.level === "good") continue;
      const zTxt = a.z != null ? ` (z = ${a.z.toFixed(1)}, bách phân vị ${a.pct}%)` : "";
      recs.push({
        level: a.level,
        title: `${INDICATORS[a.indicator].short}: ${a.label}`,
        detail: `${a.value} ${INDICATORS[a.indicator].unit}${zTxt}. ${a.advice ?? ""}`.trim(),
        tab: "growth",
      });
    }
  }

  // ---- Xu hướng (trẻ em): sụt cân, tụt kênh tăng trưởng
  if (age < ADULT_MONTHS && sorted.length >= 2) {
    const prev = sorted[sorted.length - 2];
    if (last.weight_kg && prev.weight_kg && last.weight_kg < prev.weight_kg && daysBetween(prev.measured_on, last.measured_on) <= 180) {
      recs.push({
        level: "warning",
        title: "Cân nặng giảm so với lần đo trước",
        detail: `${prev.weight_kg} kg → ${last.weight_kg} kg. Trẻ đang lớn không nên sụt cân; nếu kèm ốm, biếng ăn kéo dài hãy đưa đi khám.`,
        tab: "growth",
      });
    }
    for (const ind of ["weight", "height"] as const) {
      const v1 = prev[ind === "weight" ? "weight_kg" : "height_cm"];
      const v2 = last[ind === "weight" ? "weight_kg" : "height_cm"];
      if (!v1 || !v2) continue;
      const z1 = zScore(member.gender, ind, ageInMonths(member.birth_date, prev.measured_on), v1);
      const z2 = zScore(member.gender, ind, ageInMonths(member.birth_date, last.measured_on), v2);
      if (z1 != null && z2 != null && z1 - z2 >= 0.67) {
        recs.push({
          level: "warning",
          title: `${INDICATORS[ind].short} tụt kênh tăng trưởng`,
          detail: `z-score giảm từ ${z1.toFixed(1)} xuống ${z2.toFixed(1)} (cắt qua 1 đường bách phân vị chính). Nên theo dõi sát và hỏi bác sĩ nếu tiếp diễn.`,
          tab: "growth",
        });
      }
    }
  }

  // ---- Tiêm chủng
  const schedule = buildSchedule(member.birth_date, vaccinations);
  const overdue = schedule.filter((d) => d.status === "overdue");
  const due = schedule.filter((d) => d.status === "due");
  if (overdue.length) {
    const tcmr = overdue.filter((d) => d.vaccine.program === "tcmr");
    recs.push({
      level: tcmr.length ? "danger" : "warning",
      title: `${overdue.length} mũi tiêm quá hạn`,
      detail: summarize(overdue.map((d) => `${d.vaccine.name} (${d.label})`)) + ". Nếu đã tiêm, hãy ghi lại để cập nhật.",
      tab: "vaccines",
    });
  }
  if (due.length) {
    recs.push({
      level: "warning",
      title: `${due.length} mũi tiêm đến hạn`,
      detail: summarize(due.map((d) => `${d.vaccine.name} (${d.label}) – ${formatDate(d.dueDate)}`)),
      tab: "vaccines",
    });
  }

  // ---- Bệnh đang điều trị kéo dài
  for (const ill of illnesses) {
    if (!ill.ended_on && daysBetween(ill.started_on, today()) > 14) {
      recs.push({
        level: ill.severity === "severe" ? "danger" : "warning",
        title: `"${ill.name}" chưa ghi nhận khỏi`,
        detail: `Bắt đầu ${formatDate(ill.started_on)} (${daysBetween(ill.started_on, today())} ngày). Cập nhật ngày khỏi hoặc tái khám nếu còn triệu chứng.`,
        tab: "illness",
      });
    }
  }
  const lastYear = illnesses.filter((i) => daysBetween(i.started_on, today()) <= 365);
  if (lastYear.length >= 6) {
    recs.push({
      level: "info",
      title: `${lastYear.length} lần ốm trong 12 tháng`,
      detail: "Ốm thường xuyên – có thể trao đổi với bác sĩ về dinh dưỡng, giấc ngủ và môi trường sống.",
      tab: "illness",
    });
  }

  // ---- Khám định kỳ người lớn
  if (age >= 216 && !last) {
    recs.push({ level: "info", title: "Khám sức khỏe định kỳ", detail: "Người trưởng thành nên khám sức khỏe tổng quát ít nhất 1 lần/năm.", tab: "growth" });
  }

  const order: Record<Level, number> = { danger: 0, warning: 1, info: 2, good: 3 };
  return recs.sort((a, b) => order[a.level] - order[b.level]);
}

function summarize(items: string[], max = 4): string {
  if (items.length <= max) return items.join("; ");
  return items.slice(0, max).join("; ") + ` và ${items.length - max} mũi khác`;
}
