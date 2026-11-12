"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { ErrorText, Field } from "@/components/ui";

type Mode = "signin" | "signup" | "magic";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const sb = supabase();
    const redirectTo = `${window.location.origin}/auth/callback`;
    try {
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/");
        router.refresh();
      } else if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        if (data.session) {
          router.replace("/");
          router.refresh();
        } else setMessage("Đã gửi email xác nhận. Hãy mở hộp thư và bấm vào liên kết để kích hoạt tài khoản.");
      } else {
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        setMessage("Đã gửi liên kết đăng nhập tới email của bạn.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        msg.includes("Invalid login credentials")
          ? "Email hoặc mật khẩu không đúng."
          : msg.includes("Email not confirmed")
            ? "Email chưa được xác nhận. Kiểm tra hộp thư của bạn."
            : msg,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="mx-auto mb-3 h-14 w-14" />
          <h1 className="text-2xl font-bold">Sổ Sức Khỏe Gia Đình</h1>
          <p className="mt-1 text-sm text-text-2">Tăng trưởng · Tiêm chủng · Bệnh sử</p>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-5">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1 text-sm font-semibold">
            {(
              [
                ["signin", "Đăng nhập"],
                ["signup", "Đăng ký"],
                ["magic", "Qua email"],
              ] as const
            ).map(([m, l]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-lg py-1.5 ${mode === m ? "bg-surface shadow-sm" : "text-text-2"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <Field label="Email">
            <input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {mode !== "magic" && (
            <Field label="Mật khẩu" hint={mode === "signup" ? "Tối thiểu 6 ký tự" : undefined}>
              <input
                className="input"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          )}
          <ErrorText error={error} />
          {message && <p className="rounded-lg bg-[var(--good-soft)] px-3 py-2 text-sm text-good">{message}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>
            {busy ? "Đang xử lý…" : mode === "signin" ? "Đăng nhập" : mode === "signup" ? "Tạo tài khoản" : "Gửi liên kết đăng nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}
