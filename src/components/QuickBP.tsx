"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Member } from "@/lib/types";
import { saveVital } from "@/lib/data";
import { ageInMonths } from "@/lib/date";
import { parseBpSpeech, type BpParse } from "@/lib/bpSpeech";
import { afterBpSaved, type BpAlarmResult } from "@/lib/bpAlarm";
import { BP_CRISIS_ADVICE, gradeBP } from "@/lib/vitals";
import { ErrorText, LevelBadge, Modal } from "./ui";

/* Web Speech API (Chrome/Android, Safari iOS 14.5+) – khai báo tối thiểu */
interface SRAlternative {
  transcript: string;
}
interface SRResult {
  isFinal: boolean;
  length: number;
  [i: number]: SRAlternative;
}
interface SREvent {
  results: { length: number; [i: number]: SRResult };
}
interface SR {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
function getSR(): (new () => SR) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const LAST_KEY = "quickbp-member";
const AUTO_SAVE_SEC = 3;

export function QuickBP({ open, members, onClose, onSaved }: { open: boolean; members: Member[]; onClose: () => void; onSaved: () => void }) {
  const adults = [...members].sort((a, b) => Number(ageInMonths(b.birth_date) >= 216) - Number(ageInMonths(a.birth_date) >= 216));
  const [memberId, setMemberId] = useState<string>("");
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [typed, setTyped] = useState("");
  const [parsed, setParsed] = useState<BpParse | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<(BpAlarmResult & { sys: number; dia: number; pulse: number | null }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SR | null>(null);
  const supported = !!getSR();

  // Chọn người: lần trước dùng, hoặc người lớn đầu tiên
  useEffect(() => {
    if (!open) return;
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_KEY);
    } catch {}
    setMemberId(members.find((m) => m.id === last)?.id ?? adults[0]?.id ?? "");
    setHeard("");
    setTyped("");
    setParsed(null);
    setCountdown(null);
    setResult(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stop = useCallback(() => {
    recRef.current?.abort();
    recRef.current = null;
    setListening(false);
  }, []);
  useEffect(() => () => stop(), [stop]);

  const save = useCallback(
    async (p: { sys: number; dia: number; pulse: number | null }) => {
      const member = members.find((m) => m.id === memberId);
      if (!member) return setError("Chọn người được đo.");
      setCountdown(null);
      setSaving(true);
      setError(null);
      try {
        const v = await saveVital({
          family_id: member.family_id,
          member_id: member.id,
          measured_at: new Date().toISOString(),
          systolic: p.sys,
          diastolic: p.dia,
          pulse: p.pulse,
          notes: heard ? `Đọc bằng giọng nói: "${heard}"` : null,
        });
        try {
          localStorage.setItem(LAST_KEY, member.id);
        } catch {}
        const alarm = await afterBpSaved(v.id, p.sys, p.dia);
        setResult({ ...alarm, ...p });
        onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    },
    [members, memberId, heard, onSaved],
  );

  // Đếm ngược rồi tự lưu
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      if (parsed) save(parsed);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, parsed, save]);

  function listen() {
    const SRC = getSR();
    if (!SRC) return;
    stop();
    setHeard("");
    setParsed(null);
    setCountdown(null);
    setError(null);
    const rec = new SRC();
    rec.lang = "vi-VN";
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    rec.continuous = false;
    let best: BpParse | null = null;
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript + " ";
      setHeard(text.trim());
      const last = e.results[e.results.length - 1];
      // Thử cả các phương án nghe khác nhau, ưu tiên phương án hợp lý
      const candidates: BpParse[] = [];
      for (let a = 0; a < last.length; a++) {
        let full = "";
        for (let i = 0; i < e.results.length - 1; i++) full += e.results[i][0].transcript + " ";
        const p = parseBpSpeech(full + last[a].transcript);
        if (p) candidates.push(p);
      }
      const pick = candidates.find((c) => !c.needsConfirm) ?? candidates[0] ?? null;
      if (pick) {
        best = pick;
        setParsed(pick);
      }
      if (last.isFinal && best) rec.stop();
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setError("Chưa cho phép dùng micro. Bật quyền micro cho trang này trong cài đặt trình duyệt.");
      else if (e.error === "no-speech") setError("Không nghe thấy gì – bấm micro và nói lại.");
      else if (e.error !== "aborted") setError(`Lỗi nhận giọng nói (${e.error}). Có thể gõ số ở ô bên dưới.`);
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      if (best && !best.needsConfirm) setCountdown(AUTO_SAVE_SEC);
      else if (!best) setError((er) => er ?? "Chưa nghe rõ số. Nói lại kiểu: “160 trên 100, tim 80”.");
    };
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }

  const fromTyped = (v: string) => {
    setTyped(v);
    setCountdown(null);
    setHeard("");
    setParsed(v.trim() ? parseBpSpeech(v) : null);
  };

  const member = members.find((m) => m.id === memberId);
  const grade = parsed && !parsed.needsConfirm ? gradeBP(parsed.sys, parsed.dia) : null;

  return (
    <Modal
      open={open}
      title="🎤 Đọc huyết áp"
      onClose={() => {
        stop();
        setCountdown(null);
        onClose();
      }}
    >
      {result ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-text-2">Đã lưu cho {member?.full_name}</p>
          <p className="tabular text-5xl font-bold">
            {result.sys}/{result.dia}
          </p>
          {result.pulse && <p className="text-lg text-text-2">Nhịp tim {result.pulse}</p>}
          <LevelBadge level={gradeBP(result.sys, result.dia).level}>{gradeBP(result.sys, result.dia).label}</LevelBadge>
          {result.level === "crisis" && (
            <p className="rounded-xl bg-[var(--danger-soft)] p-3 text-left font-semibold text-danger">🚨 {BP_CRISIS_ADVICE}</p>
          )}
          {result.level === "alarm" && (
            <p className="rounded-xl bg-[var(--warning-soft)] p-3 text-left text-sm text-warning">
              Huyết áp cao. Nằm/ngồi nghỉ, thở chậm, 5–10 phút sau đo lại. Uống thuốc huyết áp theo đơn nếu đã đến giờ.
            </p>
          )}
          {result.level !== "ok" && (
            <p className="text-sm text-text-2">{result.notified ? `✓ Đã báo cho ${result.notified} người nhà.` : "Chưa có người nhà nào bật thông báo để nhận tin."}</p>
          )}
          <div className="flex justify-center gap-2">
            <button
              className="btn"
              onClick={() => {
                setResult(null);
                setParsed(null);
                setHeard("");
                setTyped("");
              }}
            >
              Đo lần nữa
            </button>
            <button className="btn btn-primary" onClick={onClose}>
              Xong
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {members.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Người được đo">
              {adults.map((m) => (
                <button
                  key={m.id}
                  role="radio"
                  aria-checked={m.id === memberId}
                  className={`btn btn-sm ${m.id === memberId ? "btn-primary" : ""}`}
                  onClick={() => setMemberId(m.id)}
                >
                  {m.full_name}
                </button>
              ))}
            </div>
          )}

          {supported ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <button
                type="button"
                onClick={listening ? stop : listen}
                disabled={saving || !memberId}
                aria-label={listening ? "Dừng nghe" : "Bấm để nói chỉ số huyết áp"}
                className={`flex h-28 w-28 items-center justify-center rounded-full text-5xl text-white shadow-lg transition ${listening ? "animate-pulse bg-[var(--danger)]" : "bg-primary"}`}
              >
                🎤
              </button>
              <p className="text-sm font-semibold">{listening ? "Đang nghe… nói đi" : "Bấm và nói"}</p>
              <p className="text-center text-xs text-text-2">VD: “160 trên 100, tim 80” hoặc “một trăm bốn mươi trên chín mươi”</p>
            </div>
          ) : (
            <p className="rounded-lg bg-[var(--info-soft)] px-3 py-2 text-sm text-info">
              Trình duyệt này chưa hỗ trợ nhận giọng nói. Bấm vào ô bên dưới rồi dùng nút 🎤 trên bàn phím điện thoại để đọc, hoặc gõ số.
            </p>
          )}

          {heard && <p className="text-center text-sm italic text-text-2">“{heard}”</p>}

          {parsed && (
            <div className="rounded-xl border border-border p-4 text-center">
              <p className="tabular text-5xl font-bold">
                {parsed.sys}/{parsed.dia}
              </p>
              {parsed.pulse && <p className="text-lg text-text-2">Nhịp tim {parsed.pulse}</p>}
              {grade && (
                <p className="mt-1">
                  <LevelBadge level={grade.level}>{grade.label}</LevelBadge>
                </p>
              )}
              {parsed.needsConfirm ? (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-warning">{parsed.reason}</p>
                  {parsed.suggestion && (
                    <button className="btn btn-primary w-full" disabled={saving} onClick={() => save({ ...parsed.suggestion!, pulse: parsed.pulse })}>
                      Có phải {parsed.suggestion.sys}/{parsed.suggestion.dia}? Lưu
                    </button>
                  )}
                </div>
              ) : countdown !== null ? (
                <div className="mt-3 flex gap-2">
                  <button className="btn flex-1" onClick={() => setCountdown(null)}>
                    Hủy
                  </button>
                  <button className="btn btn-primary flex-1" onClick={() => save(parsed)}>
                    Lưu ngay ({countdown})
                  </button>
                </div>
              ) : (
                <button className="btn btn-primary mt-3 w-full" disabled={saving} onClick={() => save(parsed)}>
                  {saving ? "Đang lưu…" : "Lưu"}
                </button>
              )}
            </div>
          )}

          <label className="block">
            <span className="label">Hoặc gõ / đọc bằng bàn phím</span>
            <input
              className="input tabular text-lg"
              inputMode="text"
              placeholder="160 100 80"
              value={typed}
              onChange={(e) => fromTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && parsed && !parsed.needsConfirm) save(parsed);
              }}
            />
          </label>
          <ErrorText error={error} />
        </div>
      )}
    </Modal>
  );
}
