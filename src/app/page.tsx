"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useFamily } from "@/components/FamilyProvider";
import { MemberForm } from "@/components/MemberForm";
import { Avatar, Empty, ErrorText, LevelIcon, Modal, Spinner } from "@/components/ui";
import { byMember, extrasOf, useFamilyData } from "@/lib/hooks";
import { recommendationsFor } from "@/lib/recommendations";
import { formatAge, formatDate } from "@/lib/date";
import { bmi } from "@/lib/growth";

export default function Home() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}

function Dashboard() {
  const { family, canEdit } = useFamily();
  const { data, error } = useFamilyData(family?.id);
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  const rows = useMemo(() => {
    if (!data) return [];
    return data.members.map((m) => {
      const ms = byMember(data.measurements, m.id);
      const recs = recommendationsFor(m, ms, byMember(data.vaccinations, m.id), byMember(data.illnesses, m.id), byMember(data.dewormings, m.id), extrasOf(data.extras, m.id));
      const lastH = [...ms].reverse().find((x) => x.height_cm)?.height_cm ?? null;
      const lastW = [...ms].reverse().find((x) => x.weight_kg)?.weight_kg ?? null;
      const lastDate = ms[ms.length - 1]?.measured_on;
      return { m, recs, lastH, lastW, lastDate };
    });
  }, [data]);

  if (error) return <ErrorText error={error} />;
  if (!data) return <Spinner />;

  const attention = rows.flatMap((r) => r.recs.filter((x) => x.level !== "info").map((x) => ({ ...x, member: r.m })));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Thành viên</h1>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            + Thêm thành viên
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <Empty title="Chưa có thành viên nào">
          Thêm con, bố mẹ hoặc chính bạn để bắt đầu theo dõi chiều cao, cân nặng, tiêm chủng và bệnh sử.
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map(({ m, recs, lastH, lastW, lastDate }) => {
            const urgent = recs.filter((r) => r.level === "danger" || r.level === "warning").length;
            return (
              <Link key={m.id} href={`/members/${m.id}`} className="card flex gap-4 p-4 transition hover:border-primary">
                <Avatar name={m.full_name} color={m.color} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{m.full_name}</p>
                      <p className="text-sm text-text-2">
                        {m.gender === "male" ? "Nam" : "Nữ"} · {formatAge(m.birth_date)}
                      </p>
                    </div>
                    {urgent > 0 && (
                      <span className="badge badge-warning" title="Mục cần chú ý">
                        ! {urgent}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <Stat label="Cao" value={lastH ? `${lastH} cm` : "—"} />
                    <Stat label="Nặng" value={lastW ? `${lastW} kg` : "—"} />
                    <Stat label="BMI" value={lastH && lastW ? String(bmi(lastW, lastH)) : "—"} />
                  </div>
                  {lastDate && <p className="mt-2 text-xs text-muted">Đo lần cuối {formatDate(lastDate)}</p>}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {attention.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Cần chú ý</h2>
          <div className="card divide-y divide-border">
            {attention.map((r, i) => (
              <Link key={i} href={`/members/${r.member.id}?tab=${r.tab ?? "overview"}`} className="flex gap-3 p-4 hover:bg-surface-2">
                <LevelIcon level={r.level} />
                <div className="min-w-0">
                  <p className="font-semibold">
                    <span className="text-text-2">{r.member.full_name}:</span> {r.title}
                  </p>
                  {r.detail && <p className="mt-0.5 text-sm text-text-2">{r.detail}</p>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Modal open={adding} title="Thêm thành viên" onClose={() => setAdding(false)}>
        {family && (
          <MemberForm
            familyId={family.id}
            onSaved={(m) => {
              setAdding(false);
              router.push(`/members/${m.id}?tab=growth`);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2 py-1.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="tabular font-semibold">{value}</p>
    </div>
  );
}
