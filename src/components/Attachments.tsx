"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { deleteDocument, listDocuments, signedUrl, uploadDocument } from "@/lib/data";
import type { DocumentFile, Member, RefType } from "@/lib/types";
import { confirmDelete, ErrorText } from "./ui";

/** Danh sách ảnh/tệp đính kèm + nút tải lên (chụp từ camera trên điện thoại) */
export function Attachments({
  member,
  refType,
  refId,
  canEdit,
  compact,
}: {
  member: Member;
  refType: RefType;
  refId?: string | null;
  canEdit: boolean;
  compact?: boolean;
}) {
  const [docs, setDocs] = useState<(DocumentFile & { url?: string | null })[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const list = await listDocuments(member.id, refType, refId);
    const withUrls = await Promise.all(list.map(async (d) => ({ ...d, url: await signedUrl(d.storage_path) })));
    setDocs(withUrls);
  }, [member.id, refType, refId]);

  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, [load]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const f of Array.from(files)) {
        if (f.size > 10 * 1024 * 1024 && !f.type.startsWith("image/")) throw new Error(`${f.name}: tối đa 10MB`);
        await uploadDocument(member, f, refType, refId);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function onDelete(d: DocumentFile) {
    if (!confirmDelete("tệp này")) return;
    await deleteDocument(d);
    await load();
  }

  const size = compact ? "h-14 w-14" : "h-24 w-24";
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {docs.map((d) => (
          <div key={d.id} className={`group relative ${size} overflow-hidden rounded-lg border border-border bg-surface-2`}>
            {d.mime_type?.startsWith("image/") && d.url ? (
              <button type="button" onClick={() => setPreview(d.url!)} className="h-full w-full" aria-label={`Xem ${d.file_name ?? "ảnh"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.url} alt={d.file_name ?? ""} className="h-full w-full object-cover" />
              </button>
            ) : (
              <a href={d.url ?? "#"} target="_blank" rel="noreferrer" className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] text-text-2">
                📄 {d.file_name}
              </a>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => onDelete(d)}
                className="absolute right-0.5 top-0.5 hidden h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] text-white group-hover:flex"
                aria-label="Xóa tệp"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className={`${size} flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-text-2 hover:bg-surface-2`}
          >
            <span className="text-lg leading-none">{busy ? "…" : "📷"}</span>
            {!compact && (busy ? "Đang tải" : "Thêm ảnh")}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
      <ErrorText error={error} />
      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setPreview(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
