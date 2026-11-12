"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { useFamily } from "@/components/FamilyProvider";
import { MemberForm } from "@/components/MemberForm";
import { GrowthTab } from "@/components/GrowthTab";
import { VaccinesTab } from "@/components/VaccinesTab";
import { IllnessTab } from "@/components/IllnessTab";
import { Attachments } from "@/components/Attachments";
import { Avatar, confirmDelete, ErrorText, LevelIcon, Modal, Spinner } from "@/components/ui";
import { deleteMember, getMember, listDewormings, listIllnesses, listMeasurements, listVaccinations } from "@/lib/data";
import { recommendationsFor } from "@/lib/recommendations";
import { formatAge, formatDate } from "@/lib/date";
import type { Deworming, Illness, Measurement, Member, Vaccination } from "@/lib/types";

const TABS = [
  { key: "overview", label: "Tổng quan" },
  { key: "growth", label: "Tăng trưởng" },
  { key: "vaccines", label: "Tiêm chủng" },
  { key: "illness", label: "Bệnh sử" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default function MemberPage() {
  return (
    <AppShell>
      <Suspense fallback={<Spinner />}>
        <MemberView />
      </Suspense>
    </AppShell>
  );
}

function MemberView() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { canEdit } = useFamily();
  const tab = (TABS.find((t) => t.key === params.get("tab"))?.key ?? "overview") as Tab;

  const [member, setMember] = useState<Member | null | undefined>(undefined);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);
  const [illnesses, setIllnesses] = useState<Illness[]>([]);
  const [dewormings, setDewormings] = useState<Deworming[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, ms, vs, is, dws] = await Promise.all([
        getMember(id),
        listMeasurements({ memberId: id }),
        listVaccinations({ memberId: id }),
        listIllnesses({ memberId: id }),
        listDewormings({ memberId: id }).catch(() => [] as Deworming[]),
      ]);
      setMember(m);
      setMeasurements(ms);
      setVaccinations(vs);
      setIllnesses(is);
      setDewormings(dws);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const recs = useMemo(
    () => (member ? recommendationsFor(member, measurements, vaccinations, illnesses, dewormings) : []),
    [member, measurements, vaccinations, illnesses, dewormings],
  );

  if (error) return <ErrorText error={error} />;
  if (member === undefined) return <Spinner />;
  if (member === null)
    return (
      <p className="py-10 text-center">
        Không tìm thấy thành viên. <Link href="/" className="text-primary underline">Quay lại</Link>
      </p>
    );

  const setTab = (t: Tab) => router.replace(`/members/${id}?tab=${t}`, { scroll: false });

  async function onDelete() {
    if (!member || !confirmDelete(`${member.full_name} và toàn bộ dữ liệu liên quan`)) return;
    await deleteMember(member.id);
    router.replace("/");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar name={member.full_name} color={member.color} size={60} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">{member.full_name}</h1>
          <p className="text-sm text-text-2">
            {member.gender === "male" ? "Nam" : "Nữ"} · {formatAge(member.birth_date)} · sinh {formatDate(member.birth_date)}
          </p>
        </div>
        {canEdit && (
          <button className="btn btn-sm" onClick={() => setEditing(true)}>
            Sửa hồ sơ
          </button>
        )}
      </div>

      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex min-w-max gap-1 border-b border-border" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === t.key ? "border-primary text-primary" : "border-transparent text-text-2 hover:text-text"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" && (
        <div className="space-y-5">
          <section>
            <h3 className="mb-2 text-lg font-bold">Khuyến cáo</h3>
            {recs.length === 0 ? (
              <div className="card flex items-center gap-3 p-4">
                <LevelIcon level="good" />
                <p>Mọi thứ đều ổn. Hãy tiếp tục cập nhật số đo và mũi tiêm định kỳ.</p>
              </div>
            ) : (
              <div className="card divide-y divide-border">
                {recs.map((r, i) => (
                  <button key={i} className="flex w-full gap-3 p-4 text-left hover:bg-surface-2" onClick={() => r.tab && setTab(r.tab === "profile" ? "overview" : r.tab)}>
                    <LevelIcon level={r.level} />
                    <div>
                      <p className="font-semibold">{r.title}</p>
                      {r.detail && <p className="mt-0.5 text-sm text-text-2">{r.detail}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-muted">Khuyến cáo tự động dựa trên chuẩn WHO, chỉ mang tính tham khảo, không thay thế chẩn đoán của bác sĩ.</p>
          </section>

          <section className="card grid gap-4 p-4 sm:grid-cols-2">
            <Info label="Nhóm máu" value={member.blood_type} />
            <Info label="Dị ứng" value={member.allergies} highlight />
            <Info label="Bệnh nền" value={member.chronic_conditions} />
            <Info label="Ghi chú" value={member.notes} />
          </section>

          <section className="card p-4">
            <h3 className="mb-2 font-bold">Giấy tờ khác</h3>
            <p className="mb-3 text-xs text-muted">Giấy khai sinh, sổ khám, bảo hiểm y tế, kết quả xét nghiệm…</p>
            <Attachments member={member} refType="general" refId={null} canEdit={canEdit} />
          </section>

          {canEdit && (
            <div className="text-right">
              <button className="btn btn-danger btn-sm" onClick={onDelete}>
                Xóa thành viên
              </button>
            </div>
          )}
        </div>
      )}
      {tab === "growth" && <GrowthTab member={member} measurements={measurements} canEdit={canEdit} onChange={load} />}
      {tab === "vaccines" && <VaccinesTab member={member} vaccinations={vaccinations} dewormings={dewormings} canEdit={canEdit} onChange={load} />}
      {tab === "illness" && <IllnessTab member={member} illnesses={illnesses} canEdit={canEdit} onChange={load} />}

      <Modal open={editing} title="Sửa hồ sơ" onClose={() => setEditing(false)}>
        <MemberForm
          familyId={member.family_id}
          member={member}
          onSaved={(m) => {
            setMember(m);
            setEditing(false);
          }}
        />
      </Modal>
    </div>
  );
}

function Info({ label, value, highlight }: { label: string; value: string | null; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className={value && highlight ? "font-semibold text-danger" : value ? "" : "text-muted"}>{value || "—"}</p>
    </div>
  );
}
