"use client";
import { useState } from "react";
import { saveMember } from "@/lib/data";
import { today } from "@/lib/date";
import { contactsOf, type EmergencyContact, type Member } from "@/lib/types";
import { ErrorText, Field } from "./ui";

const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#6250d6", "#e87ba4", "#008300", "#c98500", "#e34948"];
const BLOOD = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export function MemberForm({
  familyId,
  member,
  onSaved,
}: {
  familyId: string;
  member?: Member;
  onSaved: (m: Member) => void;
}) {
  const [f, setF] = useState<Partial<Member>>(
    member ?? { family_id: familyId, gender: "male", birth_date: "", color: COLORS[Math.floor(Math.random() * COLORS.length)] },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<EmergencyContact[]>(() => {
    const c = member ? contactsOf(member) : [];
    return c.length ? c : [{ name: "", phone: "" }];
  });
  const setContact = (i: number, k: keyof EmergencyContact, v: string) => setContacts((cs) => cs.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const set = <K extends keyof Member>(k: K, v: Member[K]) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await saveMember({
        id: f.id,
        family_id: familyId,
        full_name: f.full_name?.trim(),
        gender: f.gender,
        birth_date: f.birth_date,
        blood_type: f.blood_type,
        allergies: f.allergies,
        chronic_conditions: f.chronic_conditions,
        notes: f.notes,
        color: f.color,
        // cột mới (migration 0005) – chỉ gửi khi có giá trị để không lỗi nếu chưa chạy SQL
        ...contactFields(contacts, member),
        ...(f.insurance_number || member?.insurance_number ? { insurance_number: f.insurance_number } : {}),
      });
      onSaved(saved);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(/emergency_contacts/.test(msg) ? "Chưa cập nhật database – hãy chạy file SQL 0010_emergency_contacts.sql trong Supabase." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Họ tên *">
        <input className="input" required value={f.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Giới tính *">
          <select className="input" value={f.gender} onChange={(e) => set("gender", e.target.value as Member["gender"])}>
            <option value="male">Nam</option>
            <option value="female">Nữ</option>
          </select>
        </Field>
        <Field label="Ngày sinh *">
          <input className="input" type="date" required max={today()} value={f.birth_date ?? ""} onChange={(e) => set("birth_date", e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nhóm máu">
          <select className="input" value={f.blood_type ?? ""} onChange={(e) => set("blood_type", e.target.value)}>
            {BLOOD.map((b) => (
              <option key={b} value={b}>
                {b || "Chưa rõ"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Màu đại diện">
          <div className="flex flex-wrap gap-1.5 pt-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set("color", c)}
                aria-label={`Chọn màu ${c}`}
                className="h-7 w-7 rounded-full"
                style={{ background: c, outline: f.color === c ? "2px solid var(--text)" : "none", outlineOffset: 2 }}
              />
            ))}
          </div>
        </Field>
      </div>
      <Field label="Dị ứng" hint="Thuốc, thức ăn… VD: penicillin, hải sản">
        <input className="input" value={f.allergies ?? ""} onChange={(e) => set("allergies", e.target.value)} />
      </Field>
      <Field label="Bệnh nền / mãn tính">
        <input className="input" value={f.chronic_conditions ?? ""} onChange={(e) => set("chronic_conditions", e.target.value)} />
      </Field>
      <fieldset className="space-y-3 rounded-xl border border-border p-3">
        <legend className="px-1 text-sm font-bold">🆘 Thông tin khẩn cấp</legend>
        <div className="space-y-2">
          <span className="label">Người liên hệ</span>
          {contacts.map((c, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="input min-w-0 flex-1"
                value={c.name}
                placeholder={i === 0 ? "VD: Mẹ – Lan" : "VD: Bố – Hùng"}
                aria-label={`Tên người liên hệ ${i + 1}`}
                onChange={(e) => setContact(i, "name", e.target.value)}
              />
              <input
                className="input w-[42%] min-w-0"
                type="tel"
                inputMode="tel"
                value={c.phone}
                placeholder="Số điện thoại"
                aria-label={`SĐT người liên hệ ${i + 1}`}
                onChange={(e) => setContact(i, "phone", e.target.value)}
              />
              {contacts.length > 1 && (
                <button type="button" className="btn btn-sm" aria-label={`Xóa người liên hệ ${i + 1}`} onClick={() => setContacts((cs) => cs.filter((_, j) => j !== i))}>
                  ✕
                </button>
              )}
            </div>
          ))}
          {contacts.length < 5 && (
            <button type="button" className="text-sm text-primary underline" onClick={() => setContacts((cs) => [...cs, { name: "", phone: "" }])}>
              + Thêm người liên hệ
            </button>
          )}
        </div>
        <Field label="Số thẻ BHYT">
          <input className="input" value={f.insurance_number ?? ""} onChange={(e) => set("insurance_number", e.target.value)} />
        </Field>
      </fieldset>
      <Field label="Ghi chú">
        <textarea className="input" rows={2} value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <ErrorText error={error} />
      <div className="flex justify-end">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </form>
  );
}

/** Lưu danh sách liên hệ; người đầu tiên ghi thêm vào cột cũ để tương thích */
function contactFields(contacts: EmergencyContact[], member?: Member): Partial<Member> {
  const list = contacts.map((c) => ({ name: c.name.trim(), phone: c.phone.trim() })).filter((c) => c.name || c.phone);
  const had = !!member && contactsOf(member).length > 0;
  if (!list.length && !had) return {};
  const first = list[0];
  return { emergency_contacts: list, emergency_contact: first?.name || null, emergency_phone: first?.phone || null };
}
