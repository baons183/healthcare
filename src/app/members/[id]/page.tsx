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
import { FeverSection } from "@/components/FeverSection";
import { MedicationSection } from "@/components/MedicationSection";
import { DevelopmentTab } from "@/components/DevelopmentTab";
import { CheckupsTab } from "@/components/CheckupsTab";
import { Attachments } from "@/components/Attachments";
import { Avatar, confirmDelete, ErrorText, LevelIcon, Modal, Spinner } from "@/components/ui";
import { deleteMember, getMember, listDewormings, listExtras, listIllnesses, listMeasurements, listVaccinations } from "@/lib/data";
import { recommendationsFor } from "@/lib/recommendations";
import { ageInMonths, formatAge, formatDate } from "@/lib/date";
import { activeMedications, medicationSummary } from "@/lib/medications";
import { MILESTONE_MAX_AGE } from "@/lib/milestones";
import { EMPTY_EXTRAS, type Deworming, type Illness, type Measurement, type Member, type MemberExtras, type Vaccination } from "@/lib/types";

const ALL_TABS = [
  { key: "overview", label: "Tổng quan" },
  { key: "growth", label: "Tăng trưởng" },
  { key: "development", label: "Phát triển" },
  { key: "vaccines", label: "Tiêm chủng" },
  { key: "checkups", label: "Khám định kỳ" },
  { key: "illness", label: "Ốm & thuốc" },
] as const;
type Tab = (typeof ALL_TABS)[number]["key"];

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

  const [member, setMember] = useState<Member | null | undefined>(undefined);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);
  const [illnesses, setIllnesses] = useState<Illness[]>([]);
  const [dewormings, setDewormings] = useState<Deworming[]>([]);
  const [extras, setExtras] = useState<MemberExtras>(EMPTY_EXTRAS);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(params.get("edit") === "1");

  const load = useCallback(async () => {
    try {
      const [m, ms, vs, is, dws, ex] = await Promise.all([
        getMember(id),
        listMeasurements({ memberId: id }),
        listVaccinations({ memberId: id }),
        listIllnesses({ memberId: id }),
        listDewormings({ memberId: id }).catch(() => [] as Deworming[]),
        listExtras({ memberId: id }),
      ]);
      setMember(m);
      setMeasurements(ms);
      setVaccinations(vs);
      setIllnesses(is);
      setDewormings(dws);
      setExtras(ex);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const recs = useMemo(
    () => (member ? recommendationsFor(member, measurements, vaccinations, illnesses, dewormings, extras) : []),
    [member, measurements, vaccinations, illnesses, dewormings, extras],
  );
  const tabs = ALL_TABS.filter((t) => t.key !== "development" || (member && ageInMonths(member.birth_date) < MILESTONE_MAX_AGE));
  const tab = (tabs.find((t) => t.key === params.get("tab"))?.key ?? "overview") as Tab;

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
          {tabs.map((t) => (
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
          <div className="grid grid-cols-2 gap-2">
            <Link href={`/members/${member.id}/emergency`} className="card flex items-center gap-3 p-3 hover:border-danger">
              <span className="text-2xl" aria-hidden>🆘</span>
              <span>
                <span className="block font-semibold">Thẻ khẩn cấp</span>
                <span className="block text-xs text-text-2">Nhóm máu, dị ứng, mã QR</span>
              </span>
            </Link>
            <Link href={`/members/${member.id}/report`} className="card flex items-center gap-3 p-3 hover:border-primary">
              <span className="text-2xl" aria-hidden>📄</span>
              <span>
                <span className="block font-semibold">Xuất PDF</span>
                <span className="block text-xs text-text-2">Hồ sơ gửi bác sĩ</span>
              </span>
            </Link>
          </div>
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
            <Info label="Liên hệ khẩn cấp" value={[member.emergency_contact, member.emergency_phone].filter(Boolean).join(" – ") || null} />
            <Info label="Số thẻ BHYT" value={member.insurance_number ?? null} />
            <Info label="Ghi chú" value={member.notes} />
          </section>

          {activeMedications(extras.medications).length > 0 && (
            <section className="card p-4">
              <h3 className="mb-2 font-bold">💊 Thuốc đang dùng</h3>
              <ul className="space-y-1 text-sm">
                {activeMedications(extras.medications).map((m) => (
                  <li key={m.id}>
                    <b>{m.name}</b> <span className="text-text-2">– {medicationSummary(m)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

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
      {tab === "development" && <DevelopmentTab member={member} milestones={extras.milestones} canEdit={canEdit} onChange={load} />}
      {tab === "checkups" && (
        <CheckupsTab
          member={member}
          checkups={extras.checkups}
          vitals={extras.vitals}
          pregnancies={extras.pregnancies}
          vaccinations={vaccinations}
          measurements={measurements}
          canEdit={canEdit}
          onChange={load}
        />
      )}
      {tab === "illness" && (
        <div className="space-y-5">
          <MedicationSection member={member} medications={extras.medications} illnesses={illnesses} canEdit={canEdit} onChange={load} />
          <FeverSection
            member={member}
            temps={extras.temperatures}
            illnesses={illnesses}
            weightKg={[...measurements].sort((a, b) => a.measured_on.localeCompare(b.measured_on)).reverse().find((x) => x.weight_kg)?.weight_kg ?? null}
            canEdit={canEdit}
            onChange={load}
          />
          <div>
            <h3 className="mb-2 text-lg font-bold">Bệnh sử</h3>
            <IllnessTab member={member} illnesses={illnesses} canEdit={canEdit} onChange={load} />
          </div>
        </div>
      )}

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
