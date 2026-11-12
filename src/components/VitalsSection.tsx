"use client";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GlucoseContext, Member, Vital } from "@/lib/types";
import { deleteVital, saveVital } from "@/lib/data";
import { formatDate, formatDateTime, toLocalInput } from "@/lib/date";
import { GLUCOSE_CONTEXT, gradeBP, gradeGlucose, gradeLipid, latestVitalGrades, LIPID_KEYS, LIPID_META, type LipidKey } from "@/lib/vitals";
import { confirmDelete, ErrorText, Field, LevelBadge, Modal } from "./ui";

type View = "bp" | "glucose" | "lipid";

export function VitalsSection({ member, vitals, canEdit, onChange }: { member: Member; vitals: Vital[]; canEdit: boolean; onChange: () => void }) {
  const [view, setView] = useState<View>("bp");
  const [lipid, setLipid] = useState<LipidKey>("cholesterol");
  const [editing, setEditing] = useState<Partial<Vital> | null>(null);
  const grades = latestVitalGrades(vitals, member.gender);
  const sorted = [...vitals].sort((a, b) => a.measured_at.localeCompare(b.measured_at));

  const rows = sorted
    .map((v) => ({
      t: new Date(v.measured_at).getTime(),
      at: v.measured_at,
      a: view === "bp" ? v.systolic : view === "glucose" ? v.glucose : v[lipid],
      b: view === "bp" ? v.diastolic : null,
    }))
    .filter((r) => r.a != null);

  const unit = view === "bp" ? "mmHg" : "mmol/L";
  const refs: { y: number; label: string; level: "warning" | "danger" }[] =
    view === "bp"
      ? [
          { y: 140, label: "140", level: "danger" },
          { y: 90, label: "90", level: "danger" },
        ]
      : view === "glucose"
        ? [
            { y: 5.6, label: "5,6", level: "warning" },
            { y: 7, label: "7,0", level: "danger" },
          ]
        : [];

  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-bold">❤️ Huyết áp · Đường huyết · Mỡ máu</h3>
          <p className="text-sm text-text-2">Nhập kết quả đo tại nhà hoặc từ phiếu xét nghiệm.</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setEditing({ measured_at: new Date().toISOString() })}>
            + Thêm chỉ số
          </button>
        )}
      </div>

      {grades.length > 0 && (
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          {grades.map((g) => (
            <div key={g.key} className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs text-text-2">{g.title}</p>
              <p className="tabular text-lg font-bold">{g.value}</p>
              <div className="flex items-center justify-between gap-2">
                <LevelBadge level={g.grade.level}>{g.grade.label}</LevelBadge>
                <span className="text-[11px] text-muted">{formatDate(g.at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-surface-2 p-1" role="tablist">
          {(
            [
              ["bp", "Huyết áp"],
              ["glucose", "Đường huyết"],
              ["lipid", "Mỡ máu"],
            ] as [View, string][]
          ).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`rounded-lg px-3 py-1 text-sm font-semibold ${view === k ? "bg-surface shadow-sm" : "text-text-2"}`}>
              {l}
            </button>
          ))}
        </div>
        {view === "lipid" && (
          <select className="input ml-auto w-auto py-1.5 text-sm" value={lipid} onChange={(e) => setLipid(e.target.value as LipidKey)} aria-label="Chỉ số mỡ máu">
            {LIPID_KEYS.map((k) => (
              <option key={k} value={k}>
                {LIPID_META[k].label}
              </option>
            ))}
          </select>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-2">Chưa có dữ liệu.</p>
      ) : (
        <>
          <div className="h-[220px] w-full" role="img" aria-label="Biểu đồ diễn biến chỉ số">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis
                  type="number"
                  dataKey="t"
                  scale="time"
                  domain={rows.length === 1 ? [rows[0].t - 864e5 * 15, rows[0].t + 864e5 * 15] : ["dataMin", "dataMax"]}
                  tickFormatter={(t: number) => {
                    const d = new Date(t);
                    return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
                  }}
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={44} />
                {refs.map((r) => (
                  <ReferenceLine key={r.y} y={r.y} stroke={`var(--${r.level})`} strokeDasharray="4 4" />
                ))}
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="card px-3 py-2 text-xs shadow-lg">
                        <p>{formatDateTime((payload[0].payload as { at: string }).at)}</p>
                        <p className="tabular text-sm font-bold">
                          {view === "bp" ? `${payload[0].payload.a}/${payload[0].payload.b ?? "–"}` : String(payload[0].payload.a)} {unit}
                        </p>
                      </div>
                    ) : null
                  }
                />
                <Line dataKey="a" stroke="var(--chart-series)" strokeWidth={2} isAnimationActive={false} connectNulls dot={{ r: 4, fill: "var(--chart-series)", stroke: "var(--surface)", strokeWidth: 2 }} />
                {view === "bp" && (
                  <Line dataKey="b" stroke="var(--chart-series-2)" strokeWidth={2} isAnimationActive={false} connectNulls dot={{ r: 4, fill: "var(--chart-series-2)", stroke: "var(--surface)", strokeWidth: 2 }} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-2">
            {view === "bp" ? (
              <>
                <Swatch color="var(--chart-series)" /> Tâm thu
                <Swatch color="var(--chart-series-2)" /> Tâm trương
                <span>Ngưỡng tăng huyết áp: 140/90</span>
              </>
            ) : view === "glucose" ? (
              <span>Lúc đói: bình thường &lt; 5,6 · tiền đái tháo đường 5,6–6,9 · ≥ 7,0 nghi đái tháo đường</span>
            ) : (
              <span>
                {LIPID_META[lipid].label}: mục tiêu {LIPID_META[lipid].ref} mmol/L
              </span>
            )}
          </p>
        </>
      )}

      {vitals.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-primary">Lịch sử ({vitals.length} lần)</summary>
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border text-sm">
            {[...sorted].reverse().map((v) => (
              <li key={v.id}>
                <button className="w-full px-3 py-2 text-left hover:bg-surface-2" onClick={() => setEditing(v)}>
                  <span className="text-xs text-muted">{formatDateTime(v.measured_at)}</span>
                  <span className="block">{summarize(v)}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Modal open={!!editing} title={editing?.id ? "Sửa chỉ số" : "Thêm chỉ số"} onClose={() => setEditing(null)}>
        {editing && (
          <VitalForm
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

function Swatch({ color }: { color: string }) {
  return (
    <svg width="18" height="10" aria-hidden className="-mr-3">
      <line x1="0" y1="5" x2="18" y2="5" stroke={color} strokeWidth="2" />
      <circle cx="9" cy="5" r="3.5" fill={color} />
    </svg>
  );
}

function summarize(v: Vital): string {
  const p: string[] = [];
  if (v.systolic && v.diastolic) p.push(`HA ${v.systolic}/${v.diastolic}${v.pulse ? `, mạch ${v.pulse}` : ""}`);
  if (v.glucose != null) p.push(`Đường ${v.glucose} (${GLUCOSE_CONTEXT[v.glucose_context ?? "random"].toLowerCase()})`);
  for (const k of LIPID_KEYS) if (v[k] != null) p.push(`${LIPID_META[k].label.split(" ")[0]} ${v[k]}`);
  return p.join(" · ") || "—";
}

type FormState = Record<"systolic" | "diastolic" | "pulse" | "glucose" | LipidKey | "notes", string> & { at: string; ctx: GlucoseContext };

function VitalForm({ member, value, canEdit, onDone }: { member: Member; value: Partial<Vital>; canEdit: boolean; onDone: () => void }) {
  const s = (n: number | null | undefined) => (n == null ? "" : String(n));
  const [f, setF] = useState<FormState>({
    at: toLocalInput(value.measured_at),
    systolic: s(value.systolic),
    diastolic: s(value.diastolic),
    pulse: s(value.pulse),
    glucose: s(value.glucose),
    ctx: value.glucose_context ?? "fasting",
    cholesterol: s(value.cholesterol),
    ldl: s(value.ldl),
    hdl: s(value.hdl),
    triglycerides: s(value.triglycerides),
    notes: value.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = (x: string) => (x.trim() === "" ? null : Number(x.replace(",", ".")));
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const sys = n(f.systolic);
  const dia = n(f.diastolic);
  const glu = n(f.glucose);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const row = {
        systolic: sys,
        diastolic: dia,
        pulse: n(f.pulse),
        glucose: glu,
        glucose_context: glu != null ? f.ctx : null,
        cholesterol: n(f.cholesterol),
        ldl: n(f.ldl),
        hdl: n(f.hdl),
        triglycerides: n(f.triglycerides),
      };
      if (Object.values(row).every((v) => v == null || typeof v === "string")) throw new Error("Nhập ít nhất một chỉ số.");
      if ((sys == null) !== (dia == null)) throw new Error("Huyết áp cần cả tâm thu và tâm trương.");
      if (Object.values(row).some((v) => typeof v === "number" && Number.isNaN(v))) throw new Error("Có giá trị không phải số.");
      await saveVital({ id: value.id, family_id: member.family_id, member_id: member.id, measured_at: new Date(f.at).toISOString(), notes: f.notes, ...row });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!value.id || !confirmDelete("lần đo này")) return;
    await deleteVital(value.id);
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={!canEdit} className="space-y-4">
        <Field label="Thời điểm">
          <input className="input" type="datetime-local" required value={f.at} onChange={set("at")} />
        </Field>
        <div>
          <p className="label">Huyết áp (mmHg)</p>
          <div className="grid grid-cols-3 gap-2">
            <input className="input tabular" inputMode="numeric" placeholder="Tâm thu" value={f.systolic} onChange={set("systolic")} aria-label="Tâm thu" />
            <input className="input tabular" inputMode="numeric" placeholder="Tâm trương" value={f.diastolic} onChange={set("diastolic")} aria-label="Tâm trương" />
            <input className="input tabular" inputMode="numeric" placeholder="Mạch" value={f.pulse} onChange={set("pulse")} aria-label="Mạch" />
          </div>
          {sys && dia ? (
            <p className="mt-1">
              <LevelBadge level={gradeBP(sys, dia).level}>{gradeBP(sys, dia).label}</LevelBadge>
            </p>
          ) : null}
        </div>
        <div>
          <p className="label">Đường huyết (mmol/L)</p>
          <div className="grid grid-cols-2 gap-2">
            <input className="input tabular" inputMode="decimal" placeholder="VD: 5.4" value={f.glucose} onChange={set("glucose")} aria-label="Đường huyết" />
            <select className="input" value={f.ctx} onChange={set("ctx")} aria-label="Thời điểm đo đường huyết">
              {(Object.keys(GLUCOSE_CONTEXT) as GlucoseContext[]).map((k) => (
                <option key={k} value={k}>
                  {GLUCOSE_CONTEXT[k]}
                </option>
              ))}
            </select>
          </div>
          {glu ? (
            <p className="mt-1">
              <LevelBadge level={gradeGlucose(glu, f.ctx).level}>{gradeGlucose(glu, f.ctx).label}</LevelBadge>
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted">Kết quả ghi mg/dL thì chia cho 18 (VD: 100 mg/dL = 5,6 mmol/L).</p>
        </div>
        <div>
          <p className="label">Mỡ máu (mmol/L)</p>
          <div className="grid grid-cols-2 gap-2">
            {LIPID_KEYS.map((k) => {
              const v = n(f[k]);
              const g = v ? gradeLipid(k, v, member.gender) : null;
              return (
                <label key={k} className="block">
                  <span className="text-xs text-text-2">{LIPID_META[k].label}</span>
                  <input className="input tabular" inputMode="decimal" value={f[k]} onChange={set(k)} />
                  {g && g.level !== "good" && <span className={`text-xs ${g.level === "danger" ? "text-danger" : "text-warning"}`}>{g.label}</span>}
                </label>
              );
            })}
          </div>
        </div>
        <Field label="Ghi chú">
          <input className="input" value={f.notes} onChange={set("notes")} placeholder="VD: đo sau khi ngồi nghỉ 5 phút" />
        </Field>
      </fieldset>
      <ErrorText error={error} />
      {canEdit && (
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
      )}
    </form>
  );
}
