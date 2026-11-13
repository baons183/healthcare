"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { AppShell } from "@/components/AppShell";
import { useFamily } from "@/components/FamilyProvider";
import { EmergencyCardView, type EmergencyData } from "@/components/EmergencyCardView";
import { ErrorText, Spinner } from "@/components/ui";
import { getMember, listExtras, setEmergencyLink } from "@/lib/data";
import { activeMedications } from "@/lib/medications";
import { formatAge } from "@/lib/date";
import { contactsOf, type Member } from "@/lib/types";

export default function EmergencyPage() {
  return (
    <AppShell>
      <EmergencyView />
    </AppShell>
  );
}

function EmergencyView() {
  const { id } = useParams<{ id: string }>();
  const { canEdit } = useFamily();
  const [member, setMember] = useState<Member | null>(null);
  const [data, setData] = useState<EmergencyData | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, ex] = await Promise.all([getMember(id), listExtras({ memberId: id })]);
      if (!m) throw new Error("Không tìm thấy thành viên.");
      setMember(m);
      setData({ ...m, medications: activeMedications(ex.medications).map((x) => ({ name: x.name, dosage: x.dosage })) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const link = member?.emergency_token ? `${typeof window !== "undefined" ? window.location.origin : ""}/e/${member.emergency_token}` : null;
  useEffect(() => {
    if (!link) return setQr(null);
    QRCode.toDataURL(link, { width: 480, margin: 1, errorCorrectionLevel: "M" }).then(setQr);
  }, [link]);

  async function toggle(enabled: boolean) {
    if (!member) return;
    if (!enabled && !window.confirm("Tắt link? Mã QR cũ (đã in, đã lưu) sẽ không mở được nữa.")) return;
    setBusy(true);
    setError(null);
    try {
      const token = await setEmergencyLink(member.id, enabled);
      setMember({ ...member, emergency_token: token });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function downloadWallpaper() {
    if (!data || !qr) return;
    const url = await makeWallpaper(data, qr);
    const a = document.createElement("a");
    a.href = url;
    a.download = `the-khan-cap-${data.full_name.replace(/\s+/g, "-")}.png`;
    a.click();
  }

  if (error && !data) return <ErrorText error={error} />;
  if (!data || !member) return <Spinner />;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="no-print flex items-center justify-between gap-2">
        <Link href={`/members/${id}`} className="text-sm text-primary">
          ← {member.full_name}
        </Link>
        <button className="btn btn-sm" onClick={() => window.print()}>
          🖨 In thẻ
        </button>
      </div>

      <EmergencyCardView d={data} />
      {canEdit && (
        <p className="no-print text-sm text-text-2">
          Thiếu thông tin? <Link href={`/members/${id}?edit=1`} className="text-primary underline">Sửa hồ sơ</Link> để thêm người liên hệ, SĐT, BHYT, dị ứng. Thuốc lấy từ mục “Thuốc đang dùng”.
        </p>
      )}

      <section className="card space-y-3 p-4">
        <h2 className="font-bold">📱 Mã QR cho người cấp cứu</h2>
        <p className="text-sm text-text-2">
          Bật link để tạo mã QR. Ai quét mã cũng xem được thẻ này <b>mà không cần đăng nhập</b> – chỉ gồm thông tin ở trên, không có bệnh sử hay ảnh giấy tờ.
          Lưu ảnh làm hình nền màn hình khóa, dán sau ốp điện thoại, hoặc in bỏ ví / cặp sách của con.
        </p>
        {link && qr ? (
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Mã QR thẻ khẩn cấp" className="h-48 w-48 rounded-lg bg-white p-2" />
            <div className="no-print flex flex-1 flex-col gap-2">
              <button className="btn btn-primary" onClick={downloadWallpaper}>
                ⬇ Tải ảnh hình nền khóa
              </button>
              <button
                className="btn"
                onClick={async () => {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? "✓ Đã sao chép" : "Sao chép link"}
              </button>
              <a className="btn" href={link} target="_blank" rel="noreferrer">
                Xem thử trang công khai
              </a>
              {canEdit && (
                <button className="btn btn-danger" disabled={busy} onClick={() => toggle(false)}>
                  Tắt link
                </button>
              )}
            </div>
          </div>
        ) : canEdit ? (
          <button className="btn btn-primary no-print" disabled={busy} onClick={() => toggle(true)}>
            {busy ? "Đang tạo…" : "Bật link & tạo mã QR"}
          </button>
        ) : (
          <p className="text-sm text-muted">Chưa bật link công khai.</p>
        )}
        <ErrorText error={error} />
      </section>
    </div>
  );
}

/** Ảnh dọc 1080×2340 làm hình nền màn hình khóa: thông tin chính ở giữa, QR ở dưới (tránh vùng đồng hồ) */
async function makeWallpaper(d: EmergencyData, qrUrl: string): Promise<string> {
  const W = 1080;
  const H = 2340;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#111113";
  g.fillRect(0, 0, W, H);
  const font = (size: number, weight = 600) => `${weight} ${size}px "Be Vietnam Pro", system-ui, sans-serif`;
  let y = 860;
  g.fillStyle = "#c0262d";
  g.fillRect(80, y - 90, W - 160, 130);
  g.fillStyle = "#fff";
  g.font = font(54, 700);
  g.textAlign = "center";
  g.fillText("✚ THÔNG TIN Y TẾ KHẨN CẤP", W / 2, y);
  y += 130;
  g.font = font(64, 700);
  g.fillText(d.full_name, W / 2, y);
  y += 70;
  g.font = font(40, 500);
  g.fillStyle = "#c3c2bd";
  g.fillText(`${d.gender === "male" ? "Nam" : "Nữ"} · ${formatAge(d.birth_date)} · Nhóm máu ${d.blood_type || "?"}`, W / 2, y);
  const lines: [string, string, string][] = [];
  if (d.allergies) lines.push(["DỊ ỨNG", d.allergies, "#f07a7a"]);
  if (d.chronic_conditions) lines.push(["BỆNH NỀN", d.chronic_conditions, "#f0efec"]);
  for (const c of contactsOf(d).slice(0, 3)) if (c.phone) lines.push(["LIÊN HỆ", `${c.name ? c.name + " " : ""}${c.phone}`, "#7fb2f0"]);
  y += 40;
  for (const [label, text, color] of lines) {
    y += 80;
    g.font = font(32, 600);
    g.fillStyle = "#8f8e96";
    g.fillText(label, W / 2, y);
    y += 58;
    g.font = font(46, 700);
    g.fillStyle = color;
    g.fillText(text.length > 38 ? text.slice(0, 37) + "…" : text, W / 2, y);
  }
  const img = new Image();
  img.src = qrUrl;
  await img.decode();
  const size = 420;
  const qy = Math.max(y + 80, 1640);
  g.fillStyle = "#fff";
  g.fillRect((W - size) / 2 - 20, qy - 20, size + 40, size + 40);
  g.drawImage(img, (W - size) / 2, qy, size, size);
  g.font = font(34, 500);
  g.fillStyle = "#c3c2bd";
  g.fillText("Quét mã để xem thông tin cấp cứu", W / 2, qy + size + 80);
  return c.toDataURL("image/png");
}
