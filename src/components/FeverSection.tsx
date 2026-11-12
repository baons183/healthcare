"use client";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Illness, Member, Temperature } from "@/lib/types";
import { deleteTemperature, saveTemperature } from "@/lib/data";
import { ageInMonths, formatDateTime, toLocalInput } from "@/lib/date";
import { antipyreticHint, currentEpisode, feverAlerts, gradeTemp, TEMP_SITES } from "@/lib/fever";
import { confirmDelete, ErrorText, Field, LevelBadge, LevelIcon, Modal } from "./ui";

export function FeverSection({
  member,
  temps,
  illnesses,
  weightKg,
  canEdit,
  onChange,
}: {
  member: Member;
  temps: Temperature[];
  illnesses: Illness[];
  weightKg: number | null;
  canEdit: boolean;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<Partial<Temperature> | null>(null);
  const [showAll, setShowAll] = useState(false);
  const age = ageInMonths(member.birth_date);
  const sorted = useMemo(() => [...temps].sort((a, b) => b.measured_at.localeCompare(a.measured_at)), [temps]);
  const episode = currentEpisode(temps);
  const alerts = feverAlerts(temps, age);
  const chartData = (episode?.recent ? episode.readings : sorted.slice(0, 12).reverse()).map((t) => ({ t: new Date(t.measured_at).getTime(), v: t.temp_c, at: t.measured_at }));
  const list = showAll ? sorted : sorted.slice(0, 5);
  const last = sorted[0];
  const ongoing = illnesses.find((i) => !i.ended_on);

  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold">🌡️ Nhật ký sốt</h3>
            {last && <LevelBadge level={gradeTemp(last.temp_c).level}>{gradeTemp(last.temp_c).label}</LevelBadge>}
          </div>
          <p className="text-sm text-text-2">
            {last ? `Lần đo cuối ${last.temp_c}°C lúc ${formatDateTime(last.measured_at)}` : "Ghi nhiệt độ mỗi lần đo khi con ốm – bác sĩ sẽ cần biểu đồ này."}
          </p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setEditing({ measured_at: new Date().toISOString(), site: last?.site ?? "Nách", illness_id: ongoing?.id ?? null })}>
            + Ghi nhiệt độ
          </button>
        )}
      </div>

      {alerts.length > 0 && (
        <div className="mb-3 space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className="flex gap-3 rounded-xl bg-surface-2 p-3">
              <LevelIcon level={a.level} />
              <div>
                <p className="text-sm font-semibold">{a.title}</p>
                <p className="text-sm text-text-2">{a.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {chartData.length >= 2 && (
        <div className="h-[200px] w-full" role="img" aria-label="Biểu đồ nhiệt độ">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis
                type="number"
                dataKey="t"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t: number) => {
                  const d = new Date(t);
                  return `${d.getDate()}/${d.getMonth() + 1} ${d.getHours()}h`;
                }}
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <YAxis domain={[36, (max: number) => Math.max(40, Math.ceil(max))]} tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={40} />
              <ReferenceLine y={38} stroke="var(--warning)" strokeDasharray="4 4" label={{ value: "38°", position: "right", fontSize: 10, fill: "var(--warning)" }} />
              <ReferenceLine y={39} stroke="var(--danger)" strokeDasharray="4 4" label={{ value: "39°", position: "right", fontSize: 10, fill: "var(--danger)" }} />
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div className="card px-3 py-2 text-xs shadow-lg">
                      <p>{formatDateTime((payload[0].payload as { at: string }).at)}</p>
                      <p className="tabular text-sm font-bold">{String(payload[0].value)}°C</p>
                    </div>
                  ) : null
                }
              />
              <Line dataKey="v" stroke="var(--chart-series)" strokeWidth={2} isAnimationActive={false} dot={{ r: 4, fill: "var(--chart-series)", stroke: "var(--surface)", strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {sorted.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border text-sm">
          {list.map((t) => {
            const g = gradeTemp(t.temp_c);
            return (
              <li key={t.id}>
                <button className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2" onClick={() => setEditing(t)}>
                  <span className="tabular w-14 font-bold">{t.temp_c}°C</span>
                  <LevelBadge level={g.level}>{g.label}</LevelBadge>
                  <span className="flex-1 truncate text-text-2">{[t.site, t.medicine && `💊 ${t.medicine}`].filter(Boolean).join(" · ")}</span>
                  <span className="text-xs text-muted">{formatDateTime(t.measured_at)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {sorted.length > 5 && (
        <button className="mt-2 text-sm text-primary underline" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Thu gọn" : `Xem tất cả ${sorted.length} lần đo`}
        </button>
      )}
      <p className="mt-2 text-xs text-muted">💊 {antipyreticHint(weightKg, age)} Tham khảo, theo chỉ định bác sĩ/dược sĩ.</p>

      <Modal open={!!editing} title={editing?.id ? "Sửa lần đo nhiệt độ" : "Ghi nhiệt độ"} onClose={() => setEditing(null)}>
        {editing && (
          <TempForm
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

function TempForm({
  member,
  value,
  illnesses,
  canEdit,
  onDone,
}: {
  member: Member;
  value: Partial<Temperature>;
  illnesses: Illness[];
  canEdit: boolean;
  onDone: () => void;
}) {
  const [f, setF] = useState({
    temp: value.temp_c != null ? String(value.temp_c) : "",
    at: toLocalInput(value.measured_at),
    site: value.site ?? "Nách",
    medicine: value.medicine ?? "",
    notes: value.notes ?? "",
    illness_id: value.illness_id ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = Number(f.temp.replace(",", "."));
  const g = f.temp && t >= 30 && t <= 45 ? gradeTemp(t) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!(t >= 30 && t <= 45)) throw new Error("Nhiệt độ không hợp lệ (30–45°C).");
      await saveTemperature({
        id: value.id,
        family_id: member.family_id,
        member_id: member.id,
        measured_at: new Date(f.at).toISOString(),
        temp_c: Math.round(t * 10) / 10,
        site: f.site,
        medicine: f.medicine,
        notes: f.notes,
        illness_id: f.illness_id || null,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!value.id || !confirmDelete("lần đo này")) return;
    await deleteTemperature(value.id);
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={!canEdit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nhiệt độ (°C) *">
            <input className="input tabular text-lg font-bold" inputMode="decimal" required autoFocus placeholder="38.5" value={f.temp} onChange={(e) => setF({ ...f, temp: e.target.value })} />
          </Field>
          <Field label="Vị trí đo">
            <select className="input" value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })}>
              {TEMP_SITES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
        {g && (
          <p>
            <LevelBadge level={g.level}>{g.label}</LevelBadge>
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {["37.5", "38", "38.5", "39", "39.5", "40"].map((v) => (
            <button key={v} type="button" className="btn btn-sm tabular" onClick={() => setF({ ...f, temp: v })}>
              {v}°
            </button>
          ))}
        </div>
        <Field label="Thời điểm đo">
          <input className="input" type="datetime-local" required value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} />
        </Field>
        <Field label="Thuốc hạ sốt đã dùng" hint="VD: Hapacol 250mg, Efferalgan 150mg">
          <input className="input" list="fever-meds" value={f.medicine} onChange={(e) => setF({ ...f, medicine: e.target.value })} />
          <datalist id="fever-meds">
            {["Paracetamol", "Hapacol 150mg", "Hapacol 250mg", "Efferalgan 80mg", "Efferalgan 150mg", "Ibuprofen", "Chườm ấm"].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
        {illnesses.length > 0 && (
          <Field label="Thuộc đợt ốm">
            <select className="input" value={f.illness_id} onChange={(e) => setF({ ...f, illness_id: e.target.value })}>
              <option value="">— Không —</option>
              {illnesses.slice(0, 10).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.started_on.split("-").reverse().join("/")})
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Ghi chú">
          <input className="input" value={f.notes} placeholder="VD: quấy, bỏ bú, phát ban…" onChange={(e) => setF({ ...f, notes: e.target.value })} />
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
