"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useFamily } from "./FamilyProvider";
import { Spinner } from "./ui";

const NAV = [
  { href: "/", label: "Gia đình", icon: "⌂" },
  { href: "/vaccines", label: "Tiêm chủng", icon: "✚" },
  { href: "/settings", label: "Cài đặt", icon: "⚙" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { family, families, setFamilyId, loading } = useFamily();
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" || path.startsWith("/members") : path.startsWith(href));

  return (
    <div className="min-h-screen pb-20 sm:pb-8">
      <header className="sticky top-0 z-30 border-b border-border bg-[var(--surface)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-8 w-8" />
            <span className="hidden sm:inline">Sổ Sức Khỏe</span>
          </Link>
          {families.length > 1 ? (
            <select
              className="input max-w-[200px] py-1.5 text-sm"
              value={family?.id ?? ""}
              onChange={(e) => setFamilyId(e.target.value)}
              aria-label="Chọn gia đình"
            >
              {families.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="truncate text-sm text-text-2">{family?.name}</span>
          )}
          <nav className="ml-auto hidden gap-1 sm:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${active(n.href) ? "bg-primary-soft text-primary" : "text-text-2 hover:bg-surface-2"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">{loading ? <Spinner /> : family ? children : <Spinner label="Đang khởi tạo gia đình…" />}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface sm:hidden">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-semibold ${active(n.href) ? "text-primary" : "text-muted"}`}
          >
            <span className="text-lg leading-none" aria-hidden>
              {n.icon}
            </span>
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
