"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { toE164 } from "@/lib/phone";
import { ErrorText, Field } from "@/components/ui";

type Channel = "email" | "phone";
type EmailMode = "password" | "signup" | "otp";

function translate(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "Email hoặc mật khẩu không đúng.";
  if (msg.includes("Email not confirmed")) return "Email chưa được xác nhận. Kiểm tra hộp thư của bạn.";
  if (msg.includes("User already registered")) return "Email đã được đăng ký – hãy đăng nhập.";
  if (/phone.*(disabled|provider)|Unsupported phone provider|sms/i.test(msg))
    return "Đăng nhập bằng số điện thoại chưa được bật (cần cấu hình nhà cung cấp SMS trong Supabase).";
  if (/expired|invalid.*(otp|token)/i.test(msg)) return "Mã OTP sai hoặc đã hết hạn.";
  if (/provider is not enabled|Unsupported provider/i.test(msg)) return "Đăng nhập Google chưa được bật (cần cấu hình Google trong Supabase).";
  if (/rate limit|security purposes/i.test(msg)) return "Bạn thao tác quá nhanh, vui lòng đợi một chút rồi thử lại.";
  return msg;
}

export default function LoginPage() {
  const router = useRouter();
  const [channel, setChannel] = useState<Channel>("email");
  const [emailMode, setEmailMode] = useState<EmailMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null); // email hoặc +84...
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const done = () => {
    router.replace("/");
    router.refresh();
  };

  async function wrap(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setError(translate(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  const sendOtp = () =>
    wrap(async () => {
      const sb = supabase();
      if (channel === "phone") {
        const p = toE164(phone);
        if (!p) throw new Error("Số điện thoại không hợp lệ.");
        const { error } = await sb.auth.signInWithOtp({ phone: p });
        if (error) throw error;
        setOtpSentTo(p);
        setMessage(`Đã gửi mã OTP qua tin nhắn tới ${p}.`);
      } else {
        const { error } = await sb.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        setOtpSentTo(email);
        setMessage(`Đã gửi mã đăng nhập tới ${email}. Nhập mã 6 số hoặc bấm liên kết trong email.`);
      }
      setCode("");
    });

  const verifyOtp = () =>
    wrap(async () => {
      const sb = supabase();
      const token = code.replace(/\D/g, "");
      const { error } =
        channel === "phone"
          ? await sb.auth.verifyOtp({ phone: otpSentTo!, token, type: "sms" })
          : await sb.auth.verifyOtp({ email: otpSentTo!, token, type: "email" });
      if (error) throw error;
      done();
    });

  const passwordLogin = () =>
    wrap(async () => {
      const sb = supabase();
      if (emailMode === "password") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        done();
      } else {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        if (data.session) done();
        else setMessage("Đã gửi email xác nhận. Mở hộp thư và bấm liên kết để kích hoạt tài khoản.");
      }
    });

  const googleLogin = () =>
    wrap(async () => {
      const { error } = await supabase().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (otpSentTo) return verifyOtp();
    if (channel === "phone" || emailMode === "otp") return sendOtp();
    return passwordLogin();
  }

  const switchChannel = (c: Channel) => {
    setChannel(c);
    setOtpSentTo(null);
    setError(null);
    setMessage(null);
  };

  const label = busy
    ? "Đang xử lý…"
    : otpSentTo
      ? "Xác nhận"
      : channel === "phone" || emailMode === "otp"
        ? "Gửi mã OTP"
        : emailMode === "password"
          ? "Đăng nhập"
          : "Tạo tài khoản";

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
          <button type="button" className="btn w-full py-2.5" onClick={googleLogin} disabled={busy}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            Tiếp tục với Google
          </button>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-[var(--border)]" />
            hoặc
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 text-sm font-semibold">
            {(
              [
                ["email", "Email"],
                ["phone", "Số điện thoại"],
              ] as const
            ).map(([c, l]) => (
              <button
                key={c}
                type="button"
                onClick={() => switchChannel(c)}
                className={`rounded-lg py-1.5 ${channel === c ? "bg-surface shadow-sm" : "text-text-2"}`}
              >
                {l}
              </button>
            ))}
          </div>

          {otpSentTo ? (
            <>
              <Field label="Mã OTP" hint={`Đã gửi tới ${otpSentTo}`}>
                <input
                  className="input tabular text-center text-2xl tracking-[0.4em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  required
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </Field>
              <div className="flex justify-between text-sm">
                <button type="button" className="text-text-2 underline" onClick={() => setOtpSentTo(null)}>
                  Đổi {channel === "phone" ? "số" : "email"}
                </button>
                <button type="button" className="text-primary underline" disabled={busy} onClick={sendOtp}>
                  Gửi lại mã
                </button>
              </div>
            </>
          ) : channel === "phone" ? (
            <Field label="Số điện thoại" hint="Mã OTP sẽ được gửi qua tin nhắn SMS">
              <input
                className="input tabular"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                placeholder="0912 345 678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
          ) : (
            <>
              <Field label="Email">
                <input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              {emailMode !== "otp" && (
                <Field label="Mật khẩu" hint={emailMode === "signup" ? "Tối thiểu 6 ký tự" : undefined}>
                  <input
                    className="input"
                    type="password"
                    required
                    minLength={6}
                    autoComplete={emailMode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
              )}
            </>
          )}

          <ErrorText error={error} />
          {message && <p className="rounded-lg bg-[var(--good-soft)] px-3 py-2 text-sm text-good">{message}</p>}

          <button className="btn btn-primary w-full" disabled={busy}>
            {label}
          </button>

          {channel === "email" && !otpSentTo && (
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
              {emailMode !== "password" && (
                <button type="button" className="text-primary underline" onClick={() => setEmailMode("password")}>
                  Đăng nhập bằng mật khẩu
                </button>
              )}
              {emailMode !== "otp" && (
                <button type="button" className="text-primary underline" onClick={() => setEmailMode("otp")}>
                  Nhận mã qua email
                </button>
              )}
              {emailMode !== "signup" && (
                <button type="button" className="text-primary underline" onClick={() => setEmailMode("signup")}>
                  Tạo tài khoản
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
