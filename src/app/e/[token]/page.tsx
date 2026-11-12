/**
 * Trang công khai của thẻ y tế khẩn cấp (mở bằng mã QR, không cần đăng nhập).
 * Dữ liệu lấy qua hàm emergency_card(token) – chỉ trả về thông tin cấp cứu tối thiểu.
 */
import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { EmergencyCardView, type EmergencyData } from "@/components/EmergencyCardView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Thông tin y tế khẩn cấp", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PublicEmergencyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let data: EmergencyData | null = null;
  if (UUID.test(token)) {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: d } = await sb.rpc("emergency_card", { t: token });
    data = (d as EmergencyData | null) ?? null;
  }
  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      {data ? (
        <>
          <EmergencyCardView d={data} />
          <p className="mt-4 text-center text-xs text-muted">Gọi cấp cứu: <a href="tel:115" className="font-bold text-danger underline">115</a> · Thông tin do gia đình tự cung cấp.</p>
        </>
      ) : (
        <div className="card p-6 text-center">
          <p className="font-bold">Không tìm thấy thông tin</p>
          <p className="mt-1 text-sm text-text-2">Link đã bị tắt hoặc không đúng.</p>
        </div>
      )}
    </main>
  );
}
