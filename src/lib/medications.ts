import { daysBetween, today } from "./date";
import type { Medication } from "./types";

export const TIME_PRESETS = [
  { label: "Sáng", time: "07:00" },
  { label: "Trưa", time: "12:00" },
  { label: "Chiều", time: "17:00" },
  { label: "Tối", time: "20:00" },
  { label: "Trước ngủ", time: "21:30" },
];

export function isActive(m: Pick<Medication, "start_on" | "end_on">, date: string = today()): boolean {
  return m.start_on <= date && (!m.end_on || m.end_on >= date);
}

export function activeMedications(list: Medication[], date: string = today()): Medication[] {
  return list.filter((m) => isActive(m, date));
}

export function sortTimes(times: string[]): string[] {
  return [...new Set(times.filter((t) => /^\d{2}:\d{2}$/.test(t)))].sort();
}

export function medicationSummary(m: Medication): string {
  const parts: string[] = [];
  if (m.dosage) parts.push(m.dosage);
  if (m.times.length) parts.push(`${m.times.length} lần/ngày (${sortTimes(m.times).join(", ")})`);
  if (m.end_on) {
    const left = daysBetween(today(), m.end_on);
    parts.push(left >= 0 ? `còn ${left + 1} ngày` : "đã xong");
  } else parts.push("dùng lâu dài");
  return parts.join(" · ");
}

/** Android: mở ứng dụng Đồng hồ với báo thức điền sẵn (người dùng bấm lưu). Không hỗ trợ iPhone. */
export function alarmIntentUrl(time: string, message: string): string {
  const [h, m] = time.split(":").map(Number);
  return (
    "intent:#Intent;action=android.intent.action.SET_ALARM;" +
    `i.android.intent.extra.alarm.HOUR=${h};i.android.intent.extra.alarm.MINUTES=${m};` +
    `S.android.intent.extra.alarm.MESSAGE=${encodeURIComponent(message)};end`
  );
}

export const isAndroid = () => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
