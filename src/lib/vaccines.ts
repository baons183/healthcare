/**
 * Danh mục vắc xin & lịch tiêm tham khảo tại Việt Nam
 * (Chương trình Tiêm chủng mở rộng – TCMR, và vắc xin dịch vụ phổ biến).
 * Chỉ mang tính tham khảo – lịch thực tế theo chỉ định của cơ sở tiêm chủng/bác sĩ.
 */
import type { Vaccination } from "./types";
import { addMonths, ageInMonths, daysBetween, today } from "./date";

export type Program = "tcmr" | "service";

export interface DoseSpec {
  /** Tuổi khuyến cáo (tháng) */
  at: number;
  note?: string;
}

export interface VaccineSpec {
  code: string;
  name: string;
  diseases: string;
  program: Program;
  doses: DoseSpec[];
  /** Sau các mũi cơ bản, nhắc lại mỗi N tháng */
  recurringMonths?: number;
  /** Tuổi bắt đầu nhắc lại (nếu không có mũi cơ bản) */
  recurringFrom?: number;
  /** Quá tuổi này (tháng) thì không còn tiêm bù */
  maxAge?: number;
  /** Tên thương mại thường gặp – để gợi ý khi nhập */
  brands: string[];
  note?: string;
  adult?: boolean;
}

export const VACCINES: VaccineSpec[] = [
  {
    code: "hepb0", name: "Viêm gan B sơ sinh", diseases: "Viêm gan B", program: "tcmr",
    doses: [{ at: 0, note: "Trong 24 giờ đầu sau sinh" }], maxAge: 1,
    brands: ["Engerix-B", "Euvax B", "Heberbiovac"],
  },
  {
    code: "bcg", name: "Lao (BCG)", diseases: "Lao", program: "tcmr",
    doses: [{ at: 0, note: "Càng sớm càng tốt trong tháng đầu" }], maxAge: 12,
    brands: ["BCG"],
  },
  {
    code: "dtp", name: "5 trong 1 / 6 trong 1", diseases: "Bạch hầu, ho gà, uốn ván, Hib, viêm gan B (6in1: + bại liệt)",
    program: "tcmr",
    doses: [{ at: 2 }, { at: 3 }, { at: 4 }, { at: 18, note: "Mũi nhắc (TCMR: DPT; dịch vụ: 6in1/Tetraxim)" }],
    brands: ["ComBE Five", "Quinvaxem", "SII 5in1", "Hexaxim", "Infanrix Hexa", "Pentaxim"],
    note: "Hexaxim/Infanrix Hexa (6in1) đã gồm bại liệt tiêm – không cần tiêm riêng IPV.",
  },
  {
    code: "polio", name: "Bại liệt", diseases: "Bại liệt", program: "tcmr",
    doses: [{ at: 2, note: "OPV uống" }, { at: 3, note: "OPV uống" }, { at: 4, note: "OPV uống" }, { at: 5, note: "IPV tiêm" }, { at: 9, note: "IPV tiêm" }],
    brands: ["OPV (uống)", "IPV", "Imovax Polio"],
  },
  {
    code: "rota", name: "Tiêu chảy do Rota virus", diseases: "Viêm dạ dày ruột do Rota", program: "service",
    doses: [{ at: 2 }, { at: 3 }], maxAge: 8,
    brands: ["Rotarix", "RotaTeq", "Rotavin-M1"],
    note: "Uống. Phải hoàn tất trước 6 tháng (Rotarix) / 8 tháng (RotaTeq – 3 liều).",
  },
  {
    code: "pcv", name: "Phế cầu", diseases: "Viêm phổi, viêm màng não, viêm tai giữa do phế cầu", program: "service",
    doses: [{ at: 2 }, { at: 3 }, { at: 4 }, { at: 12, note: "Mũi nhắc 12–15 tháng" }],
    brands: ["Synflorix", "Prevenar 13", "Vaxneuvance", "Prevenar 20"],
  },
  {
    code: "menb", name: "Não mô cầu B", diseases: "Viêm màng não, nhiễm khuẩn huyết do não mô cầu B", program: "service",
    doses: [{ at: 2 }, { at: 4 }, { at: 12, note: "Mũi nhắc" }],
    brands: ["Bexsero"],
  },
  {
    code: "flu", name: "Cúm", diseases: "Cúm mùa", program: "service",
    doses: [{ at: 6, note: "Lần đầu tiêm 2 mũi cách nhau 1 tháng" }, { at: 7 }],
    recurringMonths: 12, recurringFrom: 6,
    brands: ["Vaxigrip Tetra", "Influvac Tetra", "GC Flu", "Ivacflu-S"],
    note: "Nhắc lại hằng năm, nên tiêm trước mùa cúm.",
  },
  {
    code: "measles", name: "Sởi", diseases: "Sởi", program: "tcmr",
    doses: [{ at: 9 }],
    brands: ["MVVAC"],
  },
  {
    code: "menacwy", name: "Não mô cầu ACYW", diseases: "Viêm màng não do não mô cầu A, C, Y, W", program: "service",
    doses: [{ at: 9 }, { at: 12 }],
    brands: ["Menactra", "MenQuadfi", "Nimenrix"],
  },
  {
    code: "mmr", name: "Sởi – Quai bị – Rubella", diseases: "Sởi, quai bị, rubella", program: "service",
    doses: [{ at: 12 }, { at: 48, note: "Mũi nhắc 4–6 tuổi" }],
    brands: ["MMR II", "Priorix", "MR (TCMR – 18 tháng)"],
    note: "TCMR tiêm vắc xin MR (sởi – rubella) lúc 18 tháng.",
  },
  {
    code: "varicella", name: "Thủy đậu", diseases: "Thủy đậu", program: "service",
    doses: [{ at: 12 }, { at: 48, note: "Có thể sớm hơn, cách mũi 1 tối thiểu 3 tháng" }],
    brands: ["Varivax", "Varilrix", "Barycela"],
  },
  {
    code: "je", name: "Viêm não Nhật Bản", diseases: "Viêm não Nhật Bản", program: "tcmr",
    doses: [{ at: 12 }, { at: 12.5, note: "1–2 tuần sau mũi 1" }, { at: 24, note: "1 năm sau mũi 2" }],
    brands: ["Jevax", "Imojev", "Jeev"],
    note: "Imojev (dịch vụ) chỉ cần 2 mũi, cách nhau 12–24 tháng.",
  },
  {
    code: "hepa", name: "Viêm gan A", diseases: "Viêm gan A", program: "service",
    doses: [{ at: 12 }, { at: 18 }],
    brands: ["Havax", "Avaxim 80", "Twinrix"],
  },
  {
    code: "typhoid", name: "Thương hàn", diseases: "Thương hàn", program: "service",
    doses: [{ at: 24 }], recurringMonths: 36,
    brands: ["Typhim Vi", "Typhoid Vi"],
    note: "Nhắc lại mỗi 3 năm nếu ở vùng nguy cơ.",
  },
  {
    code: "dengue", name: "Sốt xuất huyết", diseases: "Sốt xuất huyết Dengue", program: "service",
    doses: [{ at: 48 }, { at: 51, note: "3 tháng sau mũi 1" }],
    brands: ["Qdenga"],
  },
  {
    code: "dtp_booster", name: "Nhắc Bạch hầu – Ho gà – Uốn ván", diseases: "Bạch hầu, ho gà, uốn ván", program: "tcmr",
    doses: [{ at: 48, note: "4–6 tuổi (dịch vụ: Tetraxim/Boostrix/Adacel)" }, { at: 84, note: "7 tuổi (TCMR: Td)" }],
    recurringMonths: 120,
    brands: ["Tetraxim", "Boostrix", "Adacel", "Td", "VAT (uốn ván)"],
    note: "Người lớn nhắc lại mỗi 10 năm. Phụ nữ mang thai tiêm theo chỉ định.",
  },
  {
    code: "hpv", name: "HPV", diseases: "Ung thư cổ tử cung, hậu môn, sùi mào gà…", program: "service",
    doses: [{ at: 108, note: "9–14 tuổi: 2 mũi" }, { at: 114, note: "6–12 tháng sau mũi 1" }], maxAge: 540,
    brands: ["Gardasil", "Gardasil 9", "Cervarix"],
  },
  {
    code: "zoster", name: "Zona thần kinh", diseases: "Zona (giời leo)", program: "service", adult: true,
    doses: [{ at: 600, note: "Từ 50 tuổi" }, { at: 602, note: "2–6 tháng sau mũi 1" }],
    brands: ["Shingrix"],
  },
  {
    code: "pneumo_adult", name: "Phế cầu người cao tuổi", diseases: "Viêm phổi do phế cầu", program: "service", adult: true,
    doses: [{ at: 780, note: "Từ 65 tuổi" }],
    brands: ["Prevenar 20", "Vaxneuvance", "Pneumovax 23"],
  },
];

export const VACCINE_BY_CODE = Object.fromEntries(VACCINES.map((v) => [v.code, v]));

/** Vắc xin phối hợp: tên thương mại -> các nhóm được tính */
const COMBO: Record<string, string[]> = {
  hexaxim: ["dtp", "polio"],
  "infanrix hexa": ["dtp", "polio"],
  pentaxim: ["dtp", "polio"],
  tetraxim: ["dtp_booster", "polio"],
  "mr (tcmr – 18 tháng)": ["mmr"],
  mr: ["mmr"],
  twinrix: ["hepa"],
};

export function codesCovered(v: Pick<Vaccination, "vaccine_code" | "vaccine_name">): string[] {
  const set = new Set<string>();
  if (v.vaccine_code) set.add(v.vaccine_code);
  const extra = COMBO[v.vaccine_name.trim().toLowerCase()];
  extra?.forEach((c) => set.add(c));
  return [...set];
}

export type DoseStatus = "done" | "overdue" | "due" | "upcoming" | "expired" | "unknown";

export interface ScheduledDose {
  vaccine: VaccineSpec;
  doseIndex: number; // 1-based
  label: string; // "Mũi 1", "Nhắc lại hằng năm"
  dueDate: string;
  dueAgeMonths: number;
  status: DoseStatus;
  record?: Vaccination;
  note?: string;
}

const GRACE_DAYS = 30; // quá hạn sau 30 ngày kể từ mốc khuyến cáo
/** "Sắp tới": mũi có ngày tiêm trong N ngày tới */
export const SOON_DAYS = 15;

export function isSoon(d: { status: DoseStatus; dueDate: string }): boolean {
  return d.status === "upcoming" && daysBetween(today(), d.dueDate) <= SOON_DAYS;
}

function statusFor(dueDate: string, nowAge: number, maxAge: number | undefined): DoseStatus {
  const now = today();
  const diff = daysBetween(now, dueDate); // >0: tương lai
  if (maxAge !== undefined && nowAge > maxAge) return "expired";
  if (diff > 0) return "upcoming"; // chưa tới ngày (≤ 15 ngày tới = "sắp tới")
  if (diff >= -GRACE_DAYS) return "due"; // đã tới ngày, trễ chưa quá 30 ngày
  return "overdue";
}

/**
 * Lập lịch tiêm cho 1 người dựa trên ngày sinh và các mũi đã tiêm.
 * Ghép mũi theo thứ tự thời gian (mũi thứ k đã tiêm = liều k).
 */
export function buildSchedule(birthDate: string, records: Vaccination[]): ScheduledDose[] {
  const nowAge = ageInMonths(birthDate);
  const isAdult = nowAge >= 228;
  const out: ScheduledDose[] = [];

  for (const vac of VACCINES) {
    const recs = records
      .filter((r) => codesCovered(r).includes(vac.code))
      .sort((a, b) => a.administered_on.localeCompare(b.administered_on));

    vac.doses.forEach((d, i) => {
      const rec = recs[i];
      const dueDate = addMonths(birthDate, d.at);
      let status: DoseStatus;
      if (rec) status = "done";
      else if (isAdult && d.at < 228 && !vac.adult) status = "unknown"; // thời thơ ấu – chưa có dữ liệu
      else status = statusFor(dueDate, nowAge, vac.maxAge);
      out.push({
        vaccine: vac,
        doseIndex: i + 1,
        label: d.at >= 18 && i === vac.doses.length - 1 && vac.doses.length > 2 ? `Mũi ${i + 1} (nhắc)` : `Mũi ${i + 1}`,
        dueDate,
        dueAgeMonths: d.at,
        status,
        record: rec,
        note: d.note,
      });
    });

    // Các mũi vượt số liều cơ bản (VD tiêm cúm hằng năm) – hiển thị là đã tiêm
    recs.slice(vac.doses.length).forEach((rec, j) => {
      out.push({
        vaccine: vac,
        doseIndex: vac.doses.length + j + 1,
        label: vac.recurringMonths ? "Nhắc lại" : `Mũi ${vac.doses.length + j + 1}`,
        dueDate: rec.administered_on,
        dueAgeMonths: ageInMonths(birthDate, rec.administered_on),
        status: "done",
        record: rec,
      });
    });

    // Mũi nhắc định kỳ tiếp theo
    if (vac.recurringMonths) {
      const basicDone = recs.length >= vac.doses.length;
      const last = recs[recs.length - 1];
      let next: string | null = null;
      if (basicDone && last) next = addMonths(last.administered_on, vac.recurringMonths);
      else if (vac.doses.length === 0 && vac.recurringFrom !== undefined) next = addMonths(birthDate, vac.recurringFrom);
      // Người lớn chưa có dữ liệu cúm: khuyến nghị tiêm hằng năm ngay
      if (!last && isAdult && vac.code === "flu") next = today();
      if (next) {
        out.push({
          vaccine: vac,
          doseIndex: recs.length + 1,
          label: `Nhắc lại (${vac.recurringMonths >= 12 ? vac.recurringMonths / 12 + " năm/lần" : vac.recurringMonths + " tháng/lần"})`,
          dueDate: next,
          dueAgeMonths: ageInMonths(birthDate, next),
          status: statusFor(next, nowAge, vac.maxAge),
        });
      }
    }
  }

  // Ưu tiên: dùng ngày hẹn tiêm tiếp (next_due_on) người dùng đã nhập
  for (const r of records) {
    if (!r.next_due_on) continue;
    const pending = out.find(
      (d) => d.status !== "done" && d.status !== "unknown" && codesCovered(r).includes(d.vaccine.code) && d.doseIndex > 0,
    );
    if (pending && pending.dueDate !== r.next_due_on && daysBetween(r.administered_on, pending.dueDate) >= 0) {
      pending.dueDate = r.next_due_on;
      pending.dueAgeMonths = ageInMonths(birthDate, r.next_due_on);
      pending.status = statusFor(r.next_due_on, nowAge, pending.vaccine.maxAge);
      pending.note = "Theo lịch hẹn của cơ sở tiêm";
    }
  }

  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export const STATUS_META: Record<DoseStatus, { label: string; cls: string; icon: string }> = {
  done: { label: "Đã tiêm", cls: "badge-good", icon: "✓" },
  due: { label: "Đến hạn", cls: "badge-warning", icon: "!" },
  overdue: { label: "Quá hạn", cls: "badge-danger", icon: "!" },
  upcoming: { label: "Chưa tới", cls: "badge-info", icon: "◷" },
  expired: { label: "Quá tuổi tiêm", cls: "badge-muted", icon: "–" },
  unknown: { label: "Chưa ghi nhận", cls: "badge-muted", icon: "?" },
};
