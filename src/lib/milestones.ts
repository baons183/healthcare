/**
 * Mốc phát triển trẻ em.
 * - Vận động thô: WHO Motor Development Study 2006 (khoảng đạt được của 1%–99% trẻ khỏe mạnh)
 * - Ngôn ngữ, xã hội, nhận thức: CDC "Learn the Signs. Act Early." 2022 (mốc mà ≥ 75% trẻ đạt được)
 * Trễ mốc không có nghĩa là bất thường – là dấu hiệu nên trao đổi với bác sĩ nhi.
 */
import { addMonths, ageInMonths } from "./date";
import type { Milestone } from "./types";

export type Domain = "motor" | "fine" | "language" | "social";

export const DOMAIN_META: Record<Domain, { label: string; icon: string }> = {
  motor: { label: "Vận động", icon: "🏃" },
  fine: { label: "Vận động tinh", icon: "✋" },
  language: { label: "Ngôn ngữ", icon: "💬" },
  social: { label: "Xã hội – nhận thức", icon: "😊" },
};

export interface MilestoneSpec {
  code: string;
  label: string;
  domain: Domain;
  /** Tuổi thường đạt (tháng) */
  typical: number;
  /** Quá tuổi này mà chưa đạt -> nên hỏi bác sĩ (tháng). null = không cảnh báo */
  late: number | null;
  source: "WHO" | "CDC";
}

export const MILESTONES: MilestoneSpec[] = [
  { code: "smile", label: "Mỉm cười khi được nói chuyện, cười với", domain: "social", typical: 2, late: 4, source: "CDC" },
  { code: "head_tummy", label: "Ngóc đầu khi nằm sấp", domain: "motor", typical: 2, late: 4, source: "CDC" },
  { code: "coo", label: "Phát ra âm thanh “ô, a” (hóng chuyện)", domain: "language", typical: 4, late: 6, source: "CDC" },
  { code: "head_steady", label: "Giữ đầu vững khi được bế", domain: "motor", typical: 4, late: 6, source: "CDC" },
  { code: "roll", label: "Lật từ sấp sang ngửa", domain: "motor", typical: 6, late: 8, source: "CDC" },
  { code: "laugh", label: "Cười thành tiếng", domain: "social", typical: 6, late: 8, source: "CDC" },
  { code: "sit", label: "Ngồi vững không cần đỡ", domain: "motor", typical: 6, late: 9.2, source: "WHO" },
  { code: "stand_assist", label: "Đứng khi có người đỡ / vịn", domain: "motor", typical: 7.6, late: 11.4, source: "WHO" },
  { code: "crawl", label: "Bò bằng tay và đầu gối", domain: "motor", typical: 8.5, late: null, source: "WHO" },
  { code: "babble", label: "Bập bẹ “ba ba”, “ma ma”", domain: "language", typical: 9, late: 11, source: "CDC" },
  { code: "name", label: "Quay lại khi được gọi tên", domain: "social", typical: 9, late: 11, source: "CDC" },
  { code: "walk_assist", label: "Đi khi được dắt / vịn đồ", domain: "motor", typical: 9.2, late: 13.7, source: "WHO" },
  { code: "stand_alone", label: "Tự đứng một mình", domain: "motor", typical: 11, late: 16.9, source: "WHO" },
  { code: "pincer", label: "Nhặt đồ nhỏ bằng ngón cái và ngón trỏ", domain: "fine", typical: 12, late: 14, source: "CDC" },
  { code: "wave", label: "Vẫy tay “bye bye”", domain: "social", typical: 12, late: 14, source: "CDC" },
  { code: "mama", label: "Gọi “bố”, “mẹ” có chủ đích", domain: "language", typical: 12, late: 15, source: "CDC" },
  { code: "walk", label: "Tự đi một mình", domain: "motor", typical: 12.1, late: 17.6, source: "WHO" },
  { code: "point", label: "Chỉ tay vào thứ muốn lấy", domain: "social", typical: 15, late: 18, source: "CDC" },
  { code: "words2", label: "Nói 1–2 từ ngoài “bố, mẹ”", domain: "language", typical: 15, late: 18, source: "CDC" },
  { code: "words3", label: "Nói từ 3 từ trở lên ngoài “bố, mẹ”", domain: "language", typical: 18, late: 21, source: "CDC" },
  { code: "spoon", label: "Tự cầm thìa xúc ăn", domain: "fine", typical: 18, late: 21, source: "CDC" },
  { code: "phrase2", label: "Nói câu 2 từ (VD: “mẹ bế”)", domain: "language", typical: 24, late: 30, source: "CDC" },
  { code: "kick", label: "Đá bóng", domain: "motor", typical: 24, late: 30, source: "CDC" },
  { code: "run", label: "Chạy", domain: "motor", typical: 24, late: 30, source: "CDC" },
  { code: "jump", label: "Bật nhảy bằng 2 chân", domain: "motor", typical: 30, late: 36, source: "CDC" },
  { code: "words50", label: "Nói được khoảng 50 từ", domain: "language", typical: 30, late: 36, source: "CDC" },
  { code: "converse", label: "Nói chuyện qua lại ít nhất 2 lượt", domain: "language", typical: 36, late: 42, source: "CDC" },
  { code: "dress", label: "Tự mặc quần áo đơn giản", domain: "fine", typical: 36, late: 42, source: "CDC" },
  { code: "sentence4", label: "Nói câu từ 4 từ trở lên", domain: "language", typical: 48, late: 54, source: "CDC" },
  { code: "catch", label: "Bắt được quả bóng to", domain: "motor", typical: 48, late: 54, source: "CDC" },
  { code: "count10", label: "Đếm đến 10", domain: "social", typical: 60, late: 66, source: "CDC" },
  { code: "hop", label: "Nhảy lò cò 1 chân", domain: "motor", typical: 60, late: 66, source: "CDC" },
];

export const MILESTONE_BY_CODE = Object.fromEntries(MILESTONES.map((m) => [m.code, m]));

/** Hiển thị tab Phát triển cho trẻ dưới 6 tuổi */
export const MILESTONE_MAX_AGE = 72;

export type MilestoneState = "done" | "late" | "now" | "later";

export interface MilestoneItem {
  spec: MilestoneSpec;
  state: MilestoneState;
  record?: Milestone;
  typicalDate: string;
}

export function milestoneItems(birthDate: string, records: Milestone[]): MilestoneItem[] {
  const age = ageInMonths(birthDate);
  return MILESTONES.map((spec) => {
    const record = records.find((r) => r.code === spec.code);
    const state: MilestoneState = record
      ? "done"
      : spec.late !== null && age > spec.late
        ? "late"
        : age >= spec.typical - 1
          ? "now"
          : "later";
    return { spec, state, record, typicalDate: addMonths(birthDate, spec.typical) };
  });
}

export function lateMilestones(birthDate: string, records: Milestone[]): MilestoneItem[] {
  if (ageInMonths(birthDate) >= MILESTONE_MAX_AGE) return [];
  return milestoneItems(birthDate, records).filter((i) => i.state === "late");
}

export function fmtMonths(m: number): string {
  if (m < 24) return `${Math.round(m * 10) / 10} tháng`.replace(".", ",");
  return m % 12 === 0 ? `${m / 12} tuổi` : `${Math.floor(m / 12)} tuổi ${Math.round(m % 12)} tháng`;
}
