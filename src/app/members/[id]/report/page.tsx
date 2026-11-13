"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { GrowthChart, AdultChart } from "@/components/GrowthChart";
import { ErrorText, LevelIcon, Spinner } from "@/components/ui";
import { getMember, listDewormings, listExtras, listIllnesses, listMeasurements, listVaccinations } from "@/lib/data";
import { ADULT_MONTHS, assessMeasurement, INDICATORS, bmi } from "@/lib/growth";
import { buildSchedule } from "@/lib/vaccines";
import { recommendationsFor } from "@/lib/recommendations";
import { ageInMonths, formatAge, formatDate, formatDateTime, today } from "@/lib/date";
import { activeMedications, medicationSummary } from "@/lib/medications";
import { CHECKUP_META } from "@/lib/checkups";
import { MILESTONE_BY_CODE, MILESTONE_MAX_AGE } from "@/lib/milestones";
import { GLUCOSE_CONTEXT, LIPID_KEYS, LIPID_META } from "@/lib/vitals";
import { activePregnancy, gestationalAge } from "@/lib/pregnancy";
import { contactsOf, EMPTY_EXTRAS, type Deworming, type Illness, type Measurement, type Member, type MemberExtras, type Vaccination } from "@/lib/types";

export default function ReportPage() {
  return (
    <AppShell>
      <Report />
    </AppShell>
  );
}

interface Data {
  member: Member;
  measurements: Measurement[];
  vaccinations: Vaccination[];
  illnesses: Illness[];
  dewormings: Deworming[];
  extras: MemberExtras;
}

function Report() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [years, setYears] = useState(3);

  const load = useCallback(async () => {
    try {
      const [member, measurements, vaccinations, illnesses, dewormings, extras] = await Promise.all([
        getMember(id),
        listMeasurements({ memberId: id }),
        listVaccinations({ memberId: id }),
        listIllnesses({ memberId: id }),
        listDewormings({ memberId: id }).catch(() => [] as Deworming[]),
        listExtras({ memberId: id }).catch(() => EMPTY_EXTRAS),
      ]);
      if (!member) throw new Error("Không tìm thấy thành viên.");
      setD({ member, measurements, vaccinations, illnesses, dewormings, extras });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const recs = useMemo(
    () => (d ? recommendationsFor(d.member, d.measurements, d.vaccinations, d.illnesses, d.dewormings, d.extras).filter((r) => r.level !== "info") : []),
    [d],
  );

  if (error) return <ErrorText error={error} />;
  if (!d) return <Spinner />;
  const { member: m, measurements, vaccinations, illnesses, extras } = d;
  const age = ageInMonths(m.birth_date);
  const isAdult = age >= ADULT_MONTHS;
  const since = `${Number(today().slice(0, 4)) - years}${today().slice(4)}`;
  const ms = [...measurements].sort((a, b) => b.measured_on.localeCompare(a.measured_on));
  const latest = ms[0];
  const schedule = buildSchedule(m.birth_date, vaccinations);
  const pending = schedule.filter((x) => x.status === "overdue" || x.status === "due");
  const ills = illnesses.filter((i) => i.started_on >= since);
  const meds = activeMedications(extras.medications);
  const vitals = [...extras.vitals].filter((v) => v.measured_at.slice(0, 10) >= since).sort((a, b) => b.measured_at.localeCompare(a.measured_at));
  const preg = activePregnancy(extras.pregnancies);

  return (
    <div className="mx-auto max-w-3xl space-y-5 text-[14px]">
      <div className="no-print card flex flex-wrap items-center gap-2 p-3">
        <Link href={`/members/${id}`} className="text-sm text-primary">
          ← {m.full_name}
        </Link>
        <label className="ml-auto flex items-center gap-2 text-sm">
          Bệnh sử & chỉ số
          <select className="input w-auto py-1 text-sm" value={years} onChange={(e) => setYears(Number(e.target.value))}>
            <option value={1}>1 năm gần nhất</option>
            <option value={3}>3 năm gần nhất</option>
            <option value={100}>Toàn bộ</option>
          </select>
        </label>
        <button className="btn btn-primary" onClick={() => window.print()}>
          📄 Lưu PDF / In
        </button>
        <p className="w-full text-xs text-muted">
          Trên điện thoại: bấm “Lưu PDF / In” → chọn “Lưu dưới dạng PDF” (Android) hoặc chụm 2 ngón để mở bản PDF rồi Chia sẻ (iPhone) → gửi qua Zalo.
        </p>
      </div>

      <header className="border-b-2 border-text pb-3">
        <p className="text-xs uppercase tracking-wider text-muted">Hồ sơ sức khỏe · in ngày {formatDate(today())}</p>
        <h1 className="text-2xl font-bold">{m.full_name}</h1>
        <p>
          {m.gender === "male" ? "Nam" : "Nữ"} · sinh {formatDate(m.birth_date)} ({formatAge(m.birth_date)}) · nhóm máu {m.blood_type || "chưa rõ"}
          {m.insurance_number ? ` · BHYT ${m.insurance_number}` : ""}
        </p>
        <p className={m.allergies ? "font-bold text-danger" : ""}>Dị ứng: {m.allergies || "không ghi nhận"}</p>
        <p>Bệnh nền: {m.chronic_conditions || "không ghi nhận"}</p>
        {contactsOf(m).length > 0 && <p>Liên hệ: {contactsOf(m).map((c) => `${c.name} ${c.phone}`.trim()).join("; ")}</p>}
      </header>

      {recs.length > 0 && (
        <Section title="Cần lưu ý">
          <ul className="space-y-1.5">
            {recs.map((r, i) => (
              <li key={i} className="flex gap-2">
                <LevelIcon level={r.level} />
                <span>
                  <b>{r.title}</b> {r.detail && <span className="text-text-2">– {r.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {meds.length > 0 && (
        <Section title="Thuốc đang dùng">
          <ul className="list-disc pl-5">
            {meds.map((x) => (
              <li key={x.id}>
                <b>{x.name}</b> – {medicationSummary(x)}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {preg && (
        <Section title="Thai kỳ">
          Đang mang thai tuần {gestationalAge(preg.lmp).weeks}, dự sinh {formatDate(preg.due_date)}. Kỳ kinh cuối {formatDate(preg.lmp)}
          {preg.pre_weight_kg ? `, cân nặng trước mang thai ${preg.pre_weight_kg} kg` : ""}.
        </Section>
      )}

      {latest && (
        <Section title="Tăng trưởng">
          <p className="mb-2">
            Lần đo gần nhất {formatDate(latest.measured_on)}:{" "}
            {assessMeasurement(m.gender, m.birth_date, latest)
              .map((a) => `${INDICATORS[a.indicator].short} ${a.value} ${INDICATORS[a.indicator].unit}${a.pct != null ? ` (P${a.pct})` : ""} – ${a.label}`)
              .join("; ")}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {(isAdult ? (["weight", "bmi"] as const) : (["weight", "height"] as const)).map((ind) => (
              <div key={ind} className="min-w-0">
                <p className="text-sm font-semibold">{INDICATORS[ind].label}</p>
                {isAdult ? (
                  <AdultChart measurements={measurements} indicator={ind} />
                ) : (
                  <GrowthChart gender={m.gender} birthDate={m.birth_date} measurements={measurements} indicator={ind} range="auto" />
                )}
              </div>
            ))}
          </div>
          <Table
            head={["Ngày", "Tuổi", "Cao (cm)", "Nặng (kg)", "BMI", "Vòng đầu"]}
            rows={ms.slice(0, 12).map((x) => [
              formatDate(x.measured_on),
              formatAge(m.birth_date, x.measured_on),
              x.height_cm ?? "",
              x.weight_kg ?? "",
              x.height_cm && x.weight_kg ? bmi(x.weight_kg, x.height_cm) : "",
              x.head_cm ?? "",
            ])}
          />
        </Section>
      )}

      {!isAdult && age < MILESTONE_MAX_AGE && extras.milestones.length > 0 && (
        <Section title="Mốc phát triển đã đạt">
          <Table
            head={["Mốc", "Ngày", "Tuổi"]}
            rows={[...extras.milestones]
              .sort((a, b) => a.achieved_on.localeCompare(b.achieved_on))
              .map((x) => [MILESTONE_BY_CODE[x.code]?.label ?? x.code, formatDate(x.achieved_on), formatAge(m.birth_date, x.achieved_on)])}
          />
        </Section>
      )}

      <Section title="Tiêm chủng" breakBefore>
        {pending.length > 0 && (
          <p className="mb-2 text-danger">
            <b>Chưa tiêm / quá hạn:</b> {pending.map((x) => `${x.vaccine.name} (${x.label})`).join("; ")}
          </p>
        )}
        {vaccinations.length === 0 ? (
          <p className="text-text-2">Chưa có dữ liệu.</p>
        ) : (
          <Table
            head={["Ngày", "Vắc xin", "Mũi", "Nơi tiêm", "Số lô"]}
            rows={[...vaccinations]
              .sort((a, b) => a.administered_on.localeCompare(b.administered_on))
              .map((v) => [formatDate(v.administered_on), v.vaccine_name, v.dose_number ?? "", v.facility ?? "", v.lot_number ?? ""])}
          />
        )}
        {d.dewormings.length > 0 && <p className="mt-2">Xổ giun gần nhất: {formatDate([...d.dewormings].sort((a, b) => b.given_on.localeCompare(a.given_on))[0].given_on)}</p>}
      </Section>

      <Section title={`Bệnh sử (${years >= 100 ? "toàn bộ" : `${years} năm gần nhất`})`}>
        {ills.length === 0 ? (
          <p className="text-text-2">Không có.</p>
        ) : (
          <Table
            head={["Thời gian", "Bệnh / lý do", "Chẩn đoán", "Điều trị", "Nơi khám"]}
            rows={ills.map((i) => [
              `${formatDate(i.started_on)}${i.ended_on && i.ended_on !== i.started_on ? ` – ${formatDate(i.ended_on)}` : ""}`,
              i.name,
              i.diagnosis ?? i.symptoms ?? "",
              i.treatment ?? "",
              i.facility ?? "",
            ])}
          />
        )}
        {extras.temperatures.filter((t) => t.measured_at.slice(0, 10) >= since).length > 0 && (
          <details open className="mt-2">
            <summary className="font-semibold">Nhật ký nhiệt độ</summary>
            <p className="text-text-2">
              {[...extras.temperatures]
                .filter((t) => t.measured_at.slice(0, 10) >= since)
                .sort((a, b) => b.measured_at.localeCompare(a.measured_at))
                .slice(0, 30)
                .map((t) => `${formatDateTime(t.measured_at)}: ${t.temp_c}°C${t.medicine ? ` (${t.medicine})` : ""}`)
                .join(" · ")}
            </p>
          </details>
        )}
      </Section>

      {extras.checkups.length > 0 && (
        <Section title="Khám định kỳ">
          <Table
            head={["Ngày", "Loại", "Nơi khám", "Kết quả"]}
            rows={extras.checkups
              .filter((c) => c.done_on >= since)
              .map((c) => [formatDate(c.done_on), CHECKUP_META[c.kind].label, c.facility ?? "", c.result ?? c.notes ?? ""])}
          />
        </Section>
      )}

      {vitals.length > 0 && (
        <Section title="Huyết áp · Đường huyết · Mỡ máu">
          <Table
            head={["Thời điểm", "Huyết áp", "Đường huyết", "Mỡ máu"]}
            rows={vitals.slice(0, 20).map((v) => [
              formatDateTime(v.measured_at),
              v.systolic ? `${v.systolic}/${v.diastolic}${v.pulse ? ` · mạch ${v.pulse}` : ""}` : "",
              v.glucose != null ? `${v.glucose} (${GLUCOSE_CONTEXT[v.glucose_context ?? "random"].toLowerCase()})` : "",
              LIPID_KEYS.filter((k) => v[k] != null)
                .map((k) => `${LIPID_META[k].label.split(" ")[0]} ${v[k]}`)
                .join(", "),
            ])}
          />
        </Section>
      )}

      <p className="border-t border-border pt-2 text-xs text-muted">
        Dữ liệu do gia đình tự ghi nhận trong ứng dụng Sổ Sức Khỏe. Đánh giá tăng trưởng theo chuẩn WHO; lịch tiêm theo TCMR Việt Nam – chỉ mang tính tham khảo.
      </p>
    </div>
  );
}

function Section({ title, children, breakBefore }: { title: string; children: React.ReactNode; breakBefore?: boolean }) {
  return (
    <section className={breakBefore ? "print-break" : ""}>
      <h2 className="mb-2 border-b border-border pb-1 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border text-left text-text-2">
            {head.map((h) => (
              <th key={h} className="px-2 py-1 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border">
              {r.map((c, j) => (
                <td key={j} className="tabular px-2 py-1 align-top">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
