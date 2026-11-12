"use client";
import { useState } from "react";
import type { Member, Milestone } from "@/lib/types";
import { deleteMilestone, saveMilestone } from "@/lib/data";
import { ageInMonths, formatAge, formatDate, today } from "@/lib/date";
import { DOMAIN_META, fmtMonths, milestoneItems, type MilestoneItem, type MilestoneState } from "@/lib/milestones";
import { ErrorText, Field, Modal } from "./ui";

const STATE_META: Record<MilestoneState, { label: string; cls: string }> = {
  done: { label: "Đã làm được", cls: "badge-good" },
  late: { label: "Nên hỏi bác sĩ", cls: "badge-warning" },
  now: { label: "Đang ở độ tuổi này", cls: "badge-info" },
  later: { label: "Sắp tới", cls: "badge-muted" },
};

export function DevelopmentTab({
  member,
  milestones,
  canEdit,
  onChange,
}: {
  member: Member;
  milestones: Milestone[];
  canEdit: boolean;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<MilestoneItem | null>(null);
  const [showLater, setShowLater] = useState(false);
  const age = ageInMonths(member.birth_date);
  const items = milestoneItems(member.birth_date, milestones);
  const groups: { key: MilestoneState; items: MilestoneItem[] }[] = (["late", "now", "done", "later"] as MilestoneState[]).map((k) => ({
    key: k,
    items: items.filter((i) => i.state === k).filter((i) => k !== "later" || showLater || i.spec.typical <= age + 6),
  }));
  const done = items.filter((i) => i.state === "done").length;
  const hiddenLater = items.filter((i) => i.state === "later").length - (groups.find((g) => g.key === "later")?.items.length ?? 0);

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <h3 className="font-bold">👶 Mốc phát triển</h3>
        <p className="mt-1 text-sm text-text-2">
          {formatAge(member.birth_date)} · đã ghi nhận {done}/{items.length} mốc. Bấm vào một mốc để đánh dấu ngày con làm được.
        </p>
        <p className="mt-2 text-xs text-muted">
          Vận động: chuẩn WHO (khoảng 1%–99% trẻ đạt được). Ngôn ngữ, xã hội: mốc CDC 2022 (≥ 75% trẻ đạt được ở độ tuổi đó). Mỗi trẻ phát triển một
          nhịp khác nhau – “nên hỏi bác sĩ” chỉ là gợi ý theo dõi, không phải chẩn đoán.
        </p>
      </section>

      {groups.map(
        (g) =>
          g.items.length > 0 && (
            <section key={g.key}>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">
                {STATE_META[g.key].label} · {g.items.length}
              </p>
              <div className="card divide-y divide-border">
                {g.items.map((i) => (
                  <button
                    key={i.spec.code}
                    className="flex w-full items-center gap-3 p-3 text-left hover:bg-surface-2 disabled:cursor-default"
                    onClick={() => setEditing(i)}
                    disabled={!canEdit && !i.record}
                  >
                    <span className="text-lg" aria-hidden>
                      {i.state === "done" ? "✅" : DOMAIN_META[i.spec.domain].icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{i.spec.label}</span>
                      <span className="block text-xs text-text-2">
                        {DOMAIN_META[i.spec.domain].label} · thường đạt ~{fmtMonths(i.spec.typical)}
                        {i.spec.late ? `, muộn nhất ~${fmtMonths(i.spec.late)}` : ""}
                      </span>
                    </span>
                    {i.record ? (
                      <span className="text-right text-xs text-text-2">
                        {formatDate(i.record.achieved_on)}
                        <br />
                        {formatAge(member.birth_date, i.record.achieved_on)}
                      </span>
                    ) : (
                      <span className={`badge ${STATE_META[i.state].cls}`}>{STATE_META[i.state].label}</span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          ),
      )}
      {hiddenLater > 0 && (
        <button className="text-sm text-primary underline" onClick={() => setShowLater(true)}>
          Xem thêm {hiddenLater} mốc ở độ tuổi lớn hơn
        </button>
      )}

      <Modal open={!!editing} title={editing?.spec.label ?? ""} onClose={() => setEditing(null)}>
        {editing && (
          <MilestoneForm
            member={member}
            item={editing}
            canEdit={canEdit}
            onDone={() => {
              setEditing(null);
              onChange();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function MilestoneForm({ member, item, canEdit, onDone }: { member: Member; item: MilestoneItem; canEdit: boolean; onDone: () => void }) {
  const [date, setDate] = useState(item.record?.achieved_on ?? today());
  const [notes, setNotes] = useState(item.record?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() =>
          saveMilestone({ id: item.record?.id, family_id: member.family_id, member_id: member.id, code: item.spec.code, achieved_on: date, notes }),
        );
      }}
    >
      <p className="text-sm text-text-2">
        {DOMAIN_META[item.spec.domain].label} · thường đạt khoảng {fmtMonths(item.spec.typical)} (nguồn {item.spec.source})
      </p>
      <fieldset disabled={!canEdit} className="space-y-4">
        <Field label="Ngày con làm được" hint={date ? `Lúc ${formatAge(member.birth_date, date)}` : undefined}>
          <input className="input" type="date" required min={member.birth_date} max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Ghi chú">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="VD: lần đầu tự đi 5 bước" />
        </Field>
      </fieldset>
      <ErrorText error={error} />
      {canEdit && (
        <div className="flex justify-between gap-2">
          {item.record ? (
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => run(() => deleteMilestone(item.record!.id))}>
              Bỏ đánh dấu
            </button>
          ) : (
            <span />
          )}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Đang lưu…" : "✓ Đã làm được"}
          </button>
        </div>
      )}
    </form>
  );
}
