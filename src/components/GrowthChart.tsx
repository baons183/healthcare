"use client";
import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Gender, Measurement } from "@/lib/types";
import { ADULT_MONTHS, bmi, INDICATORS, maxMonths, percentile, valueAtZ, zScore, type Indicator } from "@/lib/growth";
import { ageInMonths, formatDate } from "@/lib/date";

/** Đường bách phân vị hiển thị */
const CURVES = [
  { key: "p97", z: 1.881, label: "P97", strong: false, dashed: true },
  { key: "p85", z: 1.036, label: "P85", strong: false, dashed: false },
  { key: "p50", z: 0, label: "P50", strong: true, dashed: false },
  { key: "p15", z: -1.036, label: "P15", strong: false, dashed: false },
  { key: "p3", z: -1.881, label: "P3", strong: false, dashed: true },
] as const;

export type RangeKey = "auto" | "0-24" | "0-60" | "60-228";

export function valueOf(m: Measurement, ind: Indicator): number | null {
  if (ind === "weight") return m.weight_kg;
  if (ind === "height") return m.height_cm;
  if (ind === "head") return m.head_cm;
  return m.weight_kg && m.height_cm ? bmi(m.weight_kg, m.height_cm) : null;
}

function resolveRange(range: RangeKey, ind: Indicator, ageNow: number, points: number[]): [number, number] {
  const max = maxMonths(ind);
  let r: [number, number];
  if (range === "0-24") r = [0, 24];
  else if (range === "0-60") r = [0, 60];
  else if (range === "60-228") r = [60, 228];
  else {
    const hi = Math.max(ageNow, ...points);
    r = hi <= 24 ? [0, 24] : hi <= 60 ? [0, 60] : [60, 228];
  }
  return [Math.min(r[0], max), Math.min(r[1], max)];
}

function fmtAgeTick(m: number) {
  if (m === 0) return "0";
  if (m < 24 || m % 12 !== 0) return `${m}th`;
  return `${m / 12}t`;
}

function fmtAgeLong(m: number) {
  const y = Math.floor(m / 12);
  const mo = Math.round(m - y * 12);
  if (y === 0) return `${m.toFixed(1)} tháng`;
  return mo ? `${y} tuổi ${mo} tháng` : `${y} tuổi`;
}

interface Row {
  x: number;
  band?: [number, number];
  p97?: number;
  p85?: number;
  p50?: number;
  p15?: number;
  p3?: number;
  child?: number;
  date?: string;
  z?: number | null;
}

export function GrowthChart({
  gender,
  birthDate,
  measurements,
  indicator,
  range,
}: {
  gender: Gender;
  birthDate: string;
  measurements: Measurement[];
  indicator: Indicator;
  range: RangeKey;
}) {
  const ageNow = ageInMonths(birthDate);
  const meta = INDICATORS[indicator];

  const { rows, domain, ticks, hasPoints } = useMemo(() => {
    const pts = measurements
      .map((m) => ({ m, x: ageInMonths(birthDate, m.measured_on), v: valueOf(m, indicator) }))
      .filter((p) => p.v != null && p.x >= 0) as { m: Measurement; x: number; v: number }[];
    const [lo, hi] = resolveRange(range, indicator, ageNow, pts.map((p) => p.x).filter((x) => x <= maxMonths(indicator)));
    const step = hi - lo <= 24 ? 0.5 : hi - lo <= 60 ? 1 : 2;
    const rows: Row[] = [];
    for (let x = lo; x <= hi + 1e-9; x += step) {
      const r: Row = { x };
      for (const c of CURVES) {
        const v = valueAtZ(gender, indicator, x, c.z);
        if (v != null) r[c.key] = Math.round(v * 100) / 100;
      }
      if (r.p3 != null && r.p97 != null) r.band = [r.p3, r.p97];
      rows.push(r);
    }
    const inRange = pts.filter((p) => p.x >= lo && p.x <= hi);
    for (const p of inRange) {
      rows.push({ x: Math.round(p.x * 100) / 100, child: p.v, date: p.m.measured_on, z: zScore(gender, indicator, p.x, p.v) });
    }
    rows.sort((a, b) => a.x - b.x);
    const tickStep = hi - lo <= 24 ? 3 : hi - lo <= 60 ? 6 : 12;
    const ticks: number[] = [];
    for (let t = Math.ceil(lo / tickStep) * tickStep; t <= hi; t += tickStep) ticks.push(t);
    return { rows, domain: [lo, hi] as [number, number], ticks, hasPoints: inRange.length > 0 };
  }, [measurements, birthDate, gender, indicator, range, ageNow]);

  if (domain[0] >= domain[1]) {
    return <p className="py-10 text-center text-sm text-text-2">Không có dữ liệu chuẩn WHO cho chỉ số này ở độ tuổi đã chọn.</p>;
  }

  const lastRef = rows.filter((r) => r.p50 != null).at(-1);

  return (
    <div>
      <div className="h-[340px] w-full" role="img" aria-label={`Biểu đồ ${meta.label.toLowerCase()} so với chuẩn WHO`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 10, right: 40, bottom: 4, left: -8 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              type="number"
              dataKey="x"
              domain={domain}
              ticks={ticks}
              tickFormatter={fmtAgeTick}
              tick={{ fontSize: 12, fill: "var(--muted)" }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 12, fill: "var(--muted)" }}
              axisLine={false}
              tickLine={false}
              width={48}
              unit={indicator === "bmi" ? "" : ""}
            />
            <Tooltip
              content={<ChartTooltip unit={meta.unit} />}
              cursor={{ stroke: "var(--text-2)", strokeWidth: 1, strokeDasharray: "3 3" }}
            />
            <Area dataKey="band" stroke="none" fill="var(--chart-band)" connectNulls isAnimationActive={false} activeDot={false} />
            {CURVES.map((c) => (
              <Line
                key={c.key}
                dataKey={c.key}
                stroke={c.strong ? "var(--chart-ref-strong)" : "var(--chart-ref)"}
                strokeWidth={c.strong ? 2 : 1.25}
                strokeDasharray={c.dashed ? "5 4" : undefined}
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={false}
                label={(p: { x?: number; y?: number; index?: number }) =>
                  rows[p.index ?? -1] === lastRef && p.x != null && p.y != null ? (
                    <text key={c.key} x={p.x + 4} y={p.y + 4} fontSize={11} fill="var(--text-2)">
                      {c.label}
                    </text>
                  ) : (
                    <g key={`${c.key}-${p.index}`} />
                  )
                }
              />
            ))}
            <Line
              dataKey="child"
              stroke="var(--chart-series)"
              strokeWidth={2}
              connectNulls
              isAnimationActive={false}
              dot={{ r: 4.5, fill: "var(--chart-series)", stroke: "var(--surface)", strokeWidth: 2 }}
              activeDot={{ r: 7, fill: "var(--chart-series)", stroke: "var(--surface)", strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Legend hasPoints={hasPoints} />
    </div>
  );
}

function Legend({ hasPoints }: { hasPoints: boolean }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-2">
      <span className="flex items-center gap-1.5">
        <svg width="22" height="10" aria-hidden>
          <line x1="0" y1="5" x2="22" y2="5" stroke="var(--chart-series)" strokeWidth="2" />
          <circle cx="11" cy="5" r="4" fill="var(--chart-series)" stroke="var(--surface)" strokeWidth="1.5" />
        </svg>
        Số đo {hasPoints ? "" : "(chưa có trong khoảng này)"}
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="22" height="10" aria-hidden>
          <line x1="0" y1="5" x2="22" y2="5" stroke="var(--chart-ref-strong)" strokeWidth="2" />
        </svg>
        Trung vị (P50)
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="22" height="10" aria-hidden>
          <line x1="0" y1="5" x2="22" y2="5" stroke="var(--chart-ref)" strokeWidth="1.25" />
        </svg>
        P15 – P85
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="22" height="10" aria-hidden>
          <rect width="22" height="10" fill="var(--chart-band)" />
          <line x1="0" y1="1" x2="22" y2="1" stroke="var(--chart-ref)" strokeDasharray="5 4" />
          <line x1="0" y1="9" x2="22" y2="9" stroke="var(--chart-ref)" strokeDasharray="5 4" />
        </svg>
        Vùng bình thường P3 – P97 (WHO)
      </span>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: { payload: Row }[];
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="card px-3 py-2 text-xs shadow-lg">
      {r.child != null ? (
        <>
          <p className="font-semibold">{formatDate(r.date)}</p>
          <p className="text-text-2">{fmtAgeLong(r.x)}</p>
          <p className="tabular mt-1 text-sm font-bold">
            {r.child} {unit}
          </p>
          {r.z != null && (
            <p className="tabular text-text-2">
              z = {r.z.toFixed(2)} · bách phân vị {percentile(r.z)}%
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mb-1 font-semibold">Chuẩn WHO lúc {fmtAgeLong(r.x)}</p>
          {CURVES.map((c) =>
            r[c.key] != null ? (
              <p key={c.key} className="tabular flex justify-between gap-4 text-text-2">
                <span>{c.label}</span>
                <span>
                  {r[c.key]} {unit}
                </span>
              </p>
            ) : null,
          )}
        </>
      )}
    </div>
  );
}

/** Biểu đồ người lớn: diễn biến theo thời gian, BMI có vùng phân loại (châu Á) */
export function AdultChart({ measurements, indicator }: { measurements: Measurement[]; indicator: Indicator }) {
  const meta = INDICATORS[indicator];
  const rows = measurements
    .map((m) => ({ t: new Date(m.measured_on).getTime(), date: m.measured_on, v: valueOf(m, indicator) }))
    .filter((r) => r.v != null);
  if (rows.length === 0) return <p className="py-10 text-center text-sm text-text-2">Chưa có số đo {meta.short.toLowerCase()}.</p>;
  const vals = rows.map((r) => r.v as number);
  const yMin = indicator === "bmi" ? Math.min(16, ...vals) - 1 : Math.floor(Math.min(...vals) * 0.95);
  const yMax = indicator === "bmi" ? Math.max(30, ...vals) + 1 : Math.ceil(Math.max(...vals) * 1.05);
  const fmt = (t: number) => {
    const d = new Date(t);
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
  };
  return (
    <div>
      <div className="h-[300px] w-full" role="img" aria-label={`Diễn biến ${meta.short.toLowerCase()} theo thời gian`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 10, right: 16, bottom: 4, left: -8 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            {indicator === "bmi" && (
              <>
                <ReferenceArea y1={18.5} y2={23} fill="var(--chart-band)" fillOpacity={1} />
              </>
            )}
            <XAxis
              type="number"
              dataKey="t"
              domain={rows.length === 1 ? [rows[0].t - 864e5 * 30, rows[0].t + 864e5 * 30] : ["dataMin", "dataMax"]}
              tickFormatter={fmt}
              tick={{ fontSize: 12, fill: "var(--muted)" }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              scale="time"
            />
            <YAxis domain={[yMin, yMax]} tick={{ fontSize: 12, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={48} />
            <Tooltip
              cursor={{ stroke: "var(--text-2)", strokeWidth: 1, strokeDasharray: "3 3" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="card px-3 py-2 text-xs shadow-lg">
                    <p className="font-semibold">{formatDate((payload[0].payload as { date: string }).date)}</p>
                    <p className="tabular text-sm font-bold">
                      {String(payload[0].value)} {meta.unit}
                    </p>
                  </div>
                ) : null
              }
            />
            <Line
              dataKey="v"
              stroke="var(--chart-series)"
              strokeWidth={2}
              isAnimationActive={false}
              dot={{ r: 4.5, fill: "var(--chart-series)", stroke: "var(--surface)", strokeWidth: 2 }}
              activeDot={{ r: 7 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {indicator === "bmi" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-text-2">
          <span className="inline-block h-2.5 w-5" style={{ background: "var(--chart-band)" }} aria-hidden />
          BMI bình thường cho người châu Á: 18,5 – 22,9 · Thừa cân: 23 – 24,9 · Béo phì: ≥ 25
        </p>
      )}
    </div>
  );
}

export { ADULT_MONTHS };
