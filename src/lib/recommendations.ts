/** Tổng hợp khuyến cáo cho từng thành viên từ số đo, lịch tiêm, bệnh sử. */
import { EMPTY_EXTRAS, type Deworming, type Illness, type Measurement, type Member, type MemberExtras, type Vaccination } from "./types";
import { CHECKUP_META, applicableKinds, checkupStatus, intervalLabel } from "./checkups";
import { feverAlerts } from "./fever";
import { DOMAIN_META, lateMilestones } from "./milestones";
import { activePregnancy, expectedGainAt, gestationalAge, tetanusInPregnancy, visitSchedule } from "./pregnancy";
import { latestVitalGrades } from "./vitals";
import { dewormStatus } from "./deworming";
import { ADULT_MONTHS, assessMeasurement, INDICATORS, measureIntervalMonths, zScore, type Level } from "./growth";
import { buildSchedule, isSoon, SOON_DAYS } from "./vaccines";
import { addMonths, ageInMonths, daysBetween, formatDate, today } from "./date";

export interface Recommendation {
  level: Level;
  title: string;
  detail?: string;
  tab?: "growth" | "vaccines" | "illness" | "profile" | "development" | "checkups";
}

export function recommendationsFor(
  member: Member,
  measurements: Measurement[],
  vaccinations: Vaccination[],
  illnesses: Illness[],
  dewormings: Deworming[] = [],
  extras: MemberExtras = EMPTY_EXTRAS,
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
  const soon = schedule.filter(isSoon);
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

  if (soon.length) {
    recs.push({
      level: "info",
      title: `${soon.length} mũi tiêm sắp tới (${SOON_DAYS} ngày)`,
      detail: summarize(soon.map((d) => `${d.vaccine.name} (${d.label}) – ${formatDate(d.dueDate)}`)),
      tab: "vaccines",
    });
  }

  // ---- Xổ giun
  const dw = dewormStatus(member.birth_date, dewormings);
  if (dw.state === "nodata") {
    recs.push({ level: "info", title: "Chưa có lịch sử xổ giun", detail: `Nên xổ giun định kỳ ${dw.intervalMonths} tháng/lần. Ghi lại lần gần nhất để app nhắc lịch.`, tab: "vaccines" });
  } else if (dw.state === "overdue" || dw.state === "due") {
    recs.push({
      level: "warning",
      title: dw.state === "overdue" ? "Quá hạn xổ giun" : "Đến hạn xổ giun",
      detail: `Lần gần nhất ${formatDate(dw.last!.given_on)}, nên xổ giun ${dw.intervalMonths} tháng/lần (hạn ${formatDate(dw.nextDate)}).`,
      tab: "vaccines",
    });
  } else if (dw.soon) {
    recs.push({ level: "info", title: "Sắp đến lịch xổ giun", detail: `Ngày ${formatDate(dw.nextDate)}.`, tab: "vaccines" });
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

  // ---- Sốt
  for (const a of feverAlerts(extras.temperatures, age)) recs.push({ ...a, tab: "illness" });

  // ---- Mốc phát triển
  const late = lateMilestones(member.birth_date, extras.milestones);
  if (late.length) {
    recs.push({
      level: "warning",
      title: `${late.length} mốc phát triển chưa ghi nhận`,
      detail:
        summarize(late.map((i) => `${DOMAIN_META[i.spec.domain].label.toLowerCase()}: ${i.spec.label.toLowerCase()}`), 3) +
        ". Nếu trẻ đã làm được, hãy đánh dấu; nếu chưa, nên trao đổi với bác sĩ nhi.",
      tab: "development",
    });
  }

  // ---- Khám định kỳ (răng, mắt, tổng quát)
  for (const kind of applicableKinds(member.birth_date)) {
    const st = checkupStatus(kind, member.birth_date, extras.checkups);
    if (!st) continue;
    const name = CHECKUP_META[kind].label;
    if (st.state === "nodata") {
      recs.push({ level: "info", title: `Chưa có lịch sử ${name.toLowerCase()}`, detail: `Nên ${name.toLowerCase()} ${intervalLabel(st.intervalMonths)}. Ghi lại lần gần nhất để app nhắc lịch.`, tab: "checkups" });
    } else if (st.state === "due" || st.state === "overdue") {
      recs.push({
        level: "warning",
        title: `${st.state === "overdue" ? "Quá hạn" : "Đến hạn"} ${name.toLowerCase()}`,
        detail: `Lần gần nhất ${formatDate(st.last!.done_on)}, nên khám ${intervalLabel(st.intervalMonths)} (hạn ${formatDate(st.nextDate)}).`,
        tab: "checkups",
      });
    } else if (st.soon) {
      recs.push({ level: "info", title: `Sắp đến lịch ${name.toLowerCase()}`, detail: `Ngày ${formatDate(st.nextDate)}.`, tab: "checkups" });
    }
  }

  // ---- Huyết áp, đường huyết, mỡ máu
  for (const g of latestVitalGrades(extras.vitals, member.gender)) {
    if (g.grade.level === "good") continue;
    recs.push({ level: g.grade.level, title: `${g.title}: ${g.grade.label}`, detail: `${g.value} (đo ${formatDate(g.at)}). Đo lại vài lần; nếu vẫn bất thường hãy đi khám.`, tab: "checkups" });
  }

  // ---- Thai kỳ
  const preg = activePregnancy(extras.pregnancies);
  if (preg) {
    const ga = gestationalAge(preg.lmp);
    recs.push({ level: "info", title: `Đang mang thai tuần ${ga.weeks}${ga.days ? ` + ${ga.days} ngày` : ""}`, detail: `Dự sinh ${formatDate(preg.due_date)}.`, tab: "checkups" });
    for (const v of visitSchedule(preg, extras.checkups)) {
      if (v.status === "current") recs.push({ level: "warning", title: `Đến lịch: ${v.visit.title}`, detail: `Từ ${formatDate(v.start)} đến ${formatDate(v.end)}. ${v.visit.detail}`, tab: "checkups" });
      else if (v.soon) recs.push({ level: "info", title: `Sắp tới: ${v.visit.title}`, detail: `Từ ${formatDate(v.start)}.`, tab: "checkups" });
    }
    if (ga.weeks >= 20 && tetanusInPregnancy(preg, vaccinations).length === 0) {
      recs.push({ level: "warning", title: "Chưa ghi nhận mũi uốn ván thai kỳ", detail: "Bà mẹ mang thai cần tiêm uốn ván để phòng uốn ván sơ sinh. Nếu đã tiêm, hãy ghi lại.", tab: "checkups" });
    }
    const pre = preg.pre_weight_kg;
    const lastH = [...sorted].reverse().find((x) => x.height_cm)?.height_cm;
    const lastW = sorted.filter((x) => x.weight_kg && x.measured_on >= preg.lmp).at(-1);
    if (pre && lastH && lastW?.weight_kg) {
      const wk = gestationalAge(preg.lmp, lastW.measured_on).weeks;
      const [lo, hi] = expectedGainAt(wk, pre / (lastH / 100) ** 2);
      const gain = Math.round((lastW.weight_kg - pre) * 10) / 10;
      if (gain < lo - 1 || gain > hi + 1) {
        recs.push({
          level: "info",
          title: gain < lo ? "Tăng cân thai kỳ chậm" : "Tăng cân thai kỳ nhanh",
          detail: `Tuần ${wk}: tăng ${gain} kg, khoảng khuyến nghị ${lo}–${hi} kg. Trao đổi chế độ ăn với bác sĩ.`,
          tab: "checkups",
        });
      }
    }
  }

  const order: Record<Level, number> = { danger: 0, warning: 1, info: 2, good: 3 };
  return recs.sort((a, b) => order[a.level] - order[b.level]);
}

function summarize(items: string[], max = 4): string {
  if (items.length <= max) return items.join("; ");
  return items.slice(0, max).join("; ") + ` và ${items.length - max} mũi khác`;
}
