"use client";
import { isBpAlarm, isBpCrisis } from "./vitals";

export interface BpAlarmResult {
  level: "ok" | "alarm" | "crisis";
  /** Số người nhà đã được báo */
  notified: number;
}

/** Sau khi lưu huyết áp: nếu ở mức nguy hiểm thì báo cho người nhà (server tự kiểm tra lại) */
export async function afterBpSaved(vitalId: string, sys: number, dia: number): Promise<BpAlarmResult> {
  if (!isBpAlarm(sys, dia)) return { level: "ok", notified: 0 };
  let notified = 0;
  try {
    const res = await fetch("/api/alerts/vital", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vital_id: vitalId }),
    });
    const j = await res.json().catch(() => ({}));
    notified = Number(j.sent) || 0;
  } catch {
    /* mất mạng – vẫn lưu được số đo */
  }
  return { level: isBpCrisis(sys, dia) ? "crisis" : "alarm", notified };
}
