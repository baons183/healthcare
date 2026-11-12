"use client";
import { useState } from "react";
import type { Measurement, Member } from "@/lib/types";
import { deleteMeasurement, saveMeasurement } from "@/lib/data";
import { ageInMonths, formatAge, formatDate, today } from "@/lib/date";
import { ADULT_MONTHS, assessMeasurement, INDICATORS, maxMonths, type Indicator } from "@/lib/growth";
import { AdultChart, GrowthChart, type RangeKey } from "./GrowthChart";
import { confirmDelete, Empty, ErrorText, Field, LevelBadge, Modal } from "./ui";

export function GrowthTab({
  member,
  measurements,
  canEdit,
  onChange,
}: {
  member: Member;
  measurements: Measurement[];
  canEdit: boolean;
  onChange: () => void;
}) {
  const age = ageInMonths(member.birth_date);
  const isAdult = age >= ADULT_MONTHS;
  const indicators: Indicator[] = isAdult
    ? ["weight", "bmi", "height"]
    : (["weight", "height", "bmi", "head"] as Indicator[]).filter((i) => i !== "head" || age <= 72);
  const [ind, setInd] = useState<Indicator>(isAdult ? "bmi" : "weight");
  const [range, setRange] = useState<RangeKey>("auto");
  const [editing, setEditing] = useState<Partial<Measurement> | null>(null);

  const sorted = [...measurements].sort((a, b) => b.measured_on.localeCompare(a.measured_on));
  const latest = sorted[0];
  const assessments = latest ? assessMeasurement(member.gender, member.birth_date, latest) : [];
  const childNoData = !isAdult && age > maxMonths(ind) && ind === "weight";

  return (
    <div className="space-y-5">
      {latest && (
        <section className="card p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-bold">Đánh giá lần đo gần nhất</h3>
            <span className="text-sm text-text-2">
              {formatDate(latest.measured_on)} · {formatAge(member.birth_date, latest.measured_on)}
            </span>
          </div>
          {assessments.length === 0 ? (
            <p className="text-sm text-text-2">Không đủ dữ liệu để đánh giá.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {assessments.map((a) => (
                <div key={a.indicator} className="rounded-xl bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-text-2">{INDICATORS[a.indicator].short}</span>
                    <LevelBadge level={a.level}>{a.label}</LevelBadge>
                  </div>
                  <p className="tabular mt-1 text-xl font-bold">
                    {a.value} <span className="text-sm font-medium text-text-2">{INDICATORS[a.indicator].unit}</span>
                  </p>
                  {a.z != null && (
                    <p className="tabular text-xs text-text-2">
                      z-score {a.z.toFixed(2)} · bách phân vị {a.pct}% (so với trẻ cùng tuổi, cùng giới)
                    </p>
                  )}
                  {a.advice && <p className="mt-1.5 text-xs text-text-2">{a.advice}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1" role="tablist">
            {indicators.map((i) => (
              <button
                key={i}
                role="tab"
                aria-selected={ind === i}
                onClick={() => setInd(i)}
                className={`rounded-lg px-3 py-1 text-sm font-semibold ${ind === i ? "bg-surface shadow-sm" : "text-text-2"}`}
              >
                {INDICATORS[i].short}
              </button>
            ))}
          </div>
          {!isAdult && (
            <select className="input ml-auto w-auto py-1.5 text-sm" value={range} onChange={(e) => setRange(e.target.value as RangeKey)} aria-label="Khoảng tuổi">
              <option value="auto">Tự động</option>
              <option value="0-24">0 – 2 tuổi</option>
              <option value="0-60">0 – 5 tuổi</option>
              <option value="60-228">5 – 19 tuổi</option>
            </select>
          )}
        </div>
        <h3 className="mb-1 text-sm font-semibold text-text-2">
          {isAdult ? `Diễn biến ${INDICATORS[ind].short.toLowerCase()}` : `${INDICATORS[ind].label} (${INDICATORS[ind].unit}) – chuẩn WHO, ${member.gender === "male" ? "nam" : "nữ"}`}
        </h3>
        {childNoData && (
          <p className="mb-2 text-xs text-text-2">WHO chỉ có chuẩn cân nặng theo tuổi đến 10 tuổi – với trẻ lớn hơn hãy xem BMI theo tuổi.</p>
        )}
        {isAdult ? (
          <AdultChart measurements={measurements} indicator={ind} />
        ) : (
          <GrowthChart gender={member.gender} birthDate={member.birth_date} measurements={measurements} indicator={ind} range={range} />
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold">Lịch sử số đo</h3>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setEditing({ measured_on: today() })}>
              + Thêm số đo
            </button>
          )}
        </div>
        {sorted.length === 0 ? (
          <Empty title="Chưa có số đo">Thêm số đo đầu tiên – nếu có sổ khám cũ, hãy nhập lại các mốc trước đây để có biểu đồ đầy đủ.</Empty>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5 font-semibold">Ngày đo</th>
                  <th className="px-2 py-2.5 font-semibold">Tuổi</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Cao (cm)</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Nặng (kg)</th>
                  <th className="px-2 py-2.5 text-right font-semibold">BMI</th>
                  {!isAdult && <th className="px-2 py-2.5 text-right font-semibold">V.đầu</th>}
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="tabular">
                {sorted.map((m) => {
                  const asm = assessMeasurement(member.gender, member.birth_date, m);
                  const cell = (i: Indicator, v: number | null) => {
                    const a = asm.find((x) => x.indicator === i);
                    const warn = a && a.level !== "good" && a.level !== "info";
                    return (
                      <td className={`px-2 py-2.5 text-right ${warn ? "font-semibold text-warning" : ""}`} title={a ? `${a.label}${a.pct != null ? ` · P${a.pct}` : ""}` : undefined}>
                        {v ?? "—"}
                        {a?.pct != null && <span className="ml-1 text-[11px] font-normal text-muted">P{Math.round(a.pct)}</span>}
                      </td>
                    );
                  };
                  const b = asm.find((x) => x.indicator === "bmi");
                  return (
                    <tr key={m.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5">{formatDate(m.measured_on)}</td>
                      <td className="px-2 py-2.5 text-text-2">{formatAge(member.birth_date, m.measured_on)}</td>
                      {cell("height", m.height_cm)}
                      {cell("weight", m.weight_kg)}
                      {cell("bmi", b?.value ?? null)}
                      {!isAdult && cell("head", m.head_cm)}
                      <td className="px-4 py-2.5 text-right">
                        {canEdit && (
                          <button className="btn btn-sm" onClick={() => setEditing(m)}>
                            Sửa
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={!!editing} title={editing?.id ? "Sửa số đo" : "Thêm số đo"} onClose={() => setEditing(null)}>
        {editing && (
          <MeasurementForm
            member={member}
            value={editing}
            showHead={!isAdult}
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

function MeasurementForm({
  member,
  value,
  showHead,
  onDone,
}: {
  member: Member;
  value: Partial<Measurement>;
  showHead: boolean;
  onDone: () => void;
}) {
  const [f, setF] = useState({
    measured_on: value.measured_on ?? today(),
    height_cm: value.height_cm?.toString() ?? "",
    weight_kg: value.weight_kg?.toString() ?? "",
    head_cm: value.head_cm?.toString() ?? "",
    notes: value.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const h = num(f.height_cm), w = num(f.weight_kg), hc = num(f.head_cm);
    if (h == null && w == null && hc == null) return setError("Nhập ít nhất một chỉ số.");
    if (f.measured_on < member.birth_date) return setError("Ngày đo phải sau ngày sinh.");
    setBusy(true);
    setError(null);
    try {
      await saveMeasurement({
        id: value.id,
        family_id: member.family_id,
        member_id: member.id,
        measured_on: f.measured_on,
        height_cm: h,
        weight_kg: w,
        head_cm: hc,
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
    if (!value.id || !confirmDelete("số đo này")) return;
    await deleteMeasurement(value.id);
    onDone();
  }

  const input = (k: "height_cm" | "weight_kg" | "head_cm", label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <input className="input tabular" inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </Field>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Ngày đo *">
        <input className="input" type="date" required min={member.birth_date} max={today()} value={f.measured_on} onChange={(e) => setF({ ...f, measured_on: e.target.value })} />
      </Field>
      <div className={`grid gap-3 ${showHead ? "grid-cols-3" : "grid-cols-2"}`}>
        {input("height_cm", "Chiều cao (cm)", ageInMonths(member.birth_date, f.measured_on) < 24 ? "Đo nằm" : undefined)}
        {input("weight_kg", "Cân nặng (kg)")}
        {showHead && input("head_cm", "Vòng đầu (cm)")}
      </div>
      <Field label="Ghi chú">
        <input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="VD: khám định kỳ tại phòng khám…" />
      </Field>
      <ErrorText error={error} />
      <div className="flex justify-between gap-2">
        {value.id ? (
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
    </form>
  );
}
