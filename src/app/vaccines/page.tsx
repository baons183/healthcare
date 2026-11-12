"use client";
import Link from "next/link";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { useFamily } from "@/components/FamilyProvider";
import { Avatar, Empty, ErrorText, Spinner } from "@/components/ui";
import { byMember, useFamilyData } from "@/lib/hooks";
import { buildSchedule, STATUS_META } from "@/lib/vaccines";
import { daysBetween, formatDate, today } from "@/lib/date";

export default function VaccinesPage() {
  return (
    <AppShell>
      <FamilyVaccines />
    </AppShell>
  );
}

function FamilyVaccines() {
  const { family } = useFamily();
  const { data, error } = useFamilyData(family?.id);

  const items = useMemo(() => {
    if (!data) return [];
    const horizon = 120; // 4 tháng tới (ngày)
    return data.members
      .flatMap((m) =>
        buildSchedule(m.birth_date, byMember(data.vaccinations, m.id))
          .filter((d) => d.status === "overdue" || d.status === "due" || (d.status === "upcoming" && daysBetween(today(), d.dueDate) <= horizon))
          .map((d) => ({ ...d, member: m })),
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [data]);

  if (error) return <ErrorText error={error} />;
  if (!data) return <Spinner />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Lịch tiêm cả nhà</h1>
        <p className="text-sm text-text-2">Các mũi quá hạn, đến hạn và trong 4 tháng tới</p>
      </div>
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
    </div>
  );
}
