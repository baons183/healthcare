"use client";
import { useState } from "react";
import type { Checkup, CheckupKind, Measurement, Member, Pregnancy, Vaccination, Vital } from "@/lib/types";
import { deleteCheckup, saveCheckup } from "@/lib/data";
import { ageInMonths, formatDate, today } from "@/lib/date";
import { CHECKUP_META, PERIODIC_KINDS, PERIODIC_META, checkupStatus, intervalLabel } from "@/lib/checkups";
import { VitalsSection } from "./VitalsSection";
import { PregnancySection } from "./PregnancySection";
import { confirmDelete, ErrorText, Field, Modal } from "./ui";

export function CheckupsTab({
  member,
  checkups,
  vitals,
  pregnancies,
  vaccinations,
  measurements,
  canEdit,
  onChange,
}: {
  member: Member;
  checkups: Checkup[];
  vitals: Vital[];
  pregnancies: Pregnancy[];
  vaccinations: Vaccination[];
  measurements: Measurement[];
  canEdit: boolean;
  onChange: () => void;
}) {
  const age = ageInMonths(member.birth_date);
  const showPregnancy = member.gender === "female" && age >= 15 * 12 && age <= 55 * 12;
  return (
    <div className="space-y-5">
      {showPregnancy && (
        <PregnancySection
          member={member}
          pregnancies={pregnancies}
          checkups={checkups}
          vaccinations={vaccinations}
          measurements={measurements}
          canEdit={canEdit}
          onChange={onChange}
        />
      )}
      <PeriodicCheckups member={member} checkups={checkups} canEdit={canEdit} onChange={onChange} />
      {age >= 18 * 12 && <VitalsSection member={member} vitals={vitals} canEdit={canEdit} onChange={onChange} />}
    </div>
  );
}

function PeriodicCheckups({ member, checkups, canEdit, onChange }: { member: Member; checkups: Checkup[]; canEdit: boolean; onChange: () => void }) {
  const [editing, setEditing] = useState<Partial<Checkup> | null>(null);
  const [open, setOpen] = useState<CheckupKind | null>(null);

  return (
    <section>
      <h3 className="mb-2 text-lg font-bold">Khám định kỳ</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {PERIODIC_KINDS.map((kind) => {
          const st = checkupStatus(kind, member.birth_date, checkups);
          const meta = CHECKUP_META[kind];
          const history = checkups.filter((c) => c.kind === kind).sort((a, b) => b.done_on.localeCompare(a.done_on));
          if (!st) return null;
          const badge = st.soon ? { label: "Sắp tới", cls: "badge-info" } : PERIODIC_META[st.state];
          return (
            <div key={kind} className="card flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold">
                  <span aria-hidden>{meta.icon}</span> {meta.label}
                </p>
                <span className={`badge ${badge.cls}`}>{badge.label}</span>
              </div>
              <p className="mt-1 text-sm text-text-2">
                {st.state === "notyet"
                  ? `Bắt đầu từ ${formatDate(st.nextDate)}`
                  : st.state === "nodata"
                    ? `Nên khám ${intervalLabel(st.intervalMonths)}`
                    : `Lần tới: ${formatDate(st.nextDate)}`}
              </p>
              {st.last && <p className="text-xs text-muted">Lần gần nhất {formatDate(st.last.done_on)}</p>}
              <p className="mt-1 flex-1 text-xs text-muted">{meta.hint}</p>
              <div className="mt-3 flex gap-2">
                {canEdit && st.state !== "notyet" && (
                  <button className="btn btn-sm btn-primary" onClick={() => setEditing({ kind, done_on: today() })}>
                    + Ghi lần khám
                  </button>
                )}
                {history.length > 0 && (
                  <button className="btn btn-sm" onClick={() => setOpen(open === kind ? null : kind)}>
                    Lịch sử ({history.length})
                  </button>
                )}
              </div>
              {open === kind && (
                <ul className="mt-3 divide-y divide-border rounded-xl border border-border text-sm">
                  {history.map((c) => (
                    <li key={c.id}>
                      <button className="w-full px-3 py-2 text-left hover:bg-surface-2" onClick={() => setEditing(c)}>
                        <span className="tabular font-semibold">{formatDate(c.done_on)}</span>
                        {c.facility && <span className="text-text-2"> · {c.facility}</span>}
                        {c.result && <span className="block text-xs text-text-2">{c.result}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <Modal open={!!editing} title={editing ? `${editing.id ? "Sửa" : "Ghi"} ${CHECKUP_META[editing.kind ?? "general"].label.toLowerCase()}` : ""} onClose={() => setEditing(null)}>
        {editing && (
          <CheckupForm
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
    </section>
  );
}

export function CheckupForm({
  member,
  value,
  canEdit,
  onDone,
}: {
  member: Member;
  value: Partial<Checkup>;
  canEdit: boolean;
  onDone: () => void;
}) {
  const [f, setF] = useState<Partial<Checkup>>(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveCheckup({
        id: f.id,
        family_id: member.family_id,
        member_id: member.id,
        kind: f.kind,
        done_on: f.done_on,
        pregnancy_id: f.pregnancy_id ?? null,
        visit_code: f.visit_code ?? null,
        facility: f.facility,
        result: f.result,
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
    if (!f.id || !confirmDelete("lần khám này")) return;
    await deleteCheckup(f.id);
    onDone();
  }

  const placeholder: Record<CheckupKind, string> = {
    dental: "VD: sâu răng 2 cái, đã trám; lấy cao răng",
    eye: "VD: thị lực 10/10 hai mắt; cận 1.5 độ mắt trái",
    general: "VD: mỡ máu hơi cao, men gan bình thường",
    prenatal: "VD: thai 12 tuần, độ mờ da gáy 1.2mm, bình thường",
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={!canEdit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ngày khám *">
            <input className="input" type="date" required max={today()} value={f.done_on ?? ""} onChange={(e) => setF({ ...f, done_on: e.target.value })} />
          </Field>
          <Field label="Nơi khám">
            <input className="input" value={f.facility ?? ""} onChange={(e) => setF({ ...f, facility: e.target.value })} />
          </Field>
        </div>
        <Field label="Kết quả">
          <textarea className="input" rows={3} placeholder={placeholder[f.kind ?? "general"]} value={f.result ?? ""} onChange={(e) => setF({ ...f, result: e.target.value })} />
        </Field>
        <Field label="Ghi chú">
          <input className="input" value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} />
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
