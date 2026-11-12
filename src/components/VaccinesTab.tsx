"use client";
import { useMemo, useState } from "react";
import type { Member, Vaccination } from "@/lib/types";
import { deleteVaccination, saveVaccination } from "@/lib/data";
import { formatAgeMonths, formatDate, today } from "@/lib/date";
import { buildSchedule, STATUS_META, VACCINE_BY_CODE, VACCINES, type DoseStatus, type ScheduledDose } from "@/lib/vaccines";
import { Attachments } from "./Attachments";
import { ScanVaccines } from "./ScanVaccines";
import { confirmDelete, ErrorText, Field, Modal } from "./ui";

type Filter = "todo" | "all" | "done" | "upcoming" | "due" | "overdue";

export function VaccinesTab({
  member,
  vaccinations,
  canEdit,
  onChange,
}: {
  member: Member;
  vaccinations: Vaccination[];
  canEdit: boolean;
  onChange: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("todo");
  const [showService, setShowService] = useState(true);
  const [editing, setEditing] = useState<Partial<Vaccination> | null>(null);
  const [scanning, setScanning] = useState(false);
  const [docsKey, setDocsKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const schedule = useMemo(() => buildSchedule(member.birth_date, vaccinations), [member.birth_date, vaccinations]);
  // "Sắp tới" = các mũi đến hạn trong 12 tháng tới (để danh sách gọn)
  const horizon = addYear(today());
  const isSoon = (d: ScheduledDose) => d.status === "upcoming" && d.dueDate <= horizon;
  const shown = schedule.filter((d) => showService || d.vaccine.program !== "service" || d.status === "done");
  const counts = useMemo(() => {
    const c: Record<DoseStatus, number> = { done: 0, due: 0, overdue: 0, upcoming: 0, expired: 0, unknown: 0 };
    shown.forEach((d) => (d.status !== "upcoming" || isSoon(d)) && c[d.status]++);
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, showService]);

  const visible = shown.filter((d) => {
    switch (filter) {
      case "todo":
        return d.status === "overdue" || d.status === "due" || isSoon(d);
      case "upcoming":
        return isSoon(d);
      case "due":
      case "overdue":
      case "done":
        return d.status === filter;
      default:
        return true;
    }
  });

  // "Cần tiêm": hiện mũi đến hạn & sắp tới trước, quá hạn (thường là chưa ghi nhận) sau
  const sections: [string | null, ScheduledDose[]][] =
    filter === "todo"
      ? [
          ["Đến hạn & sắp tới (12 tháng)", visible.filter((d) => d.status !== "overdue")],
          ["Quá hạn – chưa ghi nhận", visible.filter((d) => d.status === "overdue")],
        ]
      : [[null, visible]];
  const empty = visible.length === 0;
  const toggle = (f: Filter) => setFilter((cur) => (cur === f ? "todo" : f));
  const others = vaccinations.filter((v) => !v.vaccine_code);

  const record = (d: ScheduledDose) =>
    setEditing(
      d.record ?? {
        vaccine_code: d.vaccine.code,
        vaccine_name: "",
        dose_number: d.doseIndex,
        administered_on: d.dueDate < today() ? today() : d.dueDate,
      },
    );

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Count label="Đã tiêm" value={counts.done} cls="text-good" active={filter === "done"} onClick={() => toggle("done")} />
        <Count label="Sắp tới (12 tháng)" value={counts.upcoming} cls="text-info" active={filter === "upcoming"} onClick={() => toggle("upcoming")} />
        <Count label="Đến hạn" value={counts.due} cls="text-warning" active={filter === "due"} onClick={() => toggle("due")} />
        <Count label="Quá hạn" value={counts.overdue} cls="text-danger" active={filter === "overdue"} onClick={() => toggle("overdue")} />
      </section>
      {counts.overdue > 5 && counts.done === 0 && (
        <p className="rounded-lg bg-[var(--info-soft)] px-3 py-2 text-sm text-info">
          Nhiều mũi đang “quá hạn” vì chưa có dữ liệu. Nếu bé đã tiêm đủ, hãy dùng <b>Quét sổ tiêm bằng AI</b> để nhập nhanh từ sổ.
        </p>
      )}

      {notice && <p className="rounded-lg bg-[var(--good-soft)] px-3 py-2 text-sm text-good">{notice}</p>}

      <section className="card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold">Ảnh sổ / phiếu tiêm chủng</h3>
            <p className="text-xs text-muted">Chụp lại để không lo mất giấy – AI có thể đọc và điền sẵn các mũi đã tiêm</p>
          </div>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setScanning(true)}>
              ✨ Quét sổ tiêm bằng AI
            </button>
          )}
        </div>
        <Attachments key={docsKey} member={member} refType="vaccination" refId={null} canEdit={canEdit} />
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-lg font-bold">Lịch tiêm</h3>
          <div className="flex gap-1 rounded-xl bg-surface-2 p-1 text-sm font-semibold">
            {(
              [
                ["todo", "Cần tiêm"],
                ["all", "Tất cả"],
                ["done", "Đã tiêm"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={`rounded-lg px-3 py-1 ${filter === k ? "bg-surface shadow-sm" : "text-text-2"}`}>
                {l}
              </button>
            ))}
          </div>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setEditing({ administered_on: today(), vaccine_name: "" })}>
              + Ghi mũi tiêm
            </button>
          )}
        </div>
        <label className="mb-3 flex items-center gap-2 text-sm text-text-2">
          <input type="checkbox" checked={showService} onChange={(e) => setShowService(e.target.checked)} />
          Hiện vắc xin dịch vụ (ngoài chương trình TCMR)
        </label>

        {empty ? (
          <p className="card p-6 text-center text-sm text-text-2">
            {filter === "todo" || filter === "upcoming" ? "Không có mũi nào cần tiêm trong 12 tháng tới. 🎉" : "Không có mục nào."}
          </p>
        ) : (
          <div className="space-y-6">
            {sections.map(([title, doses]) =>
              doses.length === 0 ? null : (
                <div key={title ?? "all"} className="space-y-4">
                  {title && <h4 className="text-base font-bold">{title} <span className="font-normal text-muted">· {doses.length}</span></h4>}
                  {groupByAge(doses).map(([label, ds]) => (
                    <div key={label}>
                      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
                      <div className="card divide-y divide-border">
                        {ds.map((d, i) => (
                          <DoseRow key={`${d.vaccine.code}-${d.doseIndex}-${i}`} d={d} canEdit={canEdit} onClick={() => record(d)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ),
            )}
          </div>
        )}
      </section>

      {others.length > 0 && filter !== "todo" && (
        <section>
          <h3 className="mb-2 text-lg font-bold">Vắc xin khác</h3>
          <div className="card divide-y divide-border">
            {others.map((v) => (
              <button key={v.id} className="flex w-full items-center gap-3 p-3 text-left hover:bg-surface-2" onClick={() => setEditing(v)}>
                <span className="badge badge-good">✓</span>
                <span className="flex-1">
                  <span className="font-semibold">{v.vaccine_name}</span>
                  {v.dose_number ? ` · Mũi ${v.dose_number}` : ""}
                  <span className="block text-xs text-text-2">
                    {formatDate(v.administered_on)} {v.facility && `· ${v.facility}`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-muted">
        Lịch tiêm mang tính tham khảo theo khuyến cáo TCMR Việt Nam và các vắc xin dịch vụ phổ biến. Lịch thực tế có thể thay đổi theo
        loại vắc xin và chỉ định của bác sĩ.
      </p>

      <Modal
        open={scanning}
        title="Quét sổ tiêm bằng AI"
        onClose={() => {
          setScanning(false);
          setDocsKey((k) => k + 1);
        }}
        wide
      >
        {scanning && (
          <ScanVaccines
            member={member}
            existing={vaccinations}
            onDone={(n) => {
              setScanning(false);
              setDocsKey((k) => k + 1);
              setFilter("done");
              setNotice(`Đã lưu ${n} mũi tiêm từ ảnh. Bạn có thể bấm vào từng mũi để sửa.`);
              onChange();
            }}
          />
        )}
      </Modal>

      <Modal open={!!editing} title={editing?.id ? "Chi tiết mũi tiêm" : "Ghi nhận mũi tiêm"} onClose={() => setEditing(null)} wide>
        {editing && (
          <VaccinationForm
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

function addYear(d: string) {
  return `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;
}

function groupByAge(doses: ScheduledDose[]): [string, ScheduledDose[]][] {
  const map = new Map<string, ScheduledDose[]>();
  for (const d of doses) {
    const label = d.status === "done" && d.record ? `Mốc ${formatAgeMonths(Math.round(d.dueAgeMonths))}` : `Mốc ${formatAgeMonths(d.dueAgeMonths)}`;
    const key = d.dueAgeMonths >= 228 ? "Người lớn" : label;
    map.set(key, [...(map.get(key) ?? []), d]);
  }
  return [...map.entries()];
}

function Count({
  label,
  value,
  cls,
  active,
  onClick,
}: {
  label: string;
  value: number;
  cls: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`card p-3 text-center transition hover:border-primary ${active ? "border-primary ring-2 ring-[var(--primary-soft)]" : ""}`}
    >
      <p className={`tabular text-2xl font-bold ${value ? cls : "text-muted"}`}>{value}</p>
      <p className="text-xs text-text-2">{label}</p>
    </button>
  );
}

function DoseRow({ d, canEdit, onClick }: { d: ScheduledDose; canEdit: boolean; onClick: () => void }) {
  const s = STATUS_META[d.status];
  const clickable = canEdit || d.record;
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      className="flex w-full items-center gap-3 p-3 text-left hover:bg-surface-2 disabled:hover:bg-transparent"
    >
      <span className={`badge ${s.cls} h-7 w-7 shrink-0 justify-center p-0`} aria-hidden>
        {s.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{d.vaccine.name}</span>
        <span className="text-text-2"> · {d.label}</span>
        {d.vaccine.program === "tcmr" && <span className="badge badge-info ml-1.5 align-middle text-[10px]">TCMR</span>}
        <span className="block text-xs text-text-2">
          {d.record
            ? `${formatDate(d.record.administered_on)} · ${d.record.vaccine_name}${d.record.facility ? ` · ${d.record.facility}` : ""}`
            : `${d.status === "unknown" ? "Mốc" : "Dự kiến"} ${formatDate(d.dueDate)}${d.note ? ` · ${d.note}` : ""}`}
        </span>
      </span>
      <span className={`badge ${s.cls} hidden sm:inline-flex`}>{s.label}</span>
    </button>
  );
}

function VaccinationForm({
  member,
  value,
  canEdit,
  onDone,
}: {
  member: Member;
  value: Partial<Vaccination>;
  canEdit: boolean;
  onDone: () => void;
}) {
  const [f, setF] = useState<Partial<Vaccination>>(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const spec = f.vaccine_code ? VACCINE_BY_CODE[f.vaccine_code] : undefined;
  const set = <K extends keyof Vaccination>(k: K, v: Vaccination[K] | null) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = f.vaccine_name?.trim() || spec?.name;
    if (!name) return setError("Nhập tên vắc xin.");
    setBusy(true);
    setError(null);
    try {
      await saveVaccination({
        id: f.id,
        family_id: member.family_id,
        member_id: member.id,
        vaccine_code: f.vaccine_code || null,
        vaccine_name: name,
        dose_number: f.dose_number ? Number(f.dose_number) : null,
        administered_on: f.administered_on,
        facility: f.facility,
        lot_number: f.lot_number,
        next_due_on: f.next_due_on || null,
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
    if (!f.id || !confirmDelete("mũi tiêm này")) return;
    await deleteVaccination(f.id);
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={!canEdit} className="space-y-4">
        <Field label="Phòng bệnh *">
          <select className="input" value={f.vaccine_code ?? ""} onChange={(e) => set("vaccine_code", e.target.value || null)}>
            <option value="">Khác (tự nhập)</option>
            {VACCINES.map((v) => (
              <option key={v.code} value={v.code}>
                {v.name} – {v.diseases}
              </option>
            ))}
          </select>
        </Field>
        {spec?.note && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-text-2">{spec.note}</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Field label={spec ? "Tên vắc xin (thương mại)" : "Tên vắc xin *"}>
              <input
                className="input"
                list="vaccine-brands"
                value={f.vaccine_name ?? ""}
                placeholder={spec?.brands[0] ?? "VD: Vaxigrip Tetra"}
                onChange={(e) => set("vaccine_name", e.target.value)}
              />
              <datalist id="vaccine-brands">
                {(spec?.brands ?? VACCINES.flatMap((v) => v.brands)).map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </Field>
          </div>
          <Field label="Mũi số">
            <input className="input" type="number" min={1} max={20} value={f.dose_number ?? ""} onChange={(e) => set("dose_number", e.target.value ? Number(e.target.value) : null)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ngày tiêm *">
            <input className="input" type="date" required min={member.birth_date} max={today()} value={f.administered_on ?? ""} onChange={(e) => set("administered_on", e.target.value)} />
          </Field>
          <Field label="Hẹn mũi tiếp theo" hint="Nếu cơ sở tiêm có hẹn">
            <input className="input" type="date" value={f.next_due_on ?? ""} onChange={(e) => set("next_due_on", e.target.value || null)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nơi tiêm">
            <input className="input" value={f.facility ?? ""} onChange={(e) => set("facility", e.target.value)} placeholder="VD: VNVC Hoàng Văn Thụ, Trạm y tế phường…" />
          </Field>
          <Field label="Số lô">
            <input className="input" value={f.lot_number ?? ""} onChange={(e) => set("lot_number", e.target.value)} />
          </Field>
        </div>
        <Field label="Ghi chú / phản ứng sau tiêm">
          <textarea className="input" rows={2} value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="VD: sốt nhẹ 1 ngày" />
        </Field>
      </fieldset>

      {f.id ? (
        <div>
          <span className="label">Ảnh giấy chứng nhận / phiếu tiêm</span>
          <Attachments member={member} refType="vaccination" refId={f.id} canEdit={canEdit} compact />
        </div>
      ) : (
        <p className="text-xs text-muted">Lưu xong có thể mở lại để đính kèm ảnh phiếu tiêm.</p>
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
