"use client";
import { useCallback, useEffect, useState } from "react";
import type { Medication, Member, ReminderEvent } from "@/lib/types";
import { listReminderEvents, markReminderDone } from "@/lib/data";
import { addDays, today } from "@/lib/date";
import { alarmIntentUrl, isActive, isAndroid, sortTimes } from "@/lib/medications";
import { ErrorText } from "./ui";

const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** Hôm nay: từng lần uống thuốc – bấm để đánh dấu đã uống; tỉ lệ uống đúng 7 ngày; nút đặt báo thức (Android) */
export function TodayDoses({ member, medications, canEdit }: { member: Member; medications: Medication[]; canEdit: boolean }) {
  const [events, setEvents] = useState<ReminderEvent[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [android, setAndroid] = useState(false);
  const day = today();
  const meds = medications.filter((m) => isActive(m) && m.times.length > 0);

  const load = useCallback(async () => {
    setEvents(await listReminderEvents(member.id, addDays(day, -6)));
  }, [member.id, day]);
  useEffect(() => {
    setAndroid(isAndroid());
    load();
  }, [load]);

  if (!meds.length) return null;

  const doses = meds.flatMap((m) =>
    sortTimes(m.times).map((time) => {
      const key = `med:${m.id}:${day}:${time}`;
      return { med: m, time, key, ev: events.find((e) => e.key === key) };
    }),
  ).sort((a, b) => a.time.localeCompare(b.time));

  async function toggle(d: (typeof doses)[number]) {
    setBusy(d.key);
    setError(null);
    try {
      await markReminderDone(
        { key: d.key, family_id: member.family_id, member_id: member.id, kind: "med", ref_id: d.med.id, day, time: d.time },
        d.ev?.status !== "done",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  // Tỉ lệ uống đúng 7 ngày (chỉ tính lần đã qua giờ)
  const past = events.filter((e) => e.kind === "med" && (e.status === "done" || e.status === "missed"));
  const done = past.filter((e) => e.status === "done").length;

  return (
    <div className="mb-3 rounded-xl bg-surface-2 p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">Hôm nay</p>
        {past.length > 0 && (
          <p className="text-xs text-text-2">
            7 ngày qua: uống {done}/{past.length} lần{past.length - done > 0 ? ` · bỏ lỡ ${past.length - done}` : ""}
          </p>
        )}
      </div>
      <ul className="space-y-1.5">
        {doses.map((d) => {
          const st = d.ev?.status === "done" ? "done" : d.ev?.status === "missed" ? "missed" : d.time <= nowHHMM() ? "due" : "later";
          const icon = { done: "✅", missed: "❌", due: "⏰", later: "○" }[st];
          const label = { done: "Đã uống", missed: "Bỏ lỡ", due: "Đến giờ", later: "Chưa tới giờ" }[st];
          return (
            <li key={d.key} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!canEdit || busy === d.key}
                onClick={() => toggle(d)}
                aria-pressed={st === "done"}
                className={`flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${st === "done" ? "border-[var(--good)] bg-[var(--good-soft)]" : st === "missed" ? "border-[var(--danger)]" : st === "due" ? "border-[var(--warning)] bg-[var(--warning-soft)]" : "border-border bg-surface"}`}
              >
                <span aria-hidden>{icon}</span>
                <span className="tabular font-bold">{d.time}</span>
                <span className="min-w-0 flex-1 truncate">
                  {d.med.name}
                  {d.med.dosage ? ` – ${d.med.dosage}` : ""}
                </span>
                <span className="text-xs text-text-2">{canEdit && st !== "done" ? "Bấm khi đã uống" : label}</span>
              </button>
              {android && (
                <a className="btn btn-sm" href={alarmIntentUrl(d.time, `Uống ${d.med.name} – ${member.full_name}`)} title="Đặt báo thức trong ứng dụng Đồng hồ" aria-label={`Đặt báo thức ${d.time}`}>
                  ⏰
                </a>
              )}
            </li>
          );
        })}
      </ul>
      {android && <p className="mt-2 text-xs text-muted">⏰ mở ứng dụng Đồng hồ với giờ điền sẵn – chọn lặp lại hằng ngày rồi Lưu để có chuông báo thức thật.</p>}
      <ErrorText error={error} />
    </div>
  );
}
