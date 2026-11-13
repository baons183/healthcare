"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { ErrorText } from "./ui";

type Prefs = { notify_measure: boolean; notify_vaccine: boolean; notify_overdue: boolean; notify_medication: boolean; notify_email: boolean };
const DEFAULT: Prefs = { notify_measure: true, notify_vaccine: true, notify_overdue: true, notify_medication: true, notify_email: false };

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function supportInfo(): { ok: boolean; reason?: string } {
  if (typeof window === "undefined") return { ok: false };
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    if (ios && !standalone)
      return { ok: false, reason: "Trên iPhone/iPad: mở bằng Safari → Chia sẻ → “Thêm vào MH chính”, rồi mở app từ màn hình chính để bật thông báo (iOS 16.4+)." };
    return { ok: false, reason: "Trình duyệt này không hỗ trợ thông báo đẩy." };
  }
  return { ok: true };
}

export function NotificationSettings({ userId }: { userId: string }) {
  const [support, setSupport] = useState<{ ok: boolean; reason?: string }>({ ok: true });
  const [subscribed, setSubscribed] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT);
  const [dailyTime, setDailyTime] = useState("06:30");
  const [savedTime, setSavedTime] = useState("06:30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const s = supportInfo();
    setSupport(s);
    if (s.ok) {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setSubscribed(!!sub && Notification.permission === "granted");
    }
    const { data } = await supabase().from("notification_settings").select("*").eq("user_id", userId).maybeSingle();
    if (data && typeof data.daily_time === "string") {
      setDailyTime(data.daily_time);
      setSavedTime(data.daily_time);
    }
    if (data) setPrefs({ ...DEFAULT, ...Object.fromEntries(Object.keys(DEFAULT).filter((k) => k in data).map((k) => [k, data[k]])) } as Prefs);
  }, [userId]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const enable = () =>
    run(async () => {
      // Bỏ khoảng trắng / dấu ngoặc kép lỡ dán thừa khi cấu hình trên Vercel
      const key = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim().replace(/^["']+|["']+$/g, "");
      if (!key) throw new Error("Chưa cấu hình NEXT_PUBLIC_VAPID_PUBLIC_KEY trên server.");
      let bytes: Uint8Array;
      try {
        bytes = b64ToBytes(key);
      } catch {
        throw new Error(`NEXT_PUBLIC_VAPID_PUBLIC_KEY có ký tự không hợp lệ (bắt đầu bằng "${key.slice(0, 6)}…").`);
      }
      if (bytes.length !== 65 || bytes[0] !== 4) {
        throw new Error(
          `NEXT_PUBLIC_VAPID_PUBLIC_KEY sai: dài ${key.length} ký tự (cần 87, bắt đầu bằng "B").` +
            (key.length === 43 ? " Có vẻ bạn đã dán nhầm VAPID_PRIVATE_KEY." : "") +
            " Sửa trên Vercel rồi Redeploy.",
        );
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Bạn chưa cho phép thông báo. Hãy bật lại trong cài đặt trình duyệt/điện thoại.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes as Uint8Array<ArrayBuffer> }));
      const j = sub.toJSON();
      const { error } = await supabase()
        .from("push_subscriptions")
        .upsert(
          { user_id: userId, endpoint: sub.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth, user_agent: navigator.userAgent.slice(0, 200) },
          { onConflict: "endpoint" },
        );
      if (error) throw new Error(error.message.includes("push_subscriptions") ? "Chưa tạo bảng thông báo – hãy chạy file SQL 0004_notifications.sql." : error.message);
      await savePrefs(prefs);
      setSubscribed(true);
      setMsg("Đã bật thông báo trên thiết bị này. Bấm “Gửi thử” để kiểm tra.");
    });

  const disable = () =>
    run(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setMsg("Đã tắt thông báo trên thiết bị này.");
    });

  async function savePrefs(p: Prefs) {
    const { error } = await supabase()
      .from("notification_settings")
      .upsert({ user_id: userId, ...p, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  }

  const toggle = (k: keyof Prefs) =>
    run(async () => {
      const next = { ...prefs, [k]: !prefs[k] };
      setPrefs(next);
      try {
        await savePrefs(next);
      } catch (e) {
        setPrefs(prefs);
        const m = e instanceof Error ? e.message : String(e);
        throw new Error(/notify_(medication|email)/.test(m) ? "Chưa cập nhật database – hãy chạy file SQL 0005_health_features.sql." : m);
      }
    });

  const saveTime = () =>
    run(async () => {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dailyTime)) throw new Error("Giờ không hợp lệ.");
      const { error } = await supabase()
        .from("notification_settings")
        .upsert({ user_id: userId, ...prefs, daily_time: dailyTime, updated_at: new Date().toISOString() });
      if (error) {
        setDailyTime(savedTime);
        throw new Error(/daily_time/.test(error.message) ? "Chưa cập nhật database – hãy chạy file SQL 0009_daily_time.sql." : error.message);
      }
      setSavedTime(dailyTime);
      setMsg(`Đã đổi giờ nhắc lịch hằng ngày thành ${dailyTime}.`);
    });

  const test = () =>
    run(async () => {
      const res = await fetch("/api/push/test", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `Lỗi ${res.status}`);
      const where = [j.devices ? `${j.devices} thiết bị` : "", j.email ? `email ${j.email}` : ""].filter(Boolean).join(" và ");
      setMsg(`Đã gửi thử tới ${where}. ` + (j.previews ? `Kèm ${j.previews} nhắc lịch xem trước của hôm nay.` : "Hôm nay chưa có lịch nào cần nhắc."));
    });

  const OPTIONS: [keyof Prefs, string, string][] = [
    ["notify_measure", "Nhắc cân đo", "Theo độ tuổi: < 1 tuổi hằng tháng, 1–2 tuổi 3 tháng/lần, 2–6 tuổi 6 tháng/lần, lớn hơn 1 năm/lần"],
    ["notify_vaccine", "Lịch tiêm, xổ giun & khám sắp tới", "Báo trước 15 ngày và nhắc lại 1 ngày trước (gồm khám răng, mắt, khám thai)"],
    ["notify_overdue", "Tổng hợp mũi quá hạn", "Vào ngày 1 hàng tháng"],
    ["notify_medication", "Nhắc uống thuốc & đo huyết áp", "Đúng giờ đã đặt trong mục Thuốc và Huyết áp (chỉ thông báo trên thiết bị)"],
    ["notify_email", "Gửi thêm qua email", `Gộp các nhắc lịch trong ngày thành 1 email lúc ${savedTime}`],
  ];

  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold">🔔 Thông báo</h2>
          <p className="text-xs text-muted">Nhắc lịch hằng ngày lúc {savedTime} (chỉ gửi khi có lịch cần nhắc)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(subscribed || prefs.notify_email) && (
            <button className="btn btn-sm" onClick={test} disabled={busy}>
              Gửi thử
            </button>
          )}
          {support.ok &&
            (subscribed ? (
              <button className="btn btn-sm btn-danger" onClick={disable} disabled={busy}>
                Tắt
              </button>
            ) : (
              <button className="btn btn-primary" onClick={enable} disabled={busy}>
                {busy ? "Đang bật…" : "Bật thông báo"}
              </button>
            ))}
        </div>
      </div>
      {!support.ok && support.reason && <p className="rounded-lg bg-[var(--info-soft)] px-3 py-2 text-sm text-info">{support.reason}</p>}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-3">
        <label htmlFor="daily-time" className="flex-1 text-sm">
          <span className="block font-semibold">⏰ Giờ nhận nhắc lịch hằng ngày</span>
          <span className="block text-xs text-text-2">Cân đo, tiêm chủng, xổ giun, khám định kỳ, mũi quá hạn. Có thể đến trễ tối đa 15 phút.</span>
        </label>
        <input id="daily-time" type="time" className="input w-auto tabular" value={dailyTime} onChange={(e) => setDailyTime(e.target.value)} />
        {dailyTime !== savedTime && (
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={saveTime}>
            Lưu
          </button>
        )}
      </div>
      <ul className="divide-y divide-border">
        {OPTIONS.map(([k, label, hint]) => (
          <li key={k} className="flex items-center gap-3 py-2.5">
            <div className="flex-1">
              <p className="text-sm font-semibold">{label}</p>
              <p className="text-xs text-text-2">{hint}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs[k]}
              aria-label={label}
              disabled={busy}
              onClick={() => toggle(k)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${prefs[k] ? "bg-primary" : "bg-[var(--border)]"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${prefs[k] ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">Thông báo được bật riêng cho từng thiết bị (điện thoại, máy tính). Cài đặt bật/tắt áp dụng cho mọi thiết bị của bạn.</p>
      <ErrorText error={error} />
      {msg && <p className="rounded-lg bg-[var(--good-soft)] px-3 py-2 text-sm text-good">{msg}</p>}
    </section>
  );
}
