"use client";
import { useState } from "react";
import type { Deworming, Member } from "@/lib/types";
import { deleteDeworming, saveDeworming } from "@/lib/data";
import { ageInMonths, formatAge, formatDate, today } from "@/lib/date";
import { DEWORM_MEDICINES, DEWORM_META, dewormStatus, suggestedDose } from "@/lib/deworming";
import { confirmDelete, ErrorText, Field, Modal } from "./ui";

export function DewormingSection({
  member,
  records,
  canEdit,
  onChange,
}: {
  member: Member;
  records: Deworming[];
  canEdit: boolean;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<Partial<Deworming> | null>(null);
  const [showAll, setShowAll] = useState(false);
  const st = dewormStatus(member.birth_date, records);
  const meta = DEWORM_META[st.state];
  const sorted = [...records].sort((a, b) => b.given_on.localeCompare(a.given_on));
  const list = showAll ? sorted : sorted.slice(0, 3);

  const headline =
    st.state === "notyet"
      ? `Bắt đầu xổ giun từ 12 tháng tuổi – ngày ${formatDate(st.nextDate)}`
      : st.state === "nodata"
        ? `Chưa ghi nhận lần xổ giun nào. Nên xổ giun ${st.intervalMonths} tháng/lần.`
        : `Lần tới: ${formatDate(st.nextDate)} · ${st.intervalMonths} tháng/lần`;

  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold">🪱 Lịch xổ giun</h3>
            <span className={`badge ${st.soon ? "badge-info" : meta.cls}`}>{st.soon ? "Sắp tới" : meta.label}</span>
          </div>
          <p className="mt-0.5 text-sm text-text-2">{headline}</p>
        </div>
        {canEdit && st.state !== "notyet" && (
          <button className="btn btn-primary" onClick={() => setEditing({ given_on: today() })}>
            + Ghi lần xổ giun
          </button>
        )}
      </div>

      {sorted.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border text-sm">
          {list.map((r) => (
            <li key={r.id}>
              <button className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2" onClick={() => setEditing(r)}>
                <span className="badge badge-good" aria-hidden>✓</span>
                <span className="tabular">{formatDate(r.given_on)}</span>
                <span className="flex-1 truncate text-text-2">{r.medicine ?? ""}</span>
                <span className="text-xs text-muted">{formatAge(member.birth_date, r.given_on)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {sorted.length > 3 && (
        <button className="mt-2 text-sm text-primary underline" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Thu gọn" : `Xem tất cả ${sorted.length} lần`}
        </button>
      )}
      <p className="mt-2 text-xs text-muted">{suggestedDose(ageInMonths(member.birth_date))} Tham khảo ý kiến bác sĩ/dược sĩ.</p>

      <Modal open={!!editing} title={editing?.id ? "Sửa lần xổ giun" : "Ghi lần xổ giun"} onClose={() => setEditing(null)}>
        {editing && (
          <DewormForm
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

function DewormForm({ member, value, canEdit, onDone }: { member: Member; value: Partial<Deworming>; canEdit: boolean; onDone: () => void }) {
  const [f, setF] = useState<Partial<Deworming>>(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveDeworming({
        id: f.id,
        family_id: member.family_id,
        member_id: member.id,
        given_on: f.given_on,
        medicine: f.medicine,
        notes: f.notes,
      });
      onDone();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes("dewormings") ? "Chưa tạo bảng xổ giun – hãy chạy file SQL 0003_deworming.sql trong Supabase." : msg);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!f.id || !confirmDelete("lần xổ giun này")) return;
    await deleteDeworming(f.id);
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={!canEdit} className="space-y-4">
        <Field label="Ngày uống thuốc *">
          <input className="input" type="date" required min={member.birth_date} max={today()} value={f.given_on ?? ""} onChange={(e) => setF({ ...f, given_on: e.target.value })} />
        </Field>
        <Field label="Thuốc" hint={suggestedDose(ageInMonths(member.birth_date, f.given_on || today()))}>
          <input className="input" list="deworm-meds" value={f.medicine ?? ""} placeholder="VD: Albendazole 400mg" onChange={(e) => setF({ ...f, medicine: e.target.value })} />
          <datalist id="deworm-meds">
            {DEWORM_MEDICINES.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
        <Field label="Ghi chú">
          <input className="input" value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="VD: xổ giun ở trường" />
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
