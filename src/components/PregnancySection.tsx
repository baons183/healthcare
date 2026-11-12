"use client";
import { useState } from "react";
import type { Checkup, Measurement, Member, Pregnancy, Vaccination } from "@/lib/types";
import { deletePregnancy, saveCheckup, savePregnancy, saveVaccination } from "@/lib/data";
import { formatDate, today } from "@/lib/date";
import {
  activePregnancy,
  dueFromLmp,
  expectedGainAt,
  gestationalAge,
  lmpFromDue,
  TETANUS_ADVICE,
  TETANUS_CODE,
  tetanusInPregnancy,
  VISIT_META,
  visitSchedule,
  weightGainTarget,
  type ScheduledVisit,
} from "@/lib/pregnancy";
import { CheckupForm } from "./CheckupsTab";
import { confirmDelete, ErrorText, Field, Modal } from "./ui";

export function PregnancySection({
  member,
  pregnancies,
  checkups,
  vaccinations,
  measurements,
  canEdit,
  onChange,
}: {
  member: Member;
  pregnancies: Pregnancy[];
  checkups: Checkup[];
  vaccinations: Vaccination[];
  measurements: Measurement[];
  canEdit: boolean;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<Partial<Pregnancy> | null>(null);
  const [visit, setVisit] = useState<Partial<Checkup> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preg = activePregnancy(pregnancies);
  const past = pregnancies.filter((p) => p !== preg);

  if (!preg) {
    return (
      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold">🤰 Thai kỳ</h3>
            <p className="text-sm text-text-2">Theo dõi tuần thai, lịch khám thai, tiêm uốn ván và tăng cân.</p>
          </div>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setEditing({})}>
              + Bắt đầu theo dõi thai kỳ
            </button>
          )}
        </div>
        {past.length > 0 && (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border text-sm">
            {past.map((p) => (
              <li key={p.id}>
                <button className="w-full px-3 py-2 text-left hover:bg-surface-2" onClick={() => setEditing(p)}>
                  Dự sinh {formatDate(p.due_date)}
                  {p.ended_on && ` · kết thúc ${formatDate(p.ended_on)}`}
                  {p.outcome && <span className="text-text-2"> · {p.outcome}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <PregnancyModal member={member} editing={editing} canEdit={canEdit} onClose={() => setEditing(null)} onDone={onChange} />
      </section>
    );
  }

  const ga = gestationalAge(preg.lmp);
  const progress = Math.min(100, Math.max(0, (ga.total / 280) * 100));
  const daysLeft = 280 - ga.total;
  const schedule = visitSchedule(preg, checkups);
  const tetanus = tetanusInPregnancy(preg, vaccinations);
  const height = [...measurements].reverse().find((m) => m.height_cm)?.height_cm ?? null;
  const preBmi = preg.pre_weight_kg && height ? preg.pre_weight_kg / (height / 100) ** 2 : null;
  const lastW = [...measurements].filter((m) => m.weight_kg && m.measured_on >= preg.lmp).sort((a, b) => a.measured_on.localeCompare(b.measured_on)).at(-1);

  async function addTetanus() {
    setBusy(true);
    setError(null);
    try {
      await saveVaccination({
        family_id: member.family_id,
        member_id: member.id,
        vaccine_code: TETANUS_CODE,
        vaccine_name: "Uốn ván (VAT) – thai kỳ",
        dose_number: tetanus.length + 1,
        administered_on: today(),
      });
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-bold">🤰 Thai kỳ</h3>
          <p className="tabular text-2xl font-bold">
            Tuần {ga.weeks}
            {ga.days ? <span className="text-base font-semibold text-text-2"> + {ga.days} ngày</span> : null}
          </p>
          <p className="text-sm text-text-2">
            Dự sinh {formatDate(preg.due_date)} · {daysLeft > 0 ? `còn ${daysLeft} ngày` : `quá ngày dự sinh ${-daysLeft} ngày`}
          </p>
        </div>
        {canEdit && (
          <button className="btn btn-sm" onClick={() => setEditing(preg)}>
            Sửa / Kết thúc
          </button>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="Tiến trình thai kỳ">
        <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-muted">
        <span>Quý 1 (đến tuần 13)</span>
        <span>Quý 2 (14–27)</span>
        <span>Quý 3 (28–40)</span>
      </div>

      <div>
        <p className="mb-1.5 font-semibold">Lịch khám thai</p>
        <ul className="divide-y divide-border rounded-xl border border-border text-sm">
          {schedule.map((v) => (
            <VisitRow
              key={v.visit.code}
              v={v}
              canEdit={canEdit}
              onClick={() =>
                setVisit(v.record ?? { kind: "prenatal", pregnancy_id: preg.id, visit_code: v.visit.code, done_on: today(), notes: v.visit.title })
              }
            />
          ))}
        </ul>
        <p className="mt-1 text-xs text-muted">Lịch tham khảo – theo hẹn của bác sĩ sản khoa. Bấm vào một mốc để ghi kết quả khám.</p>
      </div>

      <div className="rounded-xl bg-surface-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">💉 Tiêm uốn ván</p>
          {canEdit && (
            <button className="btn btn-sm" disabled={busy} onClick={addTetanus}>
              + Ghi mũi tiêm hôm nay
            </button>
          )}
        </div>
        <p className="mt-1 text-sm">
          {tetanus.length ? `Đã tiêm ${tetanus.length} mũi trong thai kỳ này: ${tetanus.map((t) => formatDate(t.administered_on)).join(", ")}` : "Chưa ghi nhận mũi nào trong thai kỳ này."}
        </p>
        <p className="mt-1 text-xs text-text-2">{TETANUS_ADVICE}</p>
        <ErrorText error={error} />
      </div>

      <div className="rounded-xl bg-surface-2 p-3">
        <p className="font-semibold">⚖️ Tăng cân thai kỳ</p>
        {!preg.pre_weight_kg || !height ? (
          <p className="mt-1 text-sm text-text-2">
            {!preg.pre_weight_kg ? "Nhập cân nặng trước mang thai (Sửa) " : ""}
            {!height ? "và thêm chiều cao ở tab Tăng trưởng " : ""}để theo dõi mức tăng cân hợp lý.
          </p>
        ) : (
          <WeightGain pre={preg.pre_weight_kg} preBmi={preBmi!} last={lastW} lmp={preg.lmp} />
        )}
      </div>

      <PregnancyModal member={member} editing={editing} canEdit={canEdit} onClose={() => setEditing(null)} onDone={onChange} />
      <Modal open={!!visit} title={visit?.notes ?? "Khám thai"} onClose={() => setVisit(null)}>
        {visit && (
          <CheckupForm
            member={member}
            value={visit}
            canEdit={canEdit}
            onDone={() => {
              setVisit(null);
              onChange();
            }}
          />
        )}
      </Modal>
    </section>
  );
}

function VisitRow({ v, canEdit, onClick }: { v: ScheduledVisit; canEdit: boolean; onClick: () => void }) {
  const meta = v.soon ? { label: "Sắp tới", cls: "badge-info" } : VISIT_META[v.status];
  return (
    <li>
      <button className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-surface-2 disabled:cursor-default" disabled={!canEdit && !v.record} onClick={onClick}>
        <span aria-hidden className="pt-0.5">
          {v.status === "done" ? "✅" : v.status === "current" ? "📍" : "○"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">
            Tuần {v.visit.from}–{v.visit.to === 14 ? "13⁺⁶" : v.visit.to}: {v.visit.title}
          </span>
          <span className="block text-xs text-text-2">{v.record?.result || v.visit.detail}</span>
        </span>
        <span className="shrink-0 text-right text-xs">
          <span className={`badge ${meta.cls}`}>{meta.label}</span>
          <span className="mt-0.5 block text-muted">{v.record ? formatDate(v.record.done_on) : formatDate(v.start)}</span>
        </span>
      </button>
    </li>
  );
}

function WeightGain({ pre, preBmi, last, lmp }: { pre: number; preBmi: number; last?: Measurement; lmp: string }) {
  const target = weightGainTarget(preBmi);
  if (!last?.weight_kg)
    return (
      <p className="mt-1 text-sm text-text-2">
        BMI trước mang thai {preBmi.toFixed(1)} ({target.group}) → nên tăng {target.total[0]}–{target.total[1]} kg cả thai kỳ. Thêm cân nặng ở tab Tăng trưởng để theo dõi.
      </p>
    );
  const wk = gestationalAge(lmp, last.measured_on).weeks;
  const [lo, hi] = expectedGainAt(wk, preBmi);
  const gain = Math.round((last.weight_kg - pre) * 10) / 10;
  const status = gain < lo ? "thấp hơn khuyến nghị" : gain > hi ? "cao hơn khuyến nghị" : "trong khoảng khuyến nghị";
  return (
    <div className="mt-1 text-sm">
      <p>
        Tuần {wk} ({formatDate(last.measured_on)}): <b className="tabular">{last.weight_kg} kg</b>, tăng <b className="tabular">{gain} kg</b> – {status} ({lo}–{hi} kg).
      </p>
      <p className="text-xs text-text-2">
        BMI trước mang thai {preBmi.toFixed(1)} ({target.group}) → cả thai kỳ nên tăng {target.total[0]}–{target.total[1]} kg (IOM 2009).
      </p>
    </div>
  );
}

function PregnancyModal({
  member,
  editing,
  canEdit,
  onClose,
  onDone,
}: {
  member: Member;
  editing: Partial<Pregnancy> | null;
  canEdit: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <Modal open={!!editing} title={editing?.id ? "Thai kỳ" : "Bắt đầu theo dõi thai kỳ"} onClose={onClose}>
      {editing && (
        <PregnancyForm
          member={member}
          value={editing}
          canEdit={canEdit}
          onDone={() => {
            onClose();
            onDone();
          }}
        />
      )}
    </Modal>
  );
}

function PregnancyForm({ member, value, canEdit, onDone }: { member: Member; value: Partial<Pregnancy>; canEdit: boolean; onDone: () => void }) {
  const [mode, setMode] = useState<"lmp" | "due">(value.id ? "due" : "lmp");
  const [lmp, setLmp] = useState(value.lmp ?? "");
  const [due, setDue] = useState(value.due_date ?? "");
  const [pre, setPre] = useState(value.pre_weight_kg != null ? String(value.pre_weight_kg) : "");
  const [ended, setEnded] = useState(value.ended_on ?? "");
  const [outcome, setOutcome] = useState(value.outcome ?? "");
  const [notes, setNotes] = useState(value.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const computedDue = mode === "lmp" ? (lmp ? dueFromLmp(lmp) : "") : due;
  const computedLmp = mode === "lmp" ? lmp : due ? lmpFromDue(due) : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!computedLmp || !computedDue) throw new Error("Nhập ngày đầu kỳ kinh cuối hoặc ngày dự sinh.");
      await savePregnancy({
        id: value.id,
        family_id: member.family_id,
        member_id: member.id,
        lmp: computedLmp,
        due_date: computedDue,
        pre_weight_kg: pre ? Number(pre.replace(",", ".")) : null,
        ended_on: ended || null,
        outcome,
        notes,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!value.id || !confirmDelete("thai kỳ này cùng các lần khám thai")) return;
    await deletePregnancy(value.id);
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={!canEdit} className="space-y-4">
        <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
          {(
            [
              ["lmp", "Theo kỳ kinh cuối"],
              ["due", "Theo ngày dự sinh"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)} className={`flex-1 rounded-lg px-3 py-1 text-sm font-semibold ${mode === k ? "bg-surface shadow-sm" : "text-text-2"}`}>
              {l}
            </button>
          ))}
        </div>
        {mode === "lmp" ? (
          <Field label="Ngày đầu tiên của kỳ kinh cuối" hint={computedDue ? `→ Dự sinh ${formatDate(computedDue)}, hiện ${gestationalAge(lmp).weeks} tuần` : undefined}>
            <input className="input" type="date" max={today()} value={lmp} onChange={(e) => setLmp(e.target.value)} />
          </Field>
        ) : (
          <Field label="Ngày dự sinh (theo siêu âm)" hint={computedLmp ? `→ Hiện ${gestationalAge(computedLmp).weeks} tuần ${gestationalAge(computedLmp).days} ngày` : undefined}>
            <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        )}
        <Field label="Cân nặng trước mang thai (kg)">
          <input className="input tabular" inputMode="decimal" value={pre} onChange={(e) => setPre(e.target.value)} />
        </Field>
        {value.id && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ngày sinh / kết thúc">
              <input className="input" type="date" max={today()} value={ended} onChange={(e) => setEnded(e.target.value)} />
            </Field>
            <Field label="Kết quả">
              <input className="input" placeholder="VD: sinh thường, bé trai 3,2kg" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
            </Field>
          </div>
        )}
        <Field label="Ghi chú">
          <input className="input" placeholder="VD: nơi khám thai, bác sĩ theo dõi" value={notes} onChange={(e) => setNotes(e.target.value)} />
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
