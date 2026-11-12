"use client";
import { useState } from "react";
import type { Illness, Medication, Member } from "@/lib/types";
import { deleteMedication, saveMedication } from "@/lib/data";
import { addDays, daysBetween, formatDate, today } from "@/lib/date";
import { isActive, medicationSummary, sortTimes, TIME_PRESETS } from "@/lib/medications";
import { TodayDoses } from "./TodayDoses";
import { confirmDelete, ErrorText, Field, Modal } from "./ui";

export function MedicationSection({
  member,
  medications,
  illnesses,
  canEdit,
  onChange,
}: {
  member: Member;
  medications: Medication[];
  illnesses: Illness[];
  canEdit: boolean;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<Partial<Medication> | null>(null);
  const [showPast, setShowPast] = useState(false);
  const active = medications.filter((m) => isActive(m) || m.start_on > today());
  const past = medications.filter((m) => !active.includes(m));
  const ongoing = illnesses.find((i) => !i.ended_on);

  const row = (m: Medication) => (
    <li key={m.id}>
      <button className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-surface-2" onClick={() => setEditing(m)}>
        <span aria-hidden className="pt-0.5">💊</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">
            {m.name}
            {m.remind && m.times.length > 0 && isActive(m) && <span className="ml-2 text-xs font-normal text-primary">🔔 nhắc</span>}
          </span>
          <span className="block text-sm text-text-2">{medicationSummary(m)}</span>
          {m.notes && <span className="block text-xs text-muted">{m.notes}</span>}
        </span>
        <span className="text-xs text-muted">
          {formatDate(m.start_on)}
          {m.end_on ? ` – ${formatDate(m.end_on)}` : ""}
        </span>
      </button>
    </li>
  );

  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-bold">💊 Thuốc đang dùng</h3>
          <p className="text-sm text-text-2">Đặt giờ uống để nhận thông báo nhắc trên điện thoại.</p>
        </div>
        {canEdit && (
          <button
            className="btn btn-primary"
            onClick={() => setEditing({ start_on: today(), end_on: addDays(today(), 4), times: ["07:00", "20:00"], remind: true, illness_id: ongoing?.id ?? null })}
          >
            + Thêm thuốc
          </button>
        )}
      </div>
      <TodayDoses member={member} medications={medications} canEdit={canEdit} />
      {active.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-text-2">Không có thuốc nào đang dùng.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">{active.map(row)}</ul>
      )}
      {past.length > 0 && (
        <>
          <button className="mt-2 text-sm text-primary underline" onClick={() => setShowPast((v) => !v)}>
            {showPast ? "Ẩn thuốc đã dùng xong" : `Thuốc đã dùng xong (${past.length})`}
          </button>
          {showPast && <ul className="mt-2 divide-y divide-border rounded-xl border border-border opacity-80">{past.map(row)}</ul>}
        </>
      )}

      <Modal open={!!editing} title={editing?.id ? "Sửa thuốc" : "Thêm thuốc"} onClose={() => setEditing(null)}>
        {editing && (
          <MedForm
            member={member}
            value={editing}
            illnesses={illnesses}
            canEdit={canEdit}
            onDone={() => {
              setEditing(null);
              onChange();
            }}
          />
        )}
      </Modal>
    </section>
  );
}

function MedForm({
  member,
  value,
  illnesses,
  canEdit,
  onDone,
}: {
  member: Member;
  value: Partial<Medication>;
  illnesses: Illness[];
  canEdit: boolean;
  onDone: () => void;
}) {
  const [f, setF] = useState<Partial<Medication>>(value);
  const [longTerm, setLongTerm] = useState(!!value.id && !value.end_on);
  const [newTime, setNewTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const times = sortTimes(f.times ?? []);
  const days = f.start_on && f.end_on ? daysBetween(f.start_on, f.end_on) + 1 : null;

  const toggleTime = (t: string) => setF({ ...f, times: times.includes(t) ? times.filter((x) => x !== t) : sortTimes([...times, t]) });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!longTerm && f.end_on && f.start_on && f.end_on < f.start_on) throw new Error("Ngày kết thúc phải sau ngày bắt đầu.");
      await saveMedication({
        id: f.id,
        family_id: member.family_id,
        member_id: member.id,
        illness_id: f.illness_id || null,
        name: f.name?.trim(),
        dosage: f.dosage,
        times,
        start_on: f.start_on,
        end_on: longTerm ? null : f.end_on,
        remind: f.remind ?? true,
        notes: f.notes,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!f.id || !confirmDelete("thuốc này")) return;
    await deleteMedication(f.id);
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={!canEdit} className="space-y-4">
        <Field label="Tên thuốc *">
          <input className="input" required autoFocus={!f.id} placeholder="VD: Augmentin 250mg" value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Liều mỗi lần">
          <input className="input" placeholder="VD: 1 gói, 5ml, 1 viên" value={f.dosage ?? ""} onChange={(e) => setF({ ...f, dosage: e.target.value })} />
        </Field>
        <div>
          <span className="label">Giờ uống</span>
          <div className="flex flex-wrap gap-1.5">
            {TIME_PRESETS.map((p) => (
              <button
                key={p.time}
                type="button"
                className={`btn btn-sm ${times.includes(p.time) ? "btn-primary" : ""}`}
                aria-pressed={times.includes(p.time)}
                onClick={() => toggleTime(p.time)}
              >
                {p.label} {p.time}
              </button>
            ))}
            {times
              .filter((t) => !TIME_PRESETS.some((p) => p.time === t))
              .map((t) => (
                <button key={t} type="button" className="btn btn-sm btn-primary" onClick={() => toggleTime(t)} aria-label={`Bỏ giờ ${t}`}>
                  {t} ✕
                </button>
              ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input className="input w-auto" type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} aria-label="Giờ khác" />
            <button
              type="button"
              className="btn btn-sm"
              disabled={!newTime}
              onClick={() => {
                toggleTime(newTime);
                setNewTime("");
              }}
            >
              + Thêm giờ
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bắt đầu">
            <input className="input" type="date" required value={f.start_on ?? ""} onChange={(e) => setF({ ...f, start_on: e.target.value })} />
          </Field>
          <Field label={days ? `Kết thúc (${days} ngày)` : "Kết thúc"}>
            <input className="input" type="date" disabled={longTerm} required={!longTerm} value={longTerm ? "" : (f.end_on ?? "")} onChange={(e) => setF({ ...f, end_on: e.target.value })} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {[3, 5, 7, 10, 14].map((n) => (
            <button key={n} type="button" className="btn btn-sm" onClick={() => { setLongTerm(false); setF({ ...f, end_on: addDays(f.start_on || today(), n - 1) }); }}>
              {n} ngày
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={longTerm} onChange={(e) => setLongTerm(e.target.checked)} />
            Dùng lâu dài
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={f.remind ?? true} onChange={(e) => setF({ ...f, remind: e.target.checked })} />
          🔔 Nhắc giờ uống thuốc (thông báo trên điện thoại)
        </label>
        {illnesses.length > 0 && (
          <Field label="Điều trị cho đợt ốm">
            <select className="input" value={f.illness_id ?? ""} onChange={(e) => setF({ ...f, illness_id: e.target.value || null })}>
              <option value="">— Không —</option>
              {illnesses.slice(0, 10).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({formatDate(i.started_on)})
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Ghi chú">
          <input className="input" placeholder="VD: uống sau ăn, lắc đều" value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </fieldset>
      <ErrorText error={error} />
      {canEdit && (
        <div className="flex justify-between gap-2">
          {f.id ? (
            <button type="button" className="btn btn-danger" onClick={onDelete}>
              Xóa
            </button>
          ) : (
            <span />
          )}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      )}
    </form>
  );
}
