"use client";
import { useRef, useState } from "react";
import type { Member, Vaccination } from "@/lib/types";
import { saveVaccination, uploadDocument } from "@/lib/data";
import { formatDate, today } from "@/lib/date";
import { VACCINE_BY_CODE, VACCINES } from "@/lib/vaccines";
import { ErrorText } from "./ui";

interface Extracted {
  vaccine_code: string;
  vaccine_name: string;
  dose_number: number | null;
  administered_on: string | null;
  facility: string | null;
  lot_number: string | null;
  next_due_on: string | null;
  notes: string | null;
  confidence: "high" | "medium" | "low";
}

interface Row extends Extracted {
  key: number;
  include: boolean;
  duplicate: boolean;
}

type Step = "pick" | "reading" | "review" | "saving";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isDuplicate(r: Extracted, existing: Vaccination[]) {
  return existing.some(
    (v) =>
      v.administered_on === r.administered_on &&
      (r.vaccine_code !== "other"
        ? v.vaccine_code === r.vaccine_code
        : v.vaccine_name.trim().toLowerCase() === r.vaccine_name.trim().toLowerCase()),
  );
}

export function ScanVaccines({
  member,
  existing,
  onDone,
}: {
  member: Member;
  existing: Vaccination[];
  onDone: (saved: number) => void;
}) {
  const [step, setStep] = useState<Step>("pick");
  const [rows, setRows] = useState<Row[]>([]);
  const [warnings, setWarnings] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, 6);
    setError(null);
    setStep("reading");
    try {
      const paths: string[] = [];
      for (const [i, f] of list.entries()) {
        setProgress(`Đang tải ảnh ${i + 1}/${list.length}…`);
        const doc = await uploadDocument(member, f, "vaccination", null);
        paths.push(doc.storage_path);
      }
      setProgress("AI đang đọc sổ tiêm… (khoảng 10–40 giây)");
      const res = await fetch("/api/vaccines/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id, paths }),
      });
      const json = await res.json().catch(() => ({ error: `Lỗi máy chủ (${res.status})` }));
      if (!res.ok) throw new Error(json.error ?? `Lỗi ${res.status}`);
      const recs = (json.records ?? []) as Extracted[];
      setWarnings(json.warnings ?? null);
      setRows(
        recs.map((r, i) => {
          const date = r.administered_on && ISO.test(r.administered_on) ? r.administered_on : null;
          const fixed = { ...r, administered_on: date, next_due_on: r.next_due_on && ISO.test(r.next_due_on) ? r.next_due_on : null };
          const duplicate = isDuplicate(fixed, existing);
          return { ...fixed, key: i, duplicate, include: !duplicate && !!date };
        }),
      );
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("pick");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const selected = rows.filter((r) => r.include);
  const invalid = selected.filter((r) => !r.administered_on || r.administered_on < member.birth_date || r.administered_on > today() || !r.vaccine_name.trim() && r.vaccine_code === "other");

  async function save() {
    if (invalid.length) return setError("Có dòng thiếu/sai ngày tiêm hoặc thiếu tên vắc xin – hãy sửa hoặc bỏ chọn.");
    setStep("saving");
    setError(null);
    try {
      for (const r of selected) {
        const code = r.vaccine_code === "other" ? null : r.vaccine_code;
        await saveVaccination({
          family_id: member.family_id,
          member_id: member.id,
          vaccine_code: code,
          vaccine_name: r.vaccine_name.trim() || (code ? VACCINE_BY_CODE[code].name : ""),
          dose_number: r.dose_number,
          administered_on: r.administered_on!,
          facility: r.facility,
          lot_number: r.lot_number,
          next_due_on: r.next_due_on,
          notes: r.notes ? `${r.notes} (quét từ ảnh)` : "Quét từ ảnh",
        });
      }
      onDone(selected.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("review");
    }
  }

  if (step === "pick" || step === "reading") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-text-2">
          Chụp từng trang sổ tiêm chủng hoặc phiếu tiêm (tối đa 6 ảnh). AI sẽ đọc và điền sẵn các mũi đã tiêm để bạn kiểm tra lại trước khi lưu.
          Ảnh cũng được lưu vào mục <b>Ảnh sổ / phiếu tiêm</b>.
        </p>
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-text-2">
          <li>Chụp thẳng, đủ sáng, không bị lóa, thấy rõ cột ngày tiêm.</li>
          <li>Mỗi ảnh một trang để AI đọc chính xác hơn.</li>
        </ul>
        <button
          type="button"
          className="btn btn-primary w-full py-3"
          disabled={step === "reading"}
          onClick={() => input.current?.click()}
        >
          {step === "reading" ? progress : "📷 Chụp / chọn ảnh sổ tiêm"}
        </button>
        {step === "reading" && <div className="h-1 overflow-hidden rounded bg-surface-2"><div className="h-full w-1/3 animate-pulse rounded bg-primary" /></div>}
        <input ref={input} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
        <ErrorText error={error} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {warnings && <p className="rounded-lg bg-[var(--warning-soft)] px-3 py-2 text-sm text-warning">⚠ {warnings}</p>}
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-2">Không tìm thấy mũi tiêm nào trong ảnh. Hãy thử ảnh rõ hơn hoặc nhập tay.</p>
      ) : (
        <>
          <p className="text-sm text-text-2">
            Tìm thấy <b>{rows.length}</b> mũi. Kiểm tra và sửa nếu cần – dòng <span className="font-semibold text-warning">viền vàng</span> là AI không chắc chắn.
          </p>
          <div className="space-y-2">
            {rows.map((r) => (
              <RowEditor key={r.key} row={r} member={member} onChange={(p) => update(r.key, p)} />
            ))}
          </div>
        </>
      )}
      <ErrorText error={error} />
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="btn" onClick={() => { setRows([]); setStep("pick"); }} disabled={step === "saving"}>
          Quét ảnh khác
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={step === "saving" || selected.length === 0}>
          {step === "saving" ? "Đang lưu…" : `Lưu ${selected.length} mũi`}
        </button>
      </div>
    </div>
  );
}

function RowEditor({ row: r, member, onChange }: { row: Row; member: Member; onChange: (p: Partial<Row>) => void }) {
  const border = r.confidence === "low" ? "border-[var(--warning)]" : r.confidence === "medium" ? "border-[var(--warning)]/50" : "border-border";
  return (
    <div className={`rounded-xl border-2 p-3 ${border} ${r.include ? "" : "opacity-55"}`}>
      <div className="mb-2 flex items-center gap-2">
        <input type="checkbox" checked={r.include} onChange={(e) => onChange({ include: e.target.checked })} aria-label="Chọn lưu dòng này" className="h-4 w-4" />
        <span className="flex-1 truncate text-sm font-semibold">
          {r.vaccine_code !== "other" ? VACCINE_BY_CODE[r.vaccine_code]?.name : r.vaccine_name || "Vắc xin khác"}
          {r.administered_on && <span className="font-normal text-text-2"> · {formatDate(r.administered_on)}</span>}
        </span>
        {r.duplicate && <span className="badge badge-muted">Đã có</span>}
        {r.confidence !== "high" && <span className="badge badge-warning">{r.confidence === "low" ? "Không chắc" : "Kiểm tra"}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <select className="input col-span-2 py-1.5 text-sm" value={r.vaccine_code} onChange={(e) => onChange({ vaccine_code: e.target.value })} aria-label="Phòng bệnh">
          {VACCINES.map((v) => (
            <option key={v.code} value={v.code}>
              {v.name}
            </option>
          ))}
          <option value="other">Khác</option>
        </select>
        <input className="input col-span-2 py-1.5 text-sm" value={r.vaccine_name} placeholder="Tên vắc xin" onChange={(e) => onChange({ vaccine_name: e.target.value })} aria-label="Tên vắc xin" />
        <input className="input py-1.5 text-sm" type="number" min={1} value={r.dose_number ?? ""} placeholder="Mũi" onChange={(e) => onChange({ dose_number: e.target.value ? Number(e.target.value) : null })} aria-label="Mũi số" />
        <input className="input py-1.5 text-sm" type="date" min={member.birth_date} max={today()} value={r.administered_on ?? ""} onChange={(e) => onChange({ administered_on: e.target.value || null })} aria-label="Ngày tiêm" />
        <input className="input col-span-2 py-1.5 text-sm sm:col-span-3" value={r.facility ?? ""} placeholder="Nơi tiêm" onChange={(e) => onChange({ facility: e.target.value || null })} aria-label="Nơi tiêm" />
        <input className="input col-span-2 py-1.5 text-sm sm:col-span-3" value={r.lot_number ?? ""} placeholder="Số lô" onChange={(e) => onChange({ lot_number: e.target.value || null })} aria-label="Số lô" />
      </div>
      {r.notes && <p className="mt-1.5 text-xs text-text-2">📝 {r.notes}</p>}
    </div>
  );
}
