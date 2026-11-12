"use client";
import { useState } from "react";
import type { Illness, Member, Severity } from "@/lib/types";
import { deleteIllness, saveIllness } from "@/lib/data";
import { daysBetween, formatDate, today } from "@/lib/date";
import { Attachments } from "./Attachments";
import { confirmDelete, Empty, ErrorText, Field, Modal } from "./ui";

const SEVERITY: Record<Severity, { label: string; cls: string }> = {
  mild: { label: "Nhẹ", cls: "badge-good" },
  moderate: { label: "Trung bình", cls: "badge-warning" },
  severe: { label: "Nặng", cls: "badge-danger" },
};

const COMMON = ["Sốt", "Cảm cúm", "Viêm họng", "Viêm phế quản", "Viêm phổi", "Viêm tai giữa", "Tiêu chảy", "Sốt xuất huyết", "Tay chân miệng", "Thủy đậu", "Dị ứng", "Khám định kỳ"];

export function IllnessTab({
  member,
  illnesses,
  canEdit,
  onChange,
}: {
  member: Member;
  illnesses: Illness[];
  canEdit: boolean;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<Partial<Illness> | null>(null);
  const [q, setQ] = useState("");
  const list = illnesses
    .filter((i) => !q || `${i.name} ${i.symptoms ?? ""} ${i.diagnosis ?? ""} ${i.treatment ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.started_on.localeCompare(a.started_on));

  const byYear = new Map<string, Illness[]>();
  list.forEach((i) => byYear.set(i.started_on.slice(0, 4), [...(byYear.get(i.started_on.slice(0, 4)) ?? []), i]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-xs flex-1" placeholder="Tìm bệnh, triệu chứng, thuốc…" value={q} onChange={(e) => setQ(e.target.value)} />
        {canEdit && (
          <button className="btn btn-primary ml-auto" onClick={() => setEditing({ started_on: today(), severity: "mild" })}>
            + Thêm lần ốm / khám
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <Empty title={q ? "Không tìm thấy" : "Chưa có bệnh sử"}>Ghi lại mỗi lần ốm, đi khám: triệu chứng, chẩn đoán, thuốc đã dùng – rất hữu ích cho bác sĩ ở lần khám sau.</Empty>
      ) : (
        [...byYear.entries()].map(([year, items]) => (
          <section key={year}>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">
              Năm {year} · {items.length} lần
            </p>
            <div className="card divide-y divide-border">
              {items.map((i) => {
                const ongoing = !i.ended_on;
                const days = daysBetween(i.started_on, i.ended_on ?? today()) + 1;
                return (
                  <button key={i.id} className="block w-full p-4 text-left hover:bg-surface-2" onClick={() => setEditing(i)}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{i.name}</span>
                      <span className={`badge ${SEVERITY[i.severity].cls}`}>{SEVERITY[i.severity].label}</span>
                      {ongoing && <span className="badge badge-warning">Đang điều trị</span>}
                      <span className="ml-auto text-xs text-text-2">
                        {formatDate(i.started_on)}
                        {i.ended_on && i.ended_on !== i.started_on ? ` – ${formatDate(i.ended_on)}` : ""} · {days} ngày
                      </span>
                    </div>
                    {(i.diagnosis || i.symptoms) && <p className="mt-1 text-sm text-text-2">{i.diagnosis || i.symptoms}</p>}
                    {i.treatment && <p className="mt-0.5 text-sm text-text-2">💊 {i.treatment}</p>}
                    {i.facility && <p className="mt-0.5 text-xs text-muted">🏥 {i.facility}{i.doctor ? ` · BS ${i.doctor}` : ""}</p>}
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}

      <Modal open={!!editing} title={editing?.id ? "Chi tiết bệnh sử" : "Thêm bệnh sử"} onClose={() => setEditing(null)} wide>
        {editing && (
          <IllnessForm
            member={member}
            value={editing}
            canEdit={canEdit}
            onDone={() => {
              setEditing(null);
              onChange();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function IllnessForm({ member, value, canEdit, onDone }: { member: Member; value: Partial<Illness>; canEdit: boolean; onDone: () => void }) {
  const [f, setF] = useState<Partial<Illness>>(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Illness>(k: K, v: Illness[K] | null) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.ended_on && f.started_on && f.ended_on < f.started_on) return setError("Ngày khỏi phải sau ngày bắt đầu.");
    setBusy(true);
    setError(null);
    try {
      await saveIllness({
        id: f.id,
        family_id: member.family_id,
        member_id: member.id,
        name: f.name?.trim(),
        started_on: f.started_on,
        ended_on: f.ended_on || null,
        severity: f.severity ?? "mild",
        symptoms: f.symptoms,
        diagnosis: f.diagnosis,
        treatment: f.treatment,
        facility: f.facility,
        doctor: f.doctor,
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
    if (!f.id || !confirmDelete("bệnh sử này")) return;
    await deleteIllness(f.id);
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={!canEdit} className="space-y-4">
        <Field label="Tên bệnh / lý do khám *">
          <input className="input" required list="common-illness" value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} />
          <datalist id="common-illness">
            {COMMON.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Bắt đầu *">
            <input className="input" type="date" required min={member.birth_date} max={today()} value={f.started_on ?? ""} onChange={(e) => set("started_on", e.target.value)} />
          </Field>
          <Field label="Khỏi bệnh" hint="Để trống nếu chưa khỏi">
            <input className="input" type="date" min={f.started_on} max={today()} value={f.ended_on ?? ""} onChange={(e) => set("ended_on", e.target.value || null)} />
          </Field>
          <Field label="Mức độ">
            <select className="input" value={f.severity ?? "mild"} onChange={(e) => set("severity", e.target.value as Severity)}>
              {Object.entries(SEVERITY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Triệu chứng">
          <textarea className="input" rows={2} value={f.symptoms ?? ""} onChange={(e) => set("symptoms", e.target.value)} placeholder="VD: sốt 39°C, ho, sổ mũi" />
        </Field>
        <Field label="Chẩn đoán của bác sĩ">
          <input className="input" value={f.diagnosis ?? ""} onChange={(e) => set("diagnosis", e.target.value)} />
        </Field>
        <Field label="Thuốc / điều trị">
          <textarea className="input" rows={2} value={f.treatment ?? ""} onChange={(e) => set("treatment", e.target.value)} placeholder="VD: Hapacol 250mg x 3 lần/ngày, 3 ngày" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nơi khám">
            <input className="input" value={f.facility ?? ""} onChange={(e) => set("facility", e.target.value)} />
          </Field>
          <Field label="Bác sĩ">
            <input className="input" value={f.doctor ?? ""} onChange={(e) => set("doctor", e.target.value)} />
          </Field>
        </div>
        <Field label="Ghi chú">
          <textarea className="input" rows={2} value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </fieldset>

      {f.id ? (
        <div>
          <span className="label">Đơn thuốc, kết quả xét nghiệm…</span>
          <Attachments member={member} refType="illness" refId={f.id} canEdit={canEdit} compact />
        </div>
      ) : (
        <p className="text-xs text-muted">Lưu xong có thể mở lại để đính kèm ảnh đơn thuốc, kết quả xét nghiệm.</p>
      )}

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
