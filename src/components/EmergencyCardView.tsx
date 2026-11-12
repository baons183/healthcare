import { formatAge, formatDate } from "@/lib/date";

export interface EmergencyData {
  full_name: string;
  gender: "male" | "female";
  birth_date: string;
  blood_type: string | null;
  allergies: string | null;
  chronic_conditions: string | null;
  emergency_contact?: string | null;
  emergency_phone?: string | null;
  insurance_number?: string | null;
  medications: { name: string; dosage: string | null }[];
}

/** Thẻ y tế khẩn cấp – dùng chung cho trang trong app và trang công khai (QR) */
export function EmergencyCardView({ d }: { d: EmergencyData }) {
  return (
    <article className="card overflow-hidden" aria-label="Thẻ y tế khẩn cấp">
      <header className="flex items-center gap-3 bg-[var(--danger)] px-4 py-3 text-white">
        <span className="text-2xl" aria-hidden>
          ✚
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider opacity-90">Thông tin y tế khẩn cấp</p>
          <h1 className="text-xl font-bold">{d.full_name}</h1>
        </div>
      </header>
      <div className="divide-y divide-border">
        <Row label="Giới tính · Tuổi">
          {d.gender === "male" ? "Nam" : "Nữ"} · {formatAge(d.birth_date)} (sinh {formatDate(d.birth_date)})
        </Row>
        <Row label="Nhóm máu">
          <span className="text-2xl font-bold">{d.blood_type || "Chưa rõ"}</span>
        </Row>
        <Row label="⚠️ Dị ứng" danger={!!d.allergies}>
          {d.allergies || "Không ghi nhận"}
        </Row>
        <Row label="Bệnh nền">{d.chronic_conditions || "Không ghi nhận"}</Row>
        <Row label="Thuốc đang dùng">
          {d.medications.length ? (
            <ul className="list-disc pl-5">
              {d.medications.map((m, i) => (
                <li key={i}>
                  {m.name}
                  {m.dosage ? ` – ${m.dosage}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            "Không"
          )}
        </Row>
        {d.insurance_number && <Row label="Số thẻ BHYT">{d.insurance_number}</Row>}
        <Row label="📞 Liên hệ khẩn cấp">
          {d.emergency_phone ? (
            <a href={`tel:${d.emergency_phone.replace(/\s/g, "")}`} className="text-lg font-bold text-primary underline">
              {d.emergency_contact ? `${d.emergency_contact}: ` : ""}
              {d.emergency_phone}
            </a>
          ) : (
            d.emergency_contact || "Chưa có"
          )}
        </Row>
      </div>
    </article>
  );
}

function Row({ label, children, danger }: { label: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[160px_1fr]">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <div className={danger ? "text-lg font-bold text-danger" : ""}>{children}</div>
    </div>
  );
}
