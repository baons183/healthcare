"use client";
import { useEffect, type ReactNode } from "react";
import type { Level } from "@/lib/growth";

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card max-h-[92vh] w-full overflow-y-auto rounded-b-none p-5 sm:rounded-b-[14px] ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn btn-sm" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const LEVEL_META: Record<Level, { cls: string; icon: string }> = {
  good: { cls: "badge-good", icon: "✓" },
  info: { cls: "badge-info", icon: "i" },
  warning: { cls: "badge-warning", icon: "!" },
  danger: { cls: "badge-danger", icon: "!!" },
};

export function LevelBadge({ level, children }: { level: Level; children: ReactNode }) {
  const m = LEVEL_META[level];
  return (
    <span className={`badge ${m.cls}`}>
      <span aria-hidden>{m.icon}</span>
      {children}
    </span>
  );
}

export function LevelIcon({ level }: { level: Level }) {
  const m = LEVEL_META[level];
  return (
    <span className={`badge ${m.cls} h-6 w-6 shrink-0 justify-center p-0`} aria-hidden>
      {m.icon}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-8 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm text-text-2">{children}</div>}
    </div>
  );
}

export function Spinner({ label = "Đang tải…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-text-2">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" />
      {label}
    </div>
  );
}

export function Avatar({ name, color, size = 44 }: { name: string; color?: string | null; size?: number }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: color || "#2a78d6", fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-sm text-danger">{error}</p>;
}

export function confirmDelete(what: string) {
  return window.confirm(`Xóa ${what}? Thao tác này không thể hoàn tác.`);
}
