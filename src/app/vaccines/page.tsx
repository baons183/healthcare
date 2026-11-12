"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useFamily } from "@/components/FamilyProvider";
import { ScanVaccines } from "@/components/ScanVaccines";
import { Avatar, Empty, ErrorText, Field, Modal, Spinner } from "@/components/ui";
import { byMember, useFamilyData } from "@/lib/hooks";
import { buildSchedule, isSoon, SOON_DAYS, STATUS_META } from "@/lib/vaccines";
import { formatAge, formatDate } from "@/lib/date";
import { DEWORM_META, dewormStatus } from "@/lib/deworming";

export default function VaccinesPage() {
  return (
    <AppShell>
      <FamilyVaccines />
    </AppShell>
  );
}

function FamilyVaccines() {
  const { family, canEdit } = useFamily();
  const { data, error, reload } = useFamilyData(family?.id);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMemberId, setScanMemberId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const items = useMemo(() => {
    if (!data) return [];
    return data.members
      .flatMap((m) =>
        buildSchedule(m.birth_date, byMember(data.vaccinations, m.id))
          .filter((d) => d.status === "overdue" || d.status === "due" || isSoon(d))
          .map((d) => ({ ...d, member: m })),
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [data]);

  if (error) return <ErrorText error={error} />;
  if (!data) return <Spinner />;

  const scanMember = data.members.find((m) => m.id === scanMemberId);
  const deworm = data.members
    .map((m) => ({ m, st: dewormStatus(m.birth_date, byMember(data.dewormings, m.id)) }))
    .filter(({ st }) => st.state === "due" || st.state === "overdue" || st.state === "nodata" || st.soon);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Lịch tiêm & xổ giun cả nhà</h1>
          <p className="text-sm text-text-2">Các mũi quá hạn, đến hạn và sắp tới trong {SOON_DAYS} ngày</p>
        </div>
        {canEdit && data.members.length > 0 && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setScanMemberId(data.members.length === 1 ? data.members[0].id : "");
              setScanOpen(true);
            }}
          >
            ✨ Quét sổ tiêm bằng AI
          </button>
        )}
      </div>

      {notice && <p className="rounded-lg bg-[var(--good-soft)] px-3 py-2 text-sm text-good">{notice}</p>}

      {deworm.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold">🪱 Xổ giun</h2>
          <div className="card divide-y divide-border">
            {deworm.map(({ m, st }) => {
              const meta = st.soon ? { label: "Sắp tới", cls: "badge-info" } : DEWORM_META[st.state];
              return (
                <Link key={m.id} href={`/members/${m.id}?tab=vaccines`} className="flex items-center gap-3 p-3 hover:bg-surface-2">
                  <Avatar name={m.full_name} color={m.color} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{m.full_name}</p>
                    <p className="text-xs text-text-2">
                      {st.last ? `Lần gần nhất ${formatDate(st.last.given_on)} · hạn ${formatDate(st.nextDate)}` : `Nên xổ giun ${st.intervalMonths} tháng/lần`}
                    </p>
                  </div>
                  <span className={`badge ${meta.cls}`}>{meta.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {items.length > 0 && <h2 className="text-lg font-bold">💉 Tiêm chủng</h2>}
      {items.length === 0 ? (
        <Empty title="Không có mũi tiêm nào sắp tới">Mọi người đã tiêm đủ theo lịch hoặc chưa có thành viên nào.</Empty>
      ) : (
        <div className="card divide-y divide-border">
          {items.map((d, i) => {
            const s = STATUS_META[d.status];
            return (
              <Link key={i} href={`/members/${d.member.id}?tab=vaccines`} className="flex items-center gap-3 p-3 hover:bg-surface-2">
                <Avatar name={d.member.full_name} color={d.member.color} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {d.vaccine.name} <span className="font-normal text-text-2">· {d.label}</span>
                  </p>
                  <p className="text-xs text-text-2">
                    {d.member.full_name} · {formatDate(d.dueDate)}
                    {d.vaccine.program === "tcmr" ? " · TCMR" : " · Dịch vụ"}
                  </p>
                </div>
                <span className={`badge ${s.cls}`}>
                  <span aria-hidden>{s.icon}</span> {s.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <Modal open={scanOpen} title="Quét sổ tiêm bằng AI" onClose={() => setScanOpen(false)} wide>
        <div className="space-y-4">
          <Field label="Sổ tiêm của ai?">
            <select className="input" value={scanMemberId} onChange={(e) => setScanMemberId(e.target.value)}>
              <option value="">— Chọn thành viên —</option>
              {data.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} ({formatAge(m.birth_date)})
                </option>
              ))}
            </select>
          </Field>
          {scanMember && (
            <ScanVaccines
              key={scanMember.id}
              member={scanMember}
              existing={byMember(data.vaccinations, scanMember.id)}
              onDone={(n) => {
                setScanOpen(false);
                setNotice(`Đã lưu ${n} mũi tiêm cho ${scanMember.full_name}. Xem chi tiết trong trang của thành viên.`);
                reload();
              }}
            />
          )}
        </div>
      </Modal>
    </div>
  );
}
